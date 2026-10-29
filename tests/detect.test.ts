import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectProject } from '../app/server/detect.js';
import { SettingsStore } from '../app/server/settings.js';

async function write(root: string, rel: string, text: string) {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), text);
}

test('détection : tokens et dossiers de composants probables, dossiers techniques ignorés', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-detect-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await write(
    root,
    'src/styles/tokens.css',
    ':root{--a:#000;--b:4px;--c:#fff}',
  );
  await write(root, 'src/app.css', ':root{--x:1px;--y:2px}\nbody{margin:0}');
  await write(root, 'src/one.css', ':root{--seul:1px}');
  await write(
    root,
    'design-tokens.json',
    '{"color":{"a":"#000","b":"#111","c":"#222"}}',
  );
  await write(
    root,
    'package.json',
    '{"name":"x","version":"1.0.0","scripts":{"dev":"vite","test":"vitest"}}',
  );
  await write(root, 'src/components/Card/Card.tsx', 'export {}');
  await write(root, 'src/components/Card/Card.css', '.c{}');
  await write(root, 'src/ui/Button.vue', '<template/>');
  await write(root, 'node_modules/lib/components/X.tsx', 'x');
  await write(root, 'node_modules/lib/tokens.css', ':root{--n:1px;--m:2px}');
  await write(root, '.storybook/theme.css', ':root{--s:1px;--t:2px}');
  const d = await detectProject(root);
  assert.deepEqual(
    d.tokens.map((x) => [x.file, x.format, x.count]),
    [
      ['design-tokens.json', 'json', 3],
      ['src/styles/tokens.css', 'css', 3],
      ['src/app.css', 'css', 2],
    ],
  );
  assert.deepEqual(
    d.components.map((c) => [c.dir, c.files]),
    [
      ['src/components', 2],
      ['src/ui', 1],
    ],
  );
  assert.deepEqual(d.scripts, [{ name: 'dev', command: 'vite' }]);
  assert.equal(d.truncated, false);
});

test('réglages : valeurs par défaut, mise à jour partielle, valeur inconnue refusée', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-settings-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const s = new SettingsStore(dir);
  assert.deepEqual(await s.read(), { onboarded: false, agent: 'claude' });
  assert.deepEqual(await s.update({ agent: 'none' }), {
    onboarded: false,
    agent: 'none',
  });
  assert.deepEqual(await s.update({ onboarded: true }), {
    onboarded: true,
    agent: 'none',
  });
  await assert.rejects(() => s.update({ agent: 'gpt' as 'none' }));
  assert.deepEqual(await new SettingsStore(dir).read(), {
    onboarded: true,
    agent: 'none',
  });
});
