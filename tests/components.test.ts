import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ComponentStore,
  type PreviewBuilder,
} from '../app/server/components.js';
import { gitCommitter } from '../app/server/git.js';
import { diffLines, hunks } from '../app/shared/diff.js';
import {
  ClaudeCodeEditor,
  claudeCodeArgs,
} from '../connectors/agents/claude-code.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Copie de ds/ dans un dossier temporaire : jamais le vrai DS du dépôt.
async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  builder?: PreviewBuilder,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-comp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ds = path.join(dir, 'ds');
  await cp(path.join(root, 'ds'), ds, { recursive: true });
  const data = path.join(dir, 'data');
  await mkdir(data);
  const store = new ComponentStore(
    path.join(ds, 'src'),
    data,
    path.join(dir, 'preview'),
    builder,
  );
  return { dir, ds, data, store };
}

test('diff : suppressions avant ajouts, contexte limité', () => {
  const lines = diffLines(
    'a\nb\nc\nd\ne\nf\ng\nh\ni',
    'a\nb\nc\nd\nE\nf\ng\nh\ni',
  );
  assert.deepEqual(
    lines.filter((l) => l.kind !== ' '),
    [
      { kind: '-', text: 'e' },
      { kind: '+', text: 'E' },
    ],
  );
  assert.equal(hunks(lines, 1).filter((l) => !('gap' in l)).length, 4);
});

test('liste, proposition sans écriture, validation relue, journal, annulation', async (t) => {
  const { store, ds } = await fixture(t);
  const files = (await store.list()).map((f) => f.path);
  assert.ok(files.includes('components/Button.tsx'));
  assert.ok(files.includes('components/Button.css'));
  const file = path.join(ds, 'src/components/Button.css');
  const before = await readFile(file, 'utf8');
  const after = before.replace('var(--radius-control)', 'var(--radius-lg)');
  const p = await store.propose(
    [{ path: 'components/Button.css', content: after }],
    'manual',
    'Coins',
  );
  assert.deepEqual(
    p.files.map((f) => [f.path, f.added, f.removed]),
    [['components/Button.css', 1, 1]],
  );
  assert.equal(
    await readFile(file, 'utf8'),
    before,
    'rien écrit avant validation',
  );
  const { entry } = await store.commit(p.id);
  assert.equal(entry.revision, 1);
  assert.equal(await readFile(file, 'utf8'), after);
  await assert.rejects(() => store.commit(p.id), /inconnue/);
  const undo = await store.undo(entry.id);
  assert.equal(undo.source, 'undo');
  await store.commit(undo.id);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.deepEqual(
    (await store.history()).map((h) => [h.revision, h.source]),
    [
      [2, 'undo'],
      [1, 'manual'],
    ],
  );
  assert.ok(
    (await store.usages())['radius-control'].some(
      (u) => u.file === 'components/Button.css',
    ),
  );
});

test('fins de ligne CRLF conservées : une ligne modifiée, pas tout le fichier', async (t) => {
  const { store, ds } = await fixture(t);
  const file = path.join(ds, 'src/components/Alert.css');
  const lf = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  await writeFile(file, lf.replace(/\n/g, '\r\n'));
  const edited = lf.replace('var(--', 'var( --');
  const p = await store.propose(
    [{ path: 'components/Alert.css', content: edited }],
    'manual',
  );
  assert.deepEqual([p.files[0].added, p.files[0].removed], [1, 1]);
  await store.commit(p.id);
  assert.equal(await readFile(file, 'utf8'), edited.replace(/\n/g, '\r\n'));
  // Contenu identique au fichier, aux fins de ligne près : rien à proposer.
  await assert.rejects(
    () =>
      store.propose(
        [{ path: 'components/Alert.css', content: edited }],
        'manual',
      ),
    /Aucun changement/,
  );
});

test('conflit : fichier modifié entre proposition et validation, rien écrit', async (t) => {
  const { store, ds } = await fixture(t);
  const file = path.join(ds, 'src/components/Alert.tsx');
  const p = await store.propose(
    [{ path: 'components/Alert.tsx', content: '// a\n' }],
    'manual',
  );
  await writeFile(file, '// changé à la main\n');
  await assert.rejects(
    () => store.commit(p.id),
    /a changé depuis la proposition/,
  );
  assert.equal(await readFile(file, 'utf8'), '// changé à la main\n');
  assert.equal((await store.history()).length, 0);
});

test('chemins hors ds/src, doublons et propositions vides refusés', async (t) => {
  const { store } = await fixture(t);
  for (const bad of [
    '../x.tsx',
    '/abs.tsx',
    'a/../b.tsx',
    'x.js',
    'node_modules\\x.ts',
  ])
    await assert.rejects(
      () => store.propose([{ path: bad, content: '' }], 'manual'),
      /refusé/,
      bad,
    );
  await assert.rejects(
    () =>
      store.propose(
        [
          { path: 'a.ts', content: '1' },
          { path: 'a.ts', content: '2' },
        ],
        'manual',
      ),
    /double/,
  );
  const same = (await store.read('index.ts'))!;
  await assert.rejects(
    () => store.propose([{ path: 'index.ts', content: same }], 'manual'),
    /Aucun changement/,
  );
});

test('compilation échouée : validation refusée ; aperçu construit sur une copie', async (t) => {
  let overlayContent = '';
  const { store, ds } = await fixture(t, async (overlay) => {
    overlayContent = await readFile(
      path.join(overlay, 'components/Tooltip.tsx'),
      'utf8',
    );
    return overlayContent.includes('cassé')
      ? { ok: false, error: 'Unexpected token' }
      : { ok: true };
  });
  const p = await store.propose(
    [{ path: 'components/Tooltip.tsx', content: 'cassé(' }],
    'manual',
  );
  assert.equal(overlayContent, 'cassé(');
  assert.equal(p.build.ok, false);
  await assert.rejects(() => store.commit(p.id), /ne compile pas/);
  assert.notEqual(
    await readFile(path.join(ds, 'src/components/Tooltip.tsx'), 'utf8'),
    'cassé(',
  );
});

test('commit Git facultatif : seulement les fichiers validés, jamais les autres', async (t) => {
  try {
    execFileSync('git', ['--version']);
  } catch {
    return t.skip('git absent');
  }
  const { dir, ds } = await fixture(t);
  const g = (...a: string[]) =>
    execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q');
  g('config', 'user.email', 'test@example.invalid');
  g('config', 'user.name', 'Test');
  g('config', 'core.autocrlf', 'false');
  g('add', '-A');
  g('commit', '-qm', 'base');
  await writeFile(path.join(dir, 'autre.txt'), 'indexé mais hors validation');
  g('add', 'autre.txt');
  const store = new ComponentStore(
    path.join(ds, 'src'),
    path.join(dir, 'data'),
    path.join(dir, 'preview'),
    undefined,
    gitCommitter(path.join(ds, 'src')),
  );
  const p = await store.propose(
    [{ path: 'components/Field.tsx', content: '// champ\n' }],
    'manual',
    'Champ',
  );
  const r = await store.commit(p.id, true);
  assert.equal(r.git?.ok, true, r.git?.detail ?? 'pas de résultat Git');
  assert.equal(g('log', '-1', '--format=%s'), 'DS c1 · Champ');
  assert.equal(
    g('show', '--name-only', '--format=', 'HEAD'),
    'ds/src/components/Field.tsx',
  );
  assert.match(g('status', '--short'), /^A {2}autre\.txt$/m);
});

test('agent de code (faux CLI) : copie isolée, seules les différences de src/ retenues', async (t) => {
  const { ds, dir } = await fixture(t);
  const editor = new ClaudeCodeEditor(ds, process.execPath, [
    path.join(root, 'tests/fixtures/fake-claude.mjs'),
    'code',
  ]);
  const r = await editor.edit('Arrondis les boutons', { rules: 'Règles' });
  assert.equal(r.message, 'Boutons plus arrondis ; composant Ghost ajouté.');
  assert.equal(r.denied, 1);
  assert.deepEqual(r.changes.map((c) => c.path).sort(), [
    'components/Button.css',
    'components/Ghost.tsx',
  ]);
  assert.match(
    r.changes.find((c) => c.path === 'components/Button.css')?.content ?? '',
    /--radius-lg/,
  );
  // Le vrai DS n'a pas bougé, ni tokens.css ; rien hors de la copie temporaire.
  assert.match(
    await readFile(path.join(ds, 'src/components/Button.css'), 'utf8'),
    /--radius-control/,
  );
  assert.doesNotMatch(
    await readFile(path.join(ds, 'tokens.css'), 'utf8'),
    /modifié/,
  );
  await assert.rejects(() => readFile(path.join(dir, 'hors-copie.txt')));
});

test('profil de l’agent de code : outils fichiers seulement, ni shell ni MCP', () => {
  const at = (flag: string) => claudeCodeArgs[claudeCodeArgs.indexOf(flag) + 1];
  assert.equal(at('--tools'), 'Read,Edit,Write,Glob,Grep');
  assert.equal(at('--permission-mode'), 'acceptEdits');
  assert.equal(at('--mcp-config'), '{"mcpServers":{}}');
  assert.equal(at('--model'), 'claude-sonnet-5-5');
  assert.equal(at('--effort'), 'medium');
  assert.ok(claudeCodeArgs.includes('--strict-mcp-config'));
  assert.ok(!claudeCodeArgs.join(' ').includes('Bash'));
});
