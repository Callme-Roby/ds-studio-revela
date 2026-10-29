import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { tokensSchema } from '../app/shared/model.js';
import { figmaSpecSchema, type FigmaSpec } from '../app/shared/figma-spec.js';
import { variantNames } from '../figma-plugin/src/build.js';

const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      new URL('../workspace/design-system.tokens.json', import.meta.url),
      'utf8',
    ),
  ),
);

// Imitation de l'API Figma suffisante pour exécuter code.js tel quel :
// nœuds, pages, composants, jeux de variantes, instances, liaisons de variables.
let ids = 0;
class Node {
  id = `n${ids++}`;
  name = '';
  children: Node[] = [];
  parent: Node | null = null;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  characters = '';
  bound: Record<string, string> = {};
  data: Record<string, string> = {};
  [k: string]: unknown;
  constructor(public type: string) {}
  appendChild(n: Node) {
    n.parent?.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = this;
    this.children.push(n);
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  setBoundVariable(field: string, v: { id: string }) {
    this.bound[field] = v.id;
  }
  getPluginData(k: string) {
    return this.data[k] ?? '';
  }
  setPluginData(k: string, v: string) {
    this.data[k] = v;
  }
  findAll(pred: (n: Node) => boolean): Node[] {
    return this.children.flatMap((c) => [
      ...(pred(c) ? [c] : []),
      ...c.findAll(pred),
    ]);
  }
  async loadAsync() {}
  createInstance() {
    const clone = (n: Node): Node => {
      const c = new Node(n === this ? 'INSTANCE' : n.type);
      c.name = n.name;
      c.characters = n.characters;
      c.mainComponent = n === this ? this : undefined;
      n.children.forEach((k) => c.appendChild(clone(k)));
      return c;
    };
    return clone(this);
  }
}
function fakeFigma(tokens = seed) {
  const root = new Node('DOCUMENT');
  const vars = new Map<string, Node>();
  const collections: unknown[] = [];
  const fonts: string[] = [];
  const messages: Record<string, unknown>[] = [];
  const data = () => {
    const d: Record<string, string> = {};
    return {
      getPluginData: (k: string) => d[k] ?? '',
      setPluginData: (k: string, v: string) => (d[k] = v),
    };
  };
  const figma = {
    root,
    showUI() {},
    notify() {},
    closePlugin() {},
    ui: {
      postMessage: (m: Record<string, unknown>) => messages.push(m),
      onmessage: null as unknown,
    },
    loadFontAsync: async (f: { style: string }) => void fonts.push(f.style),
    createFrame: () => new Node('FRAME'),
    createText: () => new Node('TEXT'),
    createComponent: () => new Node('COMPONENT'),
    createPage: () => {
      const p = new Node('PAGE');
      root.appendChild(p);
      return p;
    },
    combineAsVariants(nodes: Node[], parent: Node) {
      const set = new Node('COMPONENT_SET');
      parent.appendChild(set);
      nodes.forEach((n) => set.appendChild(n));
      set.height = Math.max(...nodes.map((n) => n.height));
      return set;
    },
    variables: {
      async getLocalVariableCollectionsAsync() {
        return collections;
      },
      async getVariableByIdAsync(id: string) {
        return vars.get(id) ?? null;
      },
      createVariableCollection(name: string) {
        const c = {
          id: 'c',
          name,
          modes: [{ modeId: 'm1' }],
          variableIds: [] as string[],
          ...data(),
        };
        collections.push(c);
        return c;
      },
      createVariable(
        name: string,
        collection: { variableIds: string[] },
        resolvedType: string,
      ) {
        const v = new Node('VARIABLE');
        Object.assign(v, {
          name,
          resolvedType,
          valuesByMode: {} as Record<string, unknown>,
          setValueForMode(mode: string, value: unknown) {
            (this.valuesByMode as Record<string, unknown>)[mode] =
              structuredClone(value);
          },
        });
        vars.set(v.id, v);
        collection.variableIds.push(v.id);
        return v;
      },
      setBoundVariableForPaint(p: object, field: string, v: { id: string }) {
        return { ...p, boundVariables: { [field]: { id: v.id } } };
      },
    },
  };
  return { figma, messages, root, vars, fonts, tokens };
}

// Export minimal mais réaliste : Button (2 variantes liées aux tokens) et un écran
// qui l'utilise en instance avec un autre libellé.
const button = (variant: string, label: string, fill: string) => ({
  variant,
  node: {
    kind: 'frame' as const,
    name: variant,
    x: 0,
    y: 0,
    w: 95,
    h: 44,
    fill: { value: { r: 0.07, g: 0.07, b: 0.07, a: 1 }, token: fill },
    radius: { value: 4, token: 'radius.control' },
    layout: {
      mode: 'HORIZONTAL' as const,
      gap: { value: 0 },
      padding: [
        { value: 8, token: 'space.sm' },
        { value: 12, token: 'space.md' },
        { value: 8, token: 'space.sm' },
        { value: 12, token: 'space.md' },
      ],
      align: 'CENTER' as const,
      justify: 'CENTER' as const,
      hug: true,
    },
    children: [
      {
        kind: 'text' as const,
        name: label,
        x: 13,
        y: 12,
        w: 68,
        h: 19,
        characters: label,
        fontSize: { value: 14, token: 'font.body' },
        fontWeight: 400,
        color: { value: { r: 1, g: 1, b: 1, a: 1 }, token: 'color.onBrand' },
        align: 'CENTER' as const,
      },
    ],
  },
});
const spec: FigmaSpec = figmaSpecSchema.parse({
  version: 1,
  revision: 0,
  codeRevision: 0,
  date: '2026-10-29T00:00:00.000Z',
  components: [
    {
      name: 'Button',
      group: 'Actions',
      description: 'Bouton',
      variants: [
        button('variant=primary, state=default', 'Déclencher', 'color.brand'),
        button('variant=danger, state=default', 'Supprimer', 'color.danger'),
      ],
    },
  ],
  screens: [
    {
      name: 'Revela · Prise de vue',
      width: 1440,
      height: 900,
      node: {
        kind: 'frame',
        name: 'Revela · Prise de vue',
        x: 0,
        y: 0,
        w: 1440,
        h: 900,
        fill: { value: { r: 1, g: 1, b: 1, a: 1 }, token: 'color.surface' },
        children: [
          {
            ...button(
              'variant=primary, state=default',
              'Exporter',
              'color.brand',
            ).node,
            x: 1200,
            y: 840,
            absolute: true,
            instance: {
              component: 'Button',
              variant: 'variant=primary, state=default',
            },
          },
          {
            kind: 'text',
            name: 'Titre',
            x: 20,
            y: 12,
            w: 80,
            h: 20,
            characters: 'RÉGLAGES',
            fontSize: { value: 11, token: 'font.sm' },
            fontWeight: 600,
            color: {
              value: { r: 0.4, g: 0.4, b: 0.4, a: 1 },
              token: 'color.muted',
            },
            align: 'LEFT',
            absolute: true,
          },
        ],
      },
    },
  ],
});

async function runPlugin() {
  execFileSync(process.execPath, [
    fileURLToPath(
      new URL('../scripts/build-figma-plugin.mjs', import.meta.url),
    ),
  ]);
  const code = await readFile(
    new URL('../figma-plugin/code.js', import.meta.url),
    'utf8',
  );
  const fake = fakeFigma();
  vm.runInNewContext(code, {
    figma: fake.figma,
    __html__: '',
    structuredClone,
    JSON,
    console,
    Object,
    Math,
  });
  const send = async (msg: unknown) => {
    await (fake.figma.ui.onmessage as (m: unknown) => Promise<void>)(msg);
    return fake.messages.at(-1)!;
  };
  return { ...fake, send };
}

test('noms de variantes : mêmes propriétés partout, défaut explicite', () => {
  assert.deepEqual(
    variantNames(['variant=primary, state=default', 'variant=danger']),
    ['variant=primary, state=default', 'variant=danger, state=défaut'],
  );
  assert.deepEqual(variantNames(['default']), ['Variante=défaut']);
});

test('construction refusée sans variables : rien créé', async () => {
  const { send, root } = await runPlugin();
  const r = await send({ type: 'build', spec });
  assert.equal(r.type, 'error');
  assert.match(String(r.message), /variables/);
  assert.equal(root.children.length, 0);
});

test('composants et écrans construits, liés aux variables, reconstruits sur place', async () => {
  const { send, root, vars, fonts } = await runPlugin();
  const source = { revision: 0, tokens: seed };
  const p = await send({ type: 'plan', source });
  await send({ type: 'apply', source, key: p.key });
  const built = await send({ type: 'build', spec });
  assert.equal(built.type, 'built', String(built.message));
  assert.equal(built.components, 1);
  assert.equal(built.instances, 1);
  assert.deepEqual([...new Set(fonts)].sort(), ['Regular', 'Semi Bold']);
  const idOf = (name: string) =>
    [...vars.values()].find((v) => v.name === name)!.id;
  const [cPage, sPage] = root.children;
  assert.equal(cPage.name, 'Revela · Composants');
  assert.equal(sPage.name, 'Revela · Écrans');
  const set = cPage.children[0];
  assert.equal(set.type, 'COMPONENT_SET');
  assert.equal(set.name, 'Button');
  assert.deepEqual(
    set.children.map((c) => c.name),
    ['variant=primary, state=default', 'variant=danger, state=default'],
  );
  const primary = set.children[0];
  assert.equal(
    (primary.fills as { boundVariables: { color: { id: string } } }[])[0]
      .boundVariables.color.id,
    idOf('color/brand'),
  );
  assert.equal(primary.bound.paddingLeft, idOf('space/md'));
  assert.equal(primary.bound.paddingTop, idOf('space/sm'));
  assert.equal(primary.bound.topLeftRadius, idOf('radius/control'));
  assert.equal(primary.layoutMode, 'HORIZONTAL');
  assert.equal(primary.primaryAxisSizingMode, 'AUTO');
  const label = primary.children[0];
  assert.equal(label.type, 'TEXT');
  assert.equal(label.characters, 'Déclencher');
  assert.equal(label.bound.fontSize, idOf('font/body'));
  // Écran : instance du Button avec le libellé de l'écran, texte lié.
  const screen = sPage.children[0];
  assert.equal(screen.name, 'Revela · Prise de vue');
  const inst = screen.children.find((n) => n.type === 'INSTANCE')!;
  assert.equal(inst.mainComponent, primary);
  assert.equal(inst.children[0].characters, 'Exporter');
  assert.deepEqual([inst.x, inst.y], [1200, 840]);
  const title = screen.children.find((n) => n.type === 'TEXT')!;
  assert.equal(title.bound.fontSize, idOf('font/sm'));
  // Seconde construction : mêmes nœuds de composants, aucun doublon.
  const before = set.children.map((c) => c.id);
  await send({ type: 'build', spec });
  assert.equal(root.children.length, 2);
  assert.equal(cPage.children.length, 1);
  assert.deepEqual(
    set.children.map((c) => c.id),
    before,
  );
  assert.equal(sPage.children.length, 1);
  assert.equal(
    sPage.children[0].children.filter((n) => n.type === 'INSTANCE').length,
    1,
  );
});

test('export réel capturé dans DS-Studio : construit en entier, liaisons et instances', async () => {
  const real = figmaSpecSchema.parse(
    JSON.parse(
      await readFile(
        new URL('./fixtures/figma-spec.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const { send, root } = await runPlugin();
  const source = { revision: 0, tokens: seed };
  const p = await send({ type: 'plan', source });
  await send({ type: 'apply', source, key: p.key });
  const built = await send({ type: 'build', spec: real });
  assert.equal(built.type, 'built', String(built.message));
  assert.equal(built.components, 11);
  assert.equal(built.screens, 3);
  assert.ok(Number(built.instances) >= 30, `instances : ${built.instances}`);
  assert.ok(Number(built.bound) >= 250, `liaisons : ${built.bound}`);
  const sets = root.children[0].children
    .filter((n) => n.type === 'COMPONENT_SET')
    .map((n) => n.name);
  assert.deepEqual(sets.sort(), ['Alert', 'Button', 'LiveBadge', 'Thumb']);
  // Aucune dimension invalide transmise à Figma.
  const all = root.findAll(() => true);
  assert.ok(all.every((n) => Number.isFinite(n.width) && Number.isFinite(n.x)));
});
