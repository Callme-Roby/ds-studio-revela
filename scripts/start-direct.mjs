// Démarrage en un double-clic (« Lancer DS-Studio ») : installe les dépendances
// si elles manquent, recompile si l'interface ou le DS ont changé, démarre le
// serveur puis ouvre le navigateur. Si DS-Studio tourne déjà, l'ouvre seulement.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 4310);
const url = `http://127.0.0.1:${port}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error('DS-Studio nécessite Node.js 22.12 ou supérieur (LTS conseillé).');
  process.exit(1);
}

function run(args, label) {
  console.log(`\n${label}…`);
  // Arguments fixes : le shell sert seulement à trouver npm.cmd sous Windows.
  const r = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\nÉchec : npm ${args.join(' ')}. Voir README.md.`);
    process.exit(1);
  }
}

function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

function open() {
  if (process.env.DS_STUDIO_NO_OPEN) return;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

async function running() {
  try {
    const r = await fetch(`${url}/api/bootstrap`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

if (await running()) {
  console.log(`DS-Studio tourne déjà : ouverture de ${url}`);
  open();
  process.exit(0);
}

if (!existsSync(path.join(root, 'node_modules/tsx/dist/cli.mjs')))
  run(['ci'], 'Première installation des dépendances (Internet nécessaire)');

const built = path.join(root, 'dist/index.html');
const sources = Math.max(
  newest(path.join(root, 'app/client')),
  newest(path.join(root, 'ds/src')),
  statSync(path.join(root, 'index.html')).mtimeMs,
);
if (!existsSync(built) || statSync(built).mtimeMs < sources)
  run(['run', 'build'], "Compilation de l'interface");

console.log(`\nDémarrage de DS-Studio sur ${url}`);
const child = spawn(
  process.execPath,
  ['--import', 'tsx', path.join(root, 'app/server/index.ts')],
  { cwd: root, stdio: 'inherit', env: process.env },
);
child.on('exit', (code) => {
  if (code) console.error('\nDS-Studio s’est arrêté. Lisez le message ci-dessus.');
  process.exitCode = code ?? 0;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    // Windows transmet déjà Ctrl+C au serveur de cette console.
    if (process.platform !== 'win32') child.kill(signal);
  });

for (let i = 0; i < 60 && child.exitCode === null; i++) {
  if (await running()) {
    console.log('Navigateur ouvert. Gardez cette fenêtre ouverte ; Ctrl+C arrête DS-Studio.');
    open();
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
