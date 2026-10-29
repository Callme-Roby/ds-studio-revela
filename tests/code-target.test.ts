import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../app/server/store.js';
import { tokensSchema } from '../app/shared/model.js';
import { CodeTarget, readGenerated } from '../app/server/code-target.js';
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);
// Dossier de données DS-Studio + faux renderer Revela, configurés comme en vrai.
async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  configure = true,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-code-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const data = path.join(dir, 'data');
  const renderer = path.join(dir, 'revela', 'renderer');
  await mkdir(renderer, { recursive: true });
  const store = new Store(data, seed);
  await store.init();
  const file = path.join(renderer, 'tokens.css');
  if (configure)
    await writeFile(
      path.join(data, 'code-target.json'),
      JSON.stringify({ file }),
    );
  return { data, file, store, code: new CodeTarget(data, () => store.snapshot()) };
}
test('sans configuration : aucune écriture, statut non configuré', async (t) => {
  const { code } = await fixture(t, false);
  assert.deepEqual(await code.status(), { configured: false });
  assert.equal((await code.write()).status, 'disabled');
});
test('sans configuration mais DS du dépôt : écrit dans la cible par défaut', async (t) => {
  const { data, file, store } = await fixture(t, false);
  const code = new CodeTarget(data, () => store.snapshot(), file);
  assert.equal((await code.write()).status, 'written');
  assert.equal(readGenerated(await readFile(file, 'utf8'))?.revision, 0);
  // code-target.json reste prioritaire sur la cible par défaut.
  const other = path.join(path.dirname(file), '..', 'tokens.css');
  await writeFile(path.join(data, 'code-target.json'), JSON.stringify({ file: other }));
  assert.equal((await code.write()).file, other);
});
test('le DS livré est synchronisé avec le seed (révision 0)', async () => {
  const raw = await readFile(new URL('../ds/tokens.css', import.meta.url), 'utf8');
  const { renderCss } = await import('../app/server/code-target.js');
  assert.equal(raw, renderCss(seed, 0));
});
test('écriture relue après validation, puis mise à jour à la révision suivante', async (t) => {
  const { code, file, store } = await fixture(t);
  assert.equal((await code.status()).configured && (await code.status() as { state: string }).state, 'absent');
  const first = await code.write();
  assert.equal(first.status, 'written');
  const raw = await readFile(file, 'utf8');
  assert.deepEqual(readGenerated(raw), { revision: 0, intact: true });
  assert.match(raw, /--color-brand: #111111;/);
  assert.match(raw, /--font-body: 14px;/);
  assert.match(raw, /--font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;/);
  assert.match(raw, /--ink-mute: var\(--color-muted\);/);
  assert.equal((await code.status() as { state: string }).state, 'synced');
  await store.commit(
    store.propose(0, [{ key: 'color.warning', value: '#7A4A00' }]).id,
  );
  assert.equal((await code.status() as { state: string }).state, 'outdated');
  assert.equal((await code.write()).status, 'written');
  const next = await readFile(file, 'utf8');
  assert.equal(readGenerated(next)?.revision, 1);
  assert.match(next, /--color-warning: #7A4A00;/);
});
test('fichier modifié à la main ou étranger : jamais écrasé', async (t) => {
  const { code, file } = await fixture(t);
  await code.write();
  const edited = (await readFile(file, 'utf8')).replace('#111111', '#222222');
  await writeFile(file, edited);
  assert.equal((await code.status() as { state: string }).state, 'modified');
  assert.equal((await code.write()).status, 'refused');
  assert.equal(await readFile(file, 'utf8'), edited);
  await writeFile(file, ':root { --ink: red; }\n');
  assert.equal((await code.status() as { state: string }).state, 'foreign');
  assert.equal((await code.write()).status, 'refused');
  assert.equal(await readFile(file, 'utf8'), ':root { --ink: red; }\n');
});
test('configuration invalide : refus sans écriture', async (t) => {
  const { code, data, file } = await fixture(t);
  for (const bad of [
    { file: 'relatif/tokens.css' },
    { file: path.join(path.dirname(file), 'index.css') },
    { file: path.join(path.dirname(file), 'absent', 'tokens.css') },
    { file, extra: true },
  ]) {
    await writeFile(path.join(data, 'code-target.json'), JSON.stringify(bad));
    const r = await code.write();
    assert.equal(r.status, 'refused');
    await assert.rejects(readFile(file, 'utf8'));
  }
});
test('validations rapprochées : le fichier finit sur la dernière révision', async (t) => {
  const { code, file, store } = await fixture(t);
  await store.commit(store.propose(0, [{ key: 'space.xs', value: 5 }]).id);
  const a = code.write();
  await store.commit(store.propose(1, [{ key: 'space.xs', value: 6 }]).id);
  const b = code.write();
  await Promise.all([a, b]);
  const raw = await readFile(file, 'utf8');
  assert.equal(readGenerated(raw)?.revision, 2);
  assert.match(raw, /--space-xs: 6px;/);
});
