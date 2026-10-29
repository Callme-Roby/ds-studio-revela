import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { tokensSchema, type Tokens } from '../app/shared/model.js';
import {
  display,
  isSynced,
  plan,
  planKey,
  toFigma,
  type FigmaState,
} from '../figma-plugin/src/logic.js';
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);
const source = (tokens: Tokens = seed, revision = 5) => ({ revision, tokens });
// État Figma tel que le plugin l'aurait écrit pour ces tokens.
function written(tokens: Tokens): FigmaState {
  const variables: FigmaState['variables'] = {};
  for (const [k, t] of Object.entries(tokens)) {
    const value = toFigma(t);
    variables[k.replace('.', '/')] = {
      type: t.$type === 'color' ? 'COLOR' : t.$type === 'dimension' ? 'FLOAT' : 'STRING',
      value,
      written: value,
    };
  }
  return { revision: '5', variables };
}

test('fichier vide : 45 variables à créer, nommées par groupe', () => {
  const p = plan(source(), { variables: {} });
  assert.equal(p.create.length, Object.keys(seed).length);
  assert.ok(p.create.some((r) => r.name === 'color/brandHover' && r.type === 'COLOR'));
  assert.ok(p.create.some((r) => r.name === 'font/family' && r.type === 'STRING'));
  assert.ok(p.create.some((r) => r.name === 'space/2xs' && r.type === 'FLOAT'));
});
test('couleurs : aller-retour exact #RRGGBB pour tout le seed', () => {
  for (const t of Object.values(seed))
    if (t.$type === 'color') assert.equal(display(toFigma(t)), t.$value.toUpperCase());
});
test('à jour, mise à jour, modification à la main, création hors plugin, type, extra', () => {
  assert.ok(isSynced(plan(source(), written(seed))));
  const next = structuredClone(seed);
  next['color.warning'].$value = '#7A4A00';
  const figma = written(seed);
  figma.variables['color/mat'].value = { r: 0.2, g: 0.1, b: 0.1, a: 1 };
  figma.variables['color/pick'].written = undefined;
  figma.variables['color/pick'].value = { r: 1, g: 0, b: 0, a: 1 };
  figma.variables['space/md'] = { type: 'STRING', value: '12', written: '12' };
  figma.variables['autre/variable'] = { type: 'FLOAT', value: 1 };
  const p = plan(source(next), figma);
  assert.deepEqual(p.update.map((r) => [r.name, r.before, r.after]), [
    ['color/warning', '#8F5600', '#7A4A00'],
  ]);
  const reasons = Object.fromEntries(p.conflicts.map((c) => [c.name, c.reason]));
  assert.equal(reasons['color/mat'], 'modifiée à la main dans Figma');
  assert.equal(reasons['color/pick'], 'créée hors du plugin');
  assert.match(reasons['space/md'] ?? '', /^type/);
  assert.deepEqual(p.extra, ['autre/variable']);
});
test('empreinte du plan : change si Figma change', () => {
  const a = plan(source(), { variables: {} });
  const figma = written(seed);
  delete figma.variables['color/brand'];
  assert.notEqual(planKey(a), planKey(plan(source(), figma)));
});

// Imitation minimale de l'API Figma pour exécuter code.js tel quel.
function fakeFigma() {
  const collections: any[] = [];
  const vars = new Map<string, any>();
  let n = 0;
  const data = () => {
    const d: Record<string, string> = {};
    return {
      getPluginData: (k: string) => d[k] ?? '',
      setPluginData: (k: string, v: string) => (d[k] = v),
    };
  };
  const messages: any[] = [];
  const figma: any = {
    showUI() {},
    notify() {},
    closePlugin() {},
    ui: { postMessage: (m: any) => messages.push(m), onmessage: null },
    variables: {
      async getLocalVariableCollectionsAsync() {
        return collections;
      },
      async getVariableByIdAsync(id: string) {
        return vars.get(id) ?? null;
      },
      createVariableCollection(name: string) {
        const c = { id: `c${n++}`, name, modes: [{ modeId: 'm1' }], variableIds: [] as string[], ...data() };
        collections.push(c);
        return c;
      },
      createVariable(name: string, collection: any, resolvedType: string) {
        const v = {
          id: `v${n++}`,
          name,
          resolvedType,
          valuesByMode: {} as Record<string, unknown>,
          scopes: [] as string[],
          description: '',
          setValueForMode(mode: string, value: unknown) {
            this.valuesByMode[mode] = structuredClone(value);
          },
          ...data(),
        };
        vars.set(v.id, v);
        collection.variableIds.push(v.id);
        return v;
      },
    },
  };
  return { figma, messages, vars, collections };
}
async function runPlugin() {
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../scripts/build-figma-plugin.mjs', import.meta.url)),
  ]);
  const code = await readFile(new URL('../figma-plugin/code.js', import.meta.url), 'utf8');
  const fake = fakeFigma();
  vm.runInNewContext(code, { figma: fake.figma, __html__: '', structuredClone, JSON, console });
  const send = async (msg: any) => {
    await fake.figma.ui.onmessage(msg);
    return fake.messages.at(-1);
  };
  return { ...fake, send, code };
}
test('plugin complet : création, relecture, mise à jour, conflit respecté, plan périmé refusé', async () => {
  const { send, vars, collections, code } = await runPlugin();
  assert.ok(!/^export /m.test(code));
  const first = await send({ type: 'plan', source: source() });
  assert.equal(first.plan.create.length, 45);
  const applied = await send({ type: 'apply', source: source(), key: first.key });
  assert.equal(applied.type, 'applied');
  assert.equal(applied.written, 45);
  assert.equal(applied.synced, true);
  assert.equal(collections.length, 1);
  assert.equal(collections[0].getPluginData('ds-studio-revision'), '5');
  const warning = [...vars.values()].find((v) => v.name === 'color/warning');
  // Tableau créé dans le contexte du plugin : copié avant comparaison stricte.
  assert.deepEqual([...warning.scopes], ['ALL_FILLS', 'STROKE_COLOR']);
  // Retouche manuelle dans Figma, puis nouvelle révision DS-Studio.
  const mat = [...vars.values()].find((v) => v.name === 'color/mat');
  mat.valuesByMode.m1 = { r: 0.3, g: 0.2, b: 0.2, a: 1 };
  const next = structuredClone(seed);
  next['color.warning'].$value = '#7A4A00';
  const p = await send({ type: 'plan', source: source(next, 6) });
  assert.equal(p.plan.update.length, 1);
  assert.equal(p.plan.conflicts.length, 1);
  // Plan périmé : refus sans écriture.
  const stale = await send({ type: 'apply', source: source(next, 6), key: first.key });
  assert.equal(stale.type, 'error');
  assert.match(stale.message, /a changé/);
  assert.equal(display(warning.valuesByMode.m1), '#8F5600');
  // Sans accord : seule la mise à jour passe, la retouche Figma est gardée.
  const done = await send({ type: 'apply', source: source(next, 6), key: p.key });
  assert.equal(done.written, 1);
  assert.equal(display(warning.valuesByMode.m1), '#7A4A00');
  assert.equal(display(mat.valuesByMode.m1), '#4D3333');
  assert.equal(done.readback.conflicts.length, 1);
  // Avec accord explicite : la retouche est remplacée.
  const again = await send({ type: 'plan', source: source(next, 6) });
  const forced = await send({ type: 'apply', source: source(next, 6), key: again.key, overwrite: true });
  assert.equal(forced.synced, true);
  assert.equal(display(mat.valuesByMode.m1), seed['color.mat'].$value);
});
test('manifest : accès réseau limité à DS-Studio en local', async () => {
  const m = JSON.parse(
    await readFile(new URL('../figma-plugin/manifest.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(m.networkAccess.allowedDomains, ['none']);
  // Figma refuse une IP ici (« must be a valid URL ») : nom de domaine obligatoire.
  assert.deepEqual(m.networkAccess.devAllowedDomains, ['http://localhost:4310']);
  assert.equal(m.documentAccess, 'dynamic-page');
});
