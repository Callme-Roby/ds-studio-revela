import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokensSchema, type Tokens } from '../app/shared/model.js';
import { audit, auditProposal, findings } from '../app/shared/rules.js';
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);
function withValues(values: Partial<Record<keyof Tokens, string | number>>) {
  const t = structuredClone(seed);
  for (const [k, v] of Object.entries(values))
    t[k as keyof Tokens].$value = v as never;
  return t;
}
test('le seed Revela respecte toutes les règles', () => {
  assert.deepEqual(findings(seed), []);
});
test('neutralité : un gris teinté est signalé avec son écart', () => {
  const f = findings(withValues({ 'color.surface': '#FFF5F5' }));
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'neutralité');
  assert.match(f[0].message, /écart de 10/);
});
test('contraste : texte secondaire et contour de champ ont leurs propres seuils', () => {
  const f = findings(
    withValues({ 'color.muted': '#8A8A8A', 'color.borderStrong': '#B0B0B0' }),
  );
  const ids = f.map((x) => x.id);
  assert.ok(ids.includes('contrast:color.muted:color.surface'));
  assert.ok(ids.includes('contrast:color.borderStrong:color.surface'));
  // #8A8A8A atteint 3:1 pour un contour mais pas 4,5:1 pour du texte.
  assert.deepEqual(
    findings(withValues({ 'color.borderStrong': '#8A8A8A' })),
    [],
  );
});
test('taille : texte dérivé de font.body et échelle inversée', () => {
  const ids = findings(withValues({ 'font.body': 12, 'font.xs': 9 })).map(
    (x) => x.id,
  );
  assert.ok(ids.includes('size:font.xs'));
  assert.ok(ids.includes('size:font.body × 0,8 (libellés)'));
  assert.ok(
    findings(withValues({ 'space.md': 22 })).some(
      (x) => x.id === 'scale:space.lg',
    ),
  );
});
test('audit : sépare introduit, résolu et déjà présent', () => {
  const before = withValues({ 'color.muted': '#8A8A8A', 'color.mat': '#302E2E' });
  const after = withValues({ 'color.mat': '#302E2E', 'font.xs': 8 });
  const a = audit(before, after);
  assert.deepEqual(a.introduced.map((f) => f.id), ['size:font.xs']);
  assert.ok(a.resolved.every((f) => f.id.startsWith('contrast:color.muted')));
  assert.deepEqual(a.remaining.map((f) => f.id), ['neutral:color.mat']);
});
test('auditProposal reconstruit avant et après depuis les patches', () => {
  const a = auditProposal(seed, {
    id: 'p',
    revision: 0,
    source: 'manual',
    patches: [{ key: 'color.canvas', before: '#F5F5F5', after: '#F5F7FA' }],
  });
  assert.deepEqual(a?.introduced.map((f) => f.id), ['neutral:color.canvas']);
  assert.equal(
    auditProposal(seed, {
      id: 'p',
      revision: 0,
      source: 'manual',
      patches: [{ key: 'color.canvas', before: '#F5F5F5', after: 'rouge' }],
    }),
    undefined,
  );
});
