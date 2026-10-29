import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectRegistry } from '../app/server/registry.js';
import { ExternalTokens } from '../app/server/external-tokens.js';

const css = `:root {
  --brand: #3355FF;
  --space-md: 16px;
}
.btn { background: var(--brand); }
`;
const json = `{
  "color": { "accent": { "$value": "#FF0066", "$type": "color" } }
}
`;

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-ext-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'site');
  await mkdir(path.join(root, 'src', 'styles'), { recursive: true });
  await writeFile(path.join(root, 'src', 'styles', 'tokens.css'), css);
  await writeFile(path.join(root, 'tokens.json'), json);
  await mkdir(path.join(dir, 'data'));
  const registry = new ProjectRegistry(
    path.join(dir, 'data'),
    path.join(dir, 'studio'),
  );
  await registry.add({
    name: 'Site',
    root,
    source: { type: 'local', url: '' },
    figma: { plugin: false, fileUrl: '' },
  });
  await registry.setSources('site', [
    { file: 'src/styles/tokens.css', format: 'css' },
    { file: 'tokens.json', format: 'json' },
  ]);
  const service = async () =>
    new ExternalTokens(
      await registry.project('site'),
      registry.stateDir('site'),
    );
  return { dir, root, registry, service };
}

test('lecture : tokens de plusieurs fichiers, avec fichier et ligne', async (t) => {
  const { service } = await fixture(t);
  const { tokens, sources } = await (await service()).read();
  assert.deepEqual(
    tokens.map((x) => [x.id, x.value, x.type, x.line]),
    [
      ['src/styles/tokens.css#brand', '#3355FF', 'color', 2],
      ['src/styles/tokens.css#space-md', '16px', 'dimension', 3],
      ['tokens.json#color.accent', '#FF0066', 'color', 2],
    ],
  );
  assert.deepEqual(
    sources.map((s) => s.count),
    [2, 1],
  );
});

test('proposition sans écriture, validation sur place relue, journal, annulation', async (t) => {
  const { root, service } = await fixture(t);
  const s = await service();
  const p = await s.propose([
    { id: 'src/styles/tokens.css#brand', value: '#112233' },
    { id: 'tokens.json#color.accent', value: '#00AA55' },
  ]);
  assert.equal(p.patches.length, 2);
  assert.equal(
    await readFile(path.join(root, 'src/styles/tokens.css'), 'utf8'),
    css,
  );
  const entry = await s.commit(p.id);
  assert.equal(entry.revision, 1);
  assert.equal(
    await readFile(path.join(root, 'src/styles/tokens.css'), 'utf8'),
    css.replace('#3355FF', '#112233'),
  );
  assert.equal(
    JSON.parse(await readFile(path.join(root, 'tokens.json'), 'utf8')).color
      .accent.$value,
    '#00AA55',
  );
  const undo = await s.undo(entry.id);
  await s.commit(undo.id);
  assert.equal(
    await readFile(path.join(root, 'src/styles/tokens.css'), 'utf8'),
    css,
  );
  assert.deepEqual(
    (await s.history()).map((h) => [h.revision, h.source]),
    [
      [2, 'undo'],
      [1, 'manual'],
    ],
  );
});

test('refus : valeur invalide ou dangereuse, token inconnu, fichier modifié entre-temps', async (t) => {
  const { root, service } = await fixture(t);
  const s = await service();
  await assert.rejects(
    () => s.propose([{ id: 'src/styles/tokens.css#brand', value: 'bleu' }]),
    /Couleur/,
  );
  await assert.rejects(
    () =>
      s.propose([
        {
          id: 'src/styles/tokens.css#space-md',
          value: '1px; } body { display: none',
        },
      ]),
    /interdits/,
  );
  await assert.rejects(
    () => s.propose([{ id: 'x.css#y', value: '1px' }]),
    /inconnu/,
  );
  await assert.rejects(
    () => s.propose([{ id: 'src/styles/tokens.css#brand', value: '#3355FF' }]),
    /Aucun changement/,
  );
  const p = await s.propose([
    { id: 'src/styles/tokens.css#space-md', value: '20px' },
  ]);
  await writeFile(
    path.join(root, 'src/styles/tokens.css'),
    css.replace('16px', '18px'),
  );
  await assert.rejects(() => s.commit(p.id), /a changé depuis la proposition/);
  assert.match(
    await readFile(path.join(root, 'src/styles/tokens.css'), 'utf8'),
    /18px/,
  );
});

test('sources : chemins hors du projet, absolus ou par lien refusés', async (t) => {
  const { dir, root, registry } = await fixture(t);
  await writeFile(path.join(dir, 'secret.css'), ':root{--x:1px}');
  await assert.rejects(
    () => registry.setSources('site', [{ file: 'absent.css', format: 'css' }]),
    /introuvable/,
  );
  await assert.rejects(
    () =>
      registry.setSources('site', [{ file: '../secret.css', format: 'css' }]),
    /hors du dossier|introuvable/,
  );
  try {
    await symlink(path.join(dir, 'secret.css'), path.join(root, 'lien.css'));
  } catch {
    return t.diagnostic('liens symboliques non disponibles ici');
  }
  await assert.rejects(
    () => registry.setSources('site', [{ file: 'lien.css', format: 'css' }]),
    /hors du dossier|symbolique/,
  );
});

test('une proposition d’un projet ne se valide pas dans un autre', async (t) => {
  const { dir, registry, service } = await fixture(t);
  const other = path.join(dir, 'autre');
  await mkdir(other);
  await writeFile(path.join(other, 'tokens.css'), css);
  await registry.add({
    name: 'Autre',
    root: other,
    source: { type: 'local', url: '' },
    figma: { plugin: false, fileUrl: '' },
  });
  await registry.setSources('autre', [{ file: 'tokens.css', format: 'css' }]);
  const p = await (
    await service()
  ).propose([{ id: 'src/styles/tokens.css#brand', value: '#000000' }]);
  const autre = new ExternalTokens(
    await registry.project('autre'),
    registry.stateDir('autre'),
  );
  await assert.rejects(() => autre.commit(p.id), /autre projet/);
});
