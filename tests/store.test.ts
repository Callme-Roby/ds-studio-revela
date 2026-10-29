import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  symlink,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../app/server/store.js';
import { tokensSchema, contrast } from '../app/shared/model.js';
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(dir, seed);
  await store.init();
  return { dir, store };
}
test('proposition sans écriture, commit, redémarrage réel du store et annulation sélective', async (t) => {
  const { dir, store } = await fixture(t);
  const before = await readFile(store.file, 'utf8');
  const p = store.propose(0, [{ key: 'color.brand', value: '#AA2255' }]);
  assert.equal(await readFile(store.file, 'utf8'), before);
  await store.commit(p.id);
  const r = store.propose(1, [{ key: 'space.md', value: 22 }]);
  await store.commit(r.id);
  const reopened = new Store(dir, seed);
  await reopened.init();
  assert.equal(reopened.snapshot().tokens['color.brand'].$value, '#AA2255');
  const undo = reopened.proposeUndo(2, p.id);
  await reopened.commit(undo.id);
  assert.equal(
    reopened.snapshot().tokens['color.brand'].$value,
    seed['color.brand'].$value,
  );
  assert.equal(reopened.snapshot().tokens['space.md'].$value, 22);
  assert.equal(reopened.snapshot().history.length, 3);
});
test('concurrence : une seule proposition de la même révision peut être acceptée', async (t) => {
  const { store } = await fixture(t);
  const a = store.propose(0, [{ key: 'color.brand', value: '#112233' }]);
  const b = store.propose(0, [{ key: 'space.sm', value: 9 }]);
  const results = await Promise.allSettled([
    store.commit(a.id),
    store.commit(b.id),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(store.snapshot().revision, 1);
  await assert.rejects(() => store.commit(a.id), /inconnue/);
  assert.throws(
    () => store.propose(0, [{ key: 'space.sm', value: 4 }]),
    /changé/,
  );
});
test('annulation refuse de perdre un changement plus récent du même token', async (t) => {
  const { store } = await fixture(t);
  const p = store.propose(0, [{ key: 'color.brand', value: '#112233' }]);
  await store.commit(p.id);
  await store.commit(
    store.propose(1, [{ key: 'color.brand', value: '#445566' }]).id,
  );
  assert.throws(() => store.proposeUndo(2, p.id), /Conflit/);
});
test('entrées, imports et types invalides sont rejetés sans effet disque', async (t) => {
  const { store } = await fixture(t);
  const raw = await readFile(store.file, 'utf8');
  for (const value of ['red', 'url(https://invalid.test)', 12, '#FFF'])
    assert.throws(() => store.propose(0, [{ key: 'color.brand', value }]));
  for (const value of [-1, 129, Infinity, '18'])
    assert.throws(() => store.propose(0, [{ key: 'space.md', value }]));
  assert.throws(
    () =>
      store.propose(0, [
        { key: 'space.md', value: 12 },
        { key: 'space.md', value: 14 },
      ]),
    /deux fois/,
  );
  assert.throws(() => store.proposeImport(0, {}));
  assert.throws(() => store.proposeImport(0, { ...seed, secret: 'no' }));
  assert.throws(() =>
    store.propose(0, [{ key: 'font.family', value: 'url(evil)' }]),
  );
  assert.equal(await readFile(store.file, 'utf8'), raw);
});
test('import local passe par le même diff et la validation', async (t) => {
  const { store } = await fixture(t);
  const tokens = structuredClone(seed);
  tokens['color.brand'].$value = '#774422';
  tokens['space.md'].$value = 20;
  const p = store.proposeImport(0, tokens);
  assert.equal(p.source, 'import');
  assert.equal(p.patches.length, 2);
  assert.equal(store.snapshot().revision, 0);
  await store.commit(p.id);
  assert.deepEqual(store.snapshot().tokens, tokens);
});
test('fichier corrompu et historique falsifié préservés sans reset silencieux', async (t) => {
  const { dir, store } = await fixture(t);
  for (const raw of [
    '{bad',
    JSON.stringify({ ...store.snapshot(), revision: 42 }),
  ]) {
    await writeFile(store.file, raw);
    await assert.rejects(
      () => new Store(dir, seed).init(),
      /original préservé/,
    );
    assert.equal(await readFile(store.file, 'utf8'), raw);
  }
});
test('modification extérieure détectée avant écrasement', async (t) => {
  const { store } = await fixture(t);
  const p = store.propose(0, [{ key: 'space.sm', value: 9 }]);
  await writeFile(store.file, 'changed externally');
  await assert.rejects(() => store.commit(p.id), /hors application/);
  assert.equal(await readFile(store.file, 'utf8'), 'changed externally');
});
test(
  'symlink vers un dossier externe refusé',
  {
    skip:
      process.platform === 'win32'
        ? 'Droits symlink Windows à qualifier'
        : false,
  },
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ds-links-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await mkdir(path.join(dir, 'target'));
    await symlink(path.join(dir, 'target'), path.join(dir, 'link'));
    await assert.rejects(
      () => new Store(path.join(dir, 'link'), seed).init(),
      /symbolique refusé/,
    );
  },
);
// État v1 réaliste : 18 clés, deux révisions dont une à annuler après migration.
function v1State() {
  const keys = Object.keys(seed).slice(0, 18) as (keyof typeof seed)[];
  const tokens = Object.fromEntries(keys.map((k) => [k, structuredClone(seed[k])]));
  tokens['color.brand'] = { $type: 'color', $value: '#8A3B20' };
  tokens['space.md'] = { $type: 'dimension', $value: 20 };
  const event = (revision: number, key: string, before: unknown, after: unknown) => ({
    id: crypto.randomUUID(),
    revision,
    date: new Date().toISOString(),
    source: 'manual',
    patches: [{ key, before, after }],
  });
  return {
    version: 1,
    revision: 2,
    tokens,
    history: [
      event(1, 'color.brand', seed['color.brand'].$value, '#8A3B20'),
      event(2, 'space.md', seed['space.md'].$value, 20),
    ],
  };
}
test('migration v1 → v2 : original archivé, valeurs et historique conservés, annulation possible', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const original = JSON.stringify(v1State(), null, 2) + '\n';
  await writeFile(path.join(dir, 'state.json'), original);
  const store = new Store(dir, seed);
  await store.init();
  const state = store.snapshot();
  assert.equal(state.version, 2);
  assert.equal(state.revision, 2);
  assert.equal(state.history.length, 2);
  assert.equal(state.tokens['color.brand'].$value, '#8A3B20');
  assert.equal(state.tokens['space.md'].$value, 20);
  assert.equal(state.tokens['color.borderStrong'].$value, '#8A8A8A');
  assert.equal(Object.keys(state.tokens).length, Object.keys(seed).length);
  const archives = (await readdir(dir)).filter((f) =>
    f.startsWith('state-v1-preserved-'),
  );
  assert.equal(archives.length, 1);
  assert.equal(await readFile(path.join(dir, archives[0]), 'utf8'), original);
  assert.equal(JSON.parse(await readFile(store.file, 'utf8')).version, 2);
  // Une révision v1 reste annulable et une nouvelle clé se modifie normalement.
  await store.commit(store.proposeUndo(2, state.history[0].id).id);
  await store.commit(
    store.propose(3, [{ key: 'color.warning', value: '#7A4A00' }]).id,
  );
  const reopened = new Store(dir, seed);
  await reopened.init();
  assert.equal(reopened.snapshot().tokens['color.brand'].$value, seed['color.brand'].$value);
  assert.equal(reopened.snapshot().tokens['color.warning'].$value, '#7A4A00');
  assert.equal(
    (await readdir(dir)).filter((f) => f.startsWith('state-v1-preserved-')).length,
    1,
    'Un état déjà migré ne crée pas de nouvelle archive',
  );
});
test('copie précédente v1 restaurée puis migrée au démarrage suivant', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { restorePrevious } = await import('../app/server/store.js');
  const v1 = JSON.stringify(v1State(), null, 2) + '\n';
  await writeFile(path.join(dir, 'state.json'), '{interruption');
  await writeFile(path.join(dir, 'state.previous.json'), v1);
  assert.equal((await restorePrevious(dir)).revision, 2);
  const store = new Store(dir, seed);
  await store.init();
  assert.equal(store.snapshot().version, 2);
  assert.equal(store.snapshot().tokens['color.brand'].$value, '#8A3B20');
});
test('état v1 falsifié : migration refusée et original intact', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-migrate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const bad of [
    { ...v1State(), tokens: { ...v1State().tokens, 'color.pick': { $type: 'color', $value: '#000000' } } },
    { ...v1State(), revision: 7 },
    { ...v1State(), version: 3 },
  ]) {
    const raw = JSON.stringify(bad);
    await writeFile(path.join(dir, 'state.json'), raw);
    await assert.rejects(() => new Store(dir, seed).init(), /original préservé/);
    assert.equal(await readFile(path.join(dir, 'state.json'), 'utf8'), raw);
    assert.deepEqual(
      (await readdir(dir)).filter((f) => f.startsWith('state-v1-preserved-')),
      [],
    );
  }
});
test('contraste noir/blanc et identité', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#123456', '#123456'), 1);
});

test('copie précédente complète, restauration explicite et original corrompu archivé', async (t) => {
  const { store, dir } = await fixture(t);
  const { restorePrevious } = await import('../app/server/store.js');
  const original = await readFile(store.file, 'utf8');
  await store.commit(
    store.propose(0, [{ key: 'color.brand', value: '#445566' }]).id,
  );
  assert.equal(
    await readFile(path.join(dir, 'state.previous.json'), 'utf8'),
    original,
  );
  await writeFile(store.file, '{interruption');
  const restored = await restorePrevious(dir);
  assert.equal(restored.revision, 0);
  assert.equal(
    await readFile(path.join(dir, restored.preserved), 'utf8'),
    '{interruption',
  );
  assert.equal(await readFile(store.file, 'utf8'), original);
  const reopened = new Store(dir, {
    ...seed,
    'color.brand': { $type: 'color', $value: '#000000' },
  });
  await reopened.init();
  assert.equal(
    reopened.snapshot().tokens['color.brand'].$value,
    seed['color.brand'].$value,
    'Une mise à jour du seed ne réinitialise jamais un état existant',
  );
});

test('copie précédente falsifiée : restauration refusée sans toucher l’original', async (t) => {
  const { store, dir } = await fixture(t);
  const { restorePrevious } = await import('../app/server/store.js');
  const original = await readFile(store.file, 'utf8');
  await writeFile(path.join(dir, 'state.previous.json'), '{invalid');
  await assert.rejects(() => restorePrevious(dir));
  assert.equal(await readFile(store.file, 'utf8'), original);
});

test('échec de sauvegarde : commit non appliqué et brouillon encore validable', async (t) => {
  const { store, dir } = await fixture(t);
  const original = await readFile(store.file, 'utf8');
  const backup = path.join(dir, 'state.previous.json');
  await mkdir(backup);
  const p = store.propose(0, [{ key: 'space.md', value: 24 }]);
  await assert.rejects(() => store.commit(p.id));
  assert.equal(store.snapshot().revision, 0);
  assert.equal(await readFile(store.file, 'utf8'), original);
  await rm(backup, { recursive: true });
  await store.commit(p.id);
  assert.equal(store.snapshot().revision, 1);
});

test(
  'lien ajouté après ouverture : commit refusé sans lire ni modifier sa cible',
  {
    skip:
      process.platform === 'win32'
        ? 'Droits symlink non accordés sur Windows'
        : false,
  },
  async (t) => {
    const { store, dir } = await fixture(t);
    const target = path.join(dir, 'outside.json');
    const original = await readFile(store.file, 'utf8');
    await writeFile(target, original);
    await rm(store.file);
    await symlink(target, store.file);
    const p = store.propose(0, [{ key: 'space.md', value: 24 }]);
    await assert.rejects(() => store.commit(p.id));
    assert.equal(await readFile(target, 'utf8'), original);
  },
);
