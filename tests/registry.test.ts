import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectRegistry } from '../app/server/registry.js';
import { newProjectSchema } from '../app/shared/projects.js';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-reg-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const data = path.join(dir, 'data');
  const builtin = path.join(dir, 'studio');
  const other = path.join(dir, 'autre projet');
  await mkdir(data);
  await mkdir(builtin);
  await mkdir(other);
  await writeFile(path.join(other, 'tokens.css'), ':root{--brand:#123456}');
  return { dir, data, builtin, other, registry: new ProjectRegistry(data, builtin) };
}
const input = (root: string, name = 'Autre projet') => ({
  name,
  root,
  source: { type: 'local' as const, url: '' },
  figma: { plugin: false, fileUrl: '' },
});

test('sans registre : Revela intégré seul, actif', async (t) => {
  const { registry, builtin } = await fixture(t);
  const r = await registry.list();
  assert.equal(r.active, 'revela');
  assert.deepEqual(
    r.projects.map((p) => [p.id, p.builtin, p.root]),
    [['revela', true, builtin]],
  );
});

test('ajout : dossier vérifié, identifiant lisible, dossier d’état créé, projet actif', async (t) => {
  const { registry, data, other } = await fixture(t);
  const p = await registry.add(input(other, 'Mon Projet Été'));
  assert.equal(p.id, 'mon-projet-ete');
  assert.ok((await stat(path.join(data, 'projects', 'mon-projet-ete'))).isDirectory());
  const r = await registry.list();
  assert.equal(r.active, 'mon-projet-ete');
  assert.equal(r.projects[1].exists, true);
  assert.equal(r.projects[1].git, null);
  // Le contenu du projet n'est ni lu ni modifié.
  assert.deepEqual(await readdir(other), ['tokens.css']);
});

test('refus : chemin relatif, dossier absent, doublon, dossier de DS-Studio', async (t) => {
  const { registry, other, builtin, dir } = await fixture(t);
  await assert.rejects(() => registry.add(input('autre projet')), /absolu/);
  await assert.rejects(() => registry.add(input(path.join(dir, 'absent'))), /introuvable/);
  await assert.rejects(() => registry.add(input(builtin)), /déjà un projet/);
  await registry.add(input(other));
  await assert.rejects(() => registry.add(input(other + path.sep, 'Bis')), /déjà un projet/);
  assert.equal((await registry.list()).projects.length, 2);
});

test('identifiants uniques, bascule, réglages Figma, retrait sans suppression', async (t) => {
  const { registry, dir, data } = await fixture(t);
  const a = path.join(dir, 'a');
  const b = path.join(dir, 'b');
  await mkdir(a);
  await mkdir(b);
  assert.equal((await registry.add(input(a, 'Site'))).id, 'site');
  assert.equal((await registry.add(input(b, 'Site'))).id, 'site-2');
  await registry.setActive('revela');
  assert.equal((await registry.list()).active, 'revela');
  await assert.rejects(() => registry.setActive('inconnu'), /inconnu/);
  await registry.updateFigma('site', { plugin: true, fileUrl: 'https://www.figma.com/design/x/y' });
  const site = (await registry.list()).projects.find((p) => p.id === 'site')!;
  assert.deepEqual(site.figma, { plugin: true, fileUrl: 'https://www.figma.com/design/x/y' });
  await assert.rejects(() => registry.remove('revela'), /intégré/);
  await registry.setActive('site');
  await registry.remove('site');
  const r = await registry.list();
  assert.equal(r.active, 'revela');
  assert.deepEqual(r.projects.map((p) => p.id), ['revela', 'site-2']);
  // Rien supprimé : ni le dossier du projet, ni son état.
  assert.ok((await stat(a)).isDirectory());
  assert.ok((await stat(path.join(data, 'projects', 'site'))).isDirectory());
});

test('état Git lu sans rien modifier', async (t) => {
  try {
    execFileSync('git', ['--version']);
  } catch {
    return t.skip('git absent');
  }
  const { registry, other } = await fixture(t);
  const g = (...a: string[]) => execFileSync('git', a, { cwd: other, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('remote', 'add', 'origin', 'https://github.com/exemple/depot.git');
  await registry.add(input(other));
  const p = (await registry.list()).projects[1];
  assert.deepEqual(p.git, {
    branch: 'main',
    remote: 'https://github.com/exemple/depot.git',
    dirty: 1,
  });
});

test('schéma : liens Figma et GitHub vérifiés', () => {
  const ok = newProjectSchema.safeParse({
    ...input('C:\\x'),
    source: { type: 'github', url: 'https://github.com/compte/depot' },
    figma: { plugin: true, fileUrl: 'https://www.figma.com/design/abc/Fichier' },
  });
  assert.ok(ok.success);
  assert.equal(
    newProjectSchema.safeParse({ ...input('C:\\x'), figma: { plugin: false, fileUrl: 'https://evil.example/x' } })
      .success,
    false,
  );
  assert.equal(
    newProjectSchema.safeParse({ ...input('C:\\x'), source: { type: 'github', url: 'git@github.com:a/b.git' } })
      .success,
    false,
  );
});
