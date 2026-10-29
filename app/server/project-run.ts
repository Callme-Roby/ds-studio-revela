import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
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
    // Outils qui acceptent --port : le port choisi par DS-Studio leur est passé.
    portFlag:
      !!script &&
      /\b(next|vite|astro|nuxt|nuxi|svelte-kit|remix|storybook|webpack serve|webpack-dev-server|ng serve)\b/.test(
        pkg.scripts![script],
      ),
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

  // port : serveur de dev sur ce port (variable PORT, et --port si l'outil
  // l'accepte), pour que deux projets n'affichent jamais le même serveur.
  async start(id: string, root: string, task: Task, port?: number) {
    const key = `${id}:${task}`;
    if (this.runs.get(key)?.child) throw new StudioError('Déjà en cours.', 409);
    const commands = await projectCommands(root);
    if (!commands)
      throw new StudioError('Pas de package.json dans ce projet.', 409);
    let command = task === 'install' ? commands.install : commands.dev;
    if (command && task === 'dev' && port && commands.portFlag)
      command += `${commands.manager === 'npm' ? ' --' : ''} --port ${port}`;
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
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        BROWSER: 'none',
        ...(task === 'dev' && port ? { PORT: String(port) } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    run.child = child;
    this.runs.set(key, run);
    let announced = false;
    const push = (b: Buffer) => {
      const text = b.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
      run.log.push(text);
      if (run.log.length > keep) run.log.splice(0, run.log.length - keep);
      // Première adresse locale annoncée seulement (les journaux de l'app
      // peuvent en citer d'autres ensuite).
      if (task === 'dev' && !announced) {
        const url = text.match(
          /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{2,5}/,
        )?.[0];
        if (url) {
          announced = true;
          this.onUrl?.(id, url.replace('127.0.0.1', 'localhost'));
        }
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

  // À l'arrêt de DS-Studio : synchrone, sinon le processus se termine avant
  // que les serveurs lancés soient arrêtés.
  stopAll() {
    for (const run of this.runs.values()) if (run.child) kill(run.child, true);
  }
}

// Arrête le processus et ses enfants (le serveur de dev lancé par npm).
function kill(child: ChildProcess, sync = false) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32')
      (sync ? spawnSync : spawn)(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { windowsHide: true, stdio: 'ignore' },
      );
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* Déjà terminé. */
  }
}

// Port libre sur ce poste (aucun serveur ne l'écoute).
export function portFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

// Port du serveur de dev d'un projet : le sien s'il n'est ni partagé avec un
// autre projet ni occupé, sinon le premier libre au-dessus.
export async function choosePort(own: number, others: number[]) {
  for (let p = own; p < own + 200 && p < 65536; p++)
    if (!others.includes(p) && (await portFree(p))) return p;
  throw new StudioError('Aucun port libre pour le serveur de dev.', 409);
}
