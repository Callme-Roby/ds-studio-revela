import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cloneRepo, gitFetch, gitPush, gitStatus } from '../app/server/project-git.js';
import { ComponentStore } from '../app/server/components.js';
import { gitCommitter } from '../app/server/git.js';

let hasGit = true;
try {
  execFileSync('git', ['--version']);
} catch {
  hasGit = false;
}
const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

// Projet local + dépôt « origin » nu sur disque : aucun réseau.
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-git-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'site');
  g(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  await mkdir(path.join(work, 'src', 'components'), { recursive: true });
  g(work, 'init', '-q', '-b', 'main');
  g(work, 'config', 'user.email', 'test@example.invalid');
  g(work, 'config', 'user.name', 'Test');
  g(work, 'config', 'core.autocrlf', 'false');
  await writeFile(path.join(work, 'src', 'components', 'Button.vue'), '<template><button>Ok</button></template>\n');
  await writeFile(path.join(work, 'notes.md'), 'hors composants\n');
  g(work, 'add', '-A');
  g(work, 'commit', '-qm', 'base');
  g(work, 'remote', 'add', 'origin', origin);
  return { dir, origin, work };
}

test('clonage : URL GitHub et dossier de destination vérifiés avant tout réseau', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-clone-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => cloneRepo('https://evil.example/a/b', path.join(dir, 'x')), /URL GitHub/);
  await assert.rejects(() => cloneRepo('file:///etc', path.join(dir, 'x')), /URL GitHub/);
  await assert.rejects(() => cloneRepo('https://github.com/a/b', 'relatif'), /absolu/);
  await assert.rejects(() => cloneRepo('https://github.com/a/b', path.join(dir, 'absent', 'x')), /parent/);
  await writeFile(path.join(dir, 'plein.txt'), 'x');
  await assert.rejects(() => cloneRepo('https://github.com/a/b', dir), /pas vide/);
});

test('état, première publication, commits en avance, envoi au clic, jamais si le distant a avancé', async (t) => {
  if (!hasGit) return t.skip('git absent');
  const { dir, origin, work } = await fixture(t);
  let s = await gitStatus(work);
  assert.equal(s.repo, true);
  assert.equal(s.branch, 'main');
  assert.equal(s.upstream, undefined);
  // Branche sans suivi : la première publication crée origin/main.
  s = await gitPush(work);
  assert.deepEqual([s.upstream, s.ahead, s.behind], ['origin/main', 0, 0]);
  await assert.rejects(() => gitPush(work), /Rien à pousser/);
  await writeFile(path.join(work, 'notes.md'), 'v2\n');
  g(work, 'commit', '-qam', 'v2');
  assert.equal((await gitStatus(work)).ahead, 1);
  s = await gitPush(work);
  assert.equal(s.ahead, 0);
  assert.equal(g(dir, '--git-dir', origin, 'log', '-1', '--format=%s'), 'v2');
  // Quelqu'un d'autre pousse : l'envoi est refusé tant qu'on n'a pas récupéré.
  const other = path.join(dir, 'autre');
  g(dir, 'clone', '-q', origin, other);
  g(other, 'config', 'user.email', 'b@example.invalid');
  g(other, 'config', 'user.name', 'B');
  await writeFile(path.join(other, 'notes.md'), 'v3\n');
  g(other, 'commit', '-qam', 'v3');
  g(other, 'push', '-q');
  await writeFile(path.join(work, 'notes.md'), 'local\n');
  g(work, 'commit', '-qam', 'local');
  s = await gitFetch(work);
  assert.deepEqual([s.ahead, s.behind], [1, 1]);
  await assert.rejects(() => gitPush(work), /récupérez-les d’abord/);
  assert.equal(g(dir, '--git-dir', origin, 'log', '-1', '--format=%s'), 'v3');
});

test('pas un dépôt Git : état sans erreur', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-nogit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await gitStatus(dir), { repo: false });
});

test('composants d’un projet externe : dossiers déclarés seulement, commit des seuls fichiers validés', async (t) => {
  if (!hasGit) return t.skip('git absent');
  const { work, dir } = await fixture(t);
  await mkdir(path.join(work, 'src', 'components', 'node_modules'), { recursive: true });
  await writeFile(path.join(work, 'src', 'components', 'node_modules', 'x.vue'), 'x');
  await mkdir(path.join(dir, 'state'));
  const store = new ComponentStore(work, path.join(dir, 'state'), path.join(dir, 'preview'), undefined, gitCommitter(work), {
    dirs: ['src/components'],
    extensions: ['vue', 'css'],
  });
  assert.deepEqual((await store.list()).map((f) => f.path), ['src/components/Button.vue']);
  for (const bad of ['notes.md', 'src/components/../../notes.md', 'src/components/node_modules/x.vue', 'src/autre/A.vue'])
    await assert.rejects(() => store.propose([{ path: bad, content: 'x' }], 'manual'), /refusé/, bad);
  // Un fichier indexé hors validation ne part pas dans le commit.
  await writeFile(path.join(work, 'notes.md'), 'indexé à part\n');
  g(work, 'add', 'notes.md');
  const p = await store.propose(
    [{ path: 'src/components/Button.vue', content: '<template><button>Valider</button></template>\n' }],
    'manual',
    'Libellé',
  );
  const r = await store.commit(p.id, true);
  assert.equal(r.git?.ok, true, r.git?.detail ?? '');
  assert.equal(g(work, 'show', '--name-only', '--format=', 'HEAD'), 'src/components/Button.vue');
  assert.match(g(work, 'status', '--short'), /^M {2}notes\.md$/m);
  assert.match(await readFile(path.join(work, 'src/components/Button.vue'), 'utf8'), /Valider/);
});
