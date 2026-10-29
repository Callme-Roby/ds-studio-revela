import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StudioError } from './store.js';

// Commandes d'un projet externe lancées au clic par l'étudiant : installation
// des dépendances et serveur de développement, rien d'autre. Les commandes
// sont fixes (gestionnaire détecté par le fichier de verrou, script « dev »
// ou « start » du package.json) ; aucune saisie libre n'est exécutée. La
// sortie est gardée en mémoire (fin seulement) et le processus est arrêtable.

export type Task = 'install' | 'dev';
type Run = {
  child: ChildProcess | null;
  command: string;
  log: string[];
  code: number | null;
  started: string;
};

const keep = 300;

export async function projectCommands(root: string) {
  const has = (f: string) =>
    fs
      .access(path.join(root, f))
      .then(() => true)
      .catch(() => false);
  let pkg: { scripts?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(
      await fs.readFile(path.join(root, 'package.json'), 'utf8'),
    );
  } catch {
    return null;
  }
  const manager = (await has('pnpm-lock.yaml'))
    ? 'pnpm'
    : (await has('yarn.lock'))
      ? 'yarn'
      : (await has('bun.lockb')) || (await has('bun.lock'))
        ? 'bun'
        : 'npm';
  const script = ['dev', 'start', 'serve'].find((s) => pkg.scripts?.[s]);
  const envExample = (
    await Promise.all(
      ['.env.example', '.env.sample', '.env.template'].map(async (f) =>
        (await has(f)) ? f : null,
      ),
    )
  ).find(Boolean);
  const envFile = (
    await Promise.all(
      ['.env', '.env.local', '.env.development', '.env.development.local'].map(
        async (f) => ((await has(f)) ? f : null),
      ),
    )
  ).find(Boolean);
  return {
    manager,
    install: `${manager} install`,
    dev: script ? `${manager} run ${script}` : null,
    installed: await has('node_modules'),
    envExample: envExample ?? null,
    envFile: envFile ?? null,
  };
}

export class ProjectRunner {
  private runs = new Map<string, Run>();
  // Adresse locale annoncée par le serveur de dev (port libre choisi par lui).
  constructor(private onUrl?: (id: string, url: string) => void) {}

  status(id: string) {
    const view = (task: Task) => {
      const r = this.runs.get(`${id}:${task}`);
      return r
        ? {
            running: !!r.child,
            command: r.command,
            code: r.code,
            started: r.started,
            log: r.log.join('').slice(-12_000),
          }
        : null;
    };
    return { install: view('install'), dev: view('dev') };
  }

  async start(id: string, root: string, task: Task) {
    const key = `${id}:${task}`;
    if (this.runs.get(key)?.child) throw new StudioError('Déjà en cours.', 409);
    const commands = await projectCommands(root);
    if (!commands)
      throw new StudioError('Pas de package.json dans ce projet.', 409);
    const command = task === 'install' ? commands.install : commands.dev;
    if (!command)
      throw new StudioError(
        'Aucun script dev, start ou serve dans le package.json.',
        409,
      );
    const run: Run = {
      child: null,
      command,
      log: [`> ${command}\n`],
      code: null,
      started: new Date().toISOString(),
    };
    // Commande fixe, sans saisie : le shell sert à trouver npm.cmd sous Windows.
    const child = spawn(command, {
      cwd: root,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, FORCE_COLOR: '0', BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.child = child;
    this.runs.set(key, run);
    const push = (b: Buffer) => {
      const text = b.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
      run.log.push(text);
      if (run.log.length > keep) run.log.splice(0, run.log.length - keep);
      if (task === 'dev') {
        const url = text.match(
          /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{2,5}/,
        )?.[0];
        if (url) this.onUrl?.(id, url.replace('127.0.0.1', 'localhost'));
      }
    };
    child.stdout!.on('data', push);
    child.stderr!.on('data', push);
    child.on('error', (e) => {
      run.log.push(`\n${e.message}\n`);
      run.child = null;
      run.code = -1;
    });
    child.on('exit', (code) => {
      run.log.push(`\n[terminé, code ${code ?? 'arrêt'}]\n`);
      run.child = null;
      run.code = code ?? -1;
    });
    return this.status(id);
  }

  stop(id: string, task: Task) {
    const run = this.runs.get(`${id}:${task}`);
    if (run?.child) kill(run.child);
    return this.status(id);
  }

  stopAll() {
    for (const run of this.runs.values()) if (run.child) kill(run.child);
  }
}

// Arrête le processus et ses enfants (le serveur de dev lancé par npm).
function kill(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* Déjà terminé. */
  }
}
