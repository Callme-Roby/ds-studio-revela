// Fichier généré par npm run figma:build : modifier figma-plugin/src/.
// Logique pure du plugin : aucune dépendance à l'API Figma, testée par npm test.
// Le script de build retire les mots-clés export pour produire code.js.

const COLLECTION = 'Revela · DS-Studio';
// Valeur écrite par le plugin, mémorisée sur chaque variable pour repérer
// une modification faite à la main dans Figma.
const WRITTEN = 'ds-studio-value';
const REVISION = 'ds-studio-revision';

// Groupes Figma : chaque « . » de la clé devient un niveau (color.brand → color/brand).
function variableName(key) {
  return key.replaceAll('.', '/');
}
function figmaType(token) {
  return token.$type === 'color'
    ? 'COLOR'
    : token.$type === 'dimension'
      ? 'FLOAT'
      : 'STRING';
}
// Portée Figma de chaque variable : elle n'apparaît que là où elle a un sens.
function scopesFor(key, token) {
  if (token.$type === 'fontFamily') return ['FONT_FAMILY'];
  if (key.startsWith('font.')) return ['FONT_SIZE'];
  if (key.startsWith('space.')) return ['GAP', 'WIDTH_HEIGHT'];
  if (key.startsWith('radius.')) return ['CORNER_RADIUS'];
  if (
    key.includes('text') ||
    key.includes('muted') ||
    key.startsWith('color.on')
  )
    return ['TEXT_FILL'];
  if (key.includes('border') || key.includes('focus')) return ['STROKE_COLOR'];
  // Projet externe : nombre ou texte sans famille connue, toutes portées.
  if (token.$type !== 'color') return ['ALL_SCOPES'];
  return ['ALL_FILLS', 'STROKE_COLOR'];
}
function toFigma(token) {
  if (token.$type !== 'color') return token.$value;
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(token.$value.slice(i, i + 2), 16) / 255,
  );
  return { r, g, b, a: 1 };
}
function display(value) {
  if (value && typeof value === 'object' && 'r' in value)
    return (
      '#' +
      [value.r, value.g, value.b]
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
        .toUpperCase()
    );
  return String(value);
}
function same(a, b) {
  if (a && typeof a === 'object' && b && typeof b === 'object')
    return display(a) === display(b) && (a.a ?? 1) === (b.a ?? 1);
  return a === b;
}

// figma : { revision, variables: { nom: { type, value, written } } }
// written : valeur mémorisée lors de la dernière écriture du plugin (ou absente).
function plan(source, figma) {
  const out = {
    revision: source.revision,
    figmaRevision: figma.revision ?? null,
    create: [],
    update: [],
    conflicts: [],
    unchanged: 0,
    extra: [],
  };
  const names = new Set();
  for (const [key, token] of Object.entries(source.tokens)) {
    const name = variableName(key);
    names.add(name);
    const want = toFigma(token);
    const current = figma.variables[name];
    const row = { key, name, type: figmaType(token), after: display(want) };
    if (!current) {
      out.create.push(row);
      continue;
    }
    row.before = display(current.value);
    if (current.type !== row.type) {
      out.conflicts.push({ ...row, reason: `type ${current.type} dans Figma` });
      continue;
    }
    if (same(current.value, want)) {
      out.unchanged++;
      continue;
    }
    // Modifiée dans Figma depuis la dernière écriture, ou jamais écrite par le plugin.
    if (current.written === undefined)
      out.conflicts.push({ ...row, reason: 'créée hors du plugin' });
    else if (!same(current.value, current.written))
      out.conflicts.push({ ...row, reason: 'modifiée à la main dans Figma' });
    else out.update.push(row);
  }
  out.extra = Object.keys(figma.variables).filter((n) => !names.has(n));
  return out;
}
// Empreinte du plan affiché : l'écriture n'a lieu que sur ce plan exact.
function planKey(p) {
  return JSON.stringify([
    p.revision,
    p.create.map((r) => [r.name, r.after]),
    p.update.map((r) => [r.name, r.before, r.after]),
    p.conflicts.map((r) => [r.name, r.before, r.after]),
  ]);
}
function isSynced(p) {
  return !p.create.length && !p.update.length && !p.conflicts.length;
}

// Construction des composants et écrans Figma à partir de l'export DS-Studio
// (/api/figma/spec). Concaténé après logic.js dans code.js.
// - Pages gérées « Revela · Composants » et « Revela · Écrans », retrouvées
//   par donnée de plugin ; rien d'autre dans le fichier n'est touché.
// - Couleurs, marges internes, espacements, rayons et tailles de texte liés aux
//   variables de la collection « Revela · DS-Studio » quand le token est connu.
// - Un composant déjà construit est vidé puis reconstruit sur place : son
//   identifiant ne change pas, les instances ailleurs dans le fichier suivent.


const NODE_KEY = 'ds-studio-node';
const PAGES = {
  components: 'Revela · Composants',
  screens: 'Revela · Écrans',
};

const fontStyle = (w) =>
  w >= 700 ? 'Bold' : w >= 600 ? 'Semi Bold' : w >= 500 ? 'Medium' : 'Regular';

// Noms de variantes Figma « clé=valeur, clé=valeur » avec les mêmes clés partout.
function variantNames(variants) {
  const parsed = variants.map((v) =>
    v === 'default'
      ? {}
      : Object.fromEntries(
          v.split(',').map((p) => p.split('=').map((s) => s.trim())),
        ),
  );
  const keys = [...new Set(parsed.flatMap((p) => Object.keys(p)))];
  if (!keys.length) return variants.map(() => 'Variante=défaut');
  return parsed.map((p) =>
    keys.map((k) => `${k}=${p[k] ?? 'défaut'}`).join(', '),
  );
}

// Résumé de ce que la construction va faire, affiché avant le clic.
function buildSummary(spec) {
  return {
    revision: spec.revision,
    codeRevision: spec.codeRevision,
    components: spec.components.length,
    variants: spec.components.reduce((n, c) => n + c.variants.length, 0),
    screens: spec.screens.map((s) => s.name),
  };
}

function textRuns(node, out = []) {
  if (node.kind === 'text') out.push(node.characters);
  else for (const c of node.children) textRuns(c, out);
  return out;
}

function fontsUsed(spec) {
  const styles = new Set();
  const walk = (n) => {
    if (n.kind === 'text') styles.add(fontStyle(n.fontWeight));
    else n.children.forEach(walk);
  };
  spec.components.forEach((c) => c.variants.forEach((v) => walk(v.node)));
  spec.screens.forEach((s) => walk(s.node));
  return [...styles];
}

function createBuilder(api, variables) {
  const bound = (ref) =>
    ref && ref.token ? variables[variableName(ref.token)] : undefined;
  const stats = { nodes: 0, bound: 0, instances: 0 };
  function paint(ref) {
    const { r, g, b, a } = ref.value;
    const p = { type: 'SOLID', color: { r, g, b }, opacity: a };
    const v = bound(ref);
    if (!v) return p;
    stats.bound++;
    return api.variables.setBoundVariableForPaint(p, 'color', v);
  }
  function number(node, field, ref) {
    const v = bound(ref);
    if (v) {
      node.setBoundVariable(field, v);
      stats.bound++;
    } else node[field] = ref.value;
  }
  function style(f, s) {
    f.resize(Math.max(s.w, 0.01), Math.max(s.h, 0.01));
    f.fills = s.fill ? [paint(s.fill)] : [];
    if (s.stroke) {
      f.strokes = [paint(s.stroke)];
      f.strokeWeight = s.stroke.weight;
    } else f.strokes = [];
    if (s.radius)
      for (const corner of [
        'topLeftRadius',
        'topRightRadius',
        'bottomLeftRadius',
        'bottomRightRadius',
      ])
        number(f, corner, s.radius);
    else f.cornerRadius = 0;
    f.opacity = s.opacity ?? 1;
    f.clipsContent = !!s.clip;
    if (s.layout) {
      f.layoutMode = s.layout.mode;
      f.primaryAxisAlignItems = s.layout.justify;
      f.counterAxisAlignItems = s.layout.align;
      number(f, 'itemSpacing', s.layout.gap);
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(
        (p, i) => number(f, p, s.layout.padding[i]),
      );
      f.primaryAxisSizingMode = s.layout.hug ? 'AUTO' : 'FIXED';
      f.counterAxisSizingMode = s.layout.hug ? 'AUTO' : 'FIXED';
    } else f.layoutMode = 'NONE';
  }
  function text(s) {
    const t = api.createText();
    t.fontName = { family: 'Inter', style: fontStyle(s.fontWeight) };
    t.characters = s.characters;
    t.name = s.name;
    number(t, 'fontSize', s.fontSize);
    t.fills = [paint(s.color)];
    if (s.lineHeight) t.lineHeight = { unit: 'PIXELS', value: s.lineHeight };
    if (s.letterSpacing)
      t.letterSpacing = { unit: 'PIXELS', value: s.letterSpacing };
    t.textAlignHorizontal = s.align;
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    return t;
  }
  function place(parent, child, s) {
    parent.appendChild(child);
    if (parent.layoutMode && parent.layoutMode !== 'NONE') {
      if (!s.absolute) return;
      child.layoutPositioning = 'ABSOLUTE';
    }
    child.x = s.x;
    child.y = s.y;
  }
  function children(f, s, components) {
    for (const c of s.children) place(f, node(c, components), c);
  }
  function node(s, components) {
    stats.nodes++;
    if (s.kind === 'text') return text(s);
    const set = s.instance && components && components[s.instance.component];
    if (set) {
      const main = set.variants[s.instance.variant] || set.first;
      const inst = main.createInstance();
      stats.instances++;
      inst.name = s.instance.component;
      // Textes de l'écran reportés dans l'instance, dans l'ordre.
      const runs = textRuns(s);
      inst
        .findAll((n) => n.type === 'TEXT')
        .forEach((t, i) => {
          if (runs[i] !== undefined && t.characters !== runs[i])
            t.characters = runs[i];
        });
      return inst;
    }
    const f = api.createFrame();
    f.name = s.name;
    style(f, s);
    children(f, s, components);
    return f;
  }
  return { stats, style, children, node };
}

async function managedPage(api, key, name) {
  let page = api.root.children.find((p) => p.getPluginData(NODE_KEY) === key);
  if (!page) {
    page = api.createPage();
    page.name = name;
    page.setPluginData(NODE_KEY, key);
  }
  await page.loadAsync();
  return page;
}
function managed(page) {
  const out = {};
  for (const n of page.findAll(() => true)) {
    const k = n.getPluginData(NODE_KEY);
    if (k) out[k] = n;
  }
  return out;
}

async function buildAll(api, spec, variables) {
  for (const style of fontsUsed(spec))
    await api.loadFontAsync({ family: 'Inter', style });
  const b = createBuilder(api, variables);
  // Composants : un jeu de variantes par composant du catalogue.
  const cPage = await managedPage(api, 'page:components', PAGES.components);
  const existing = managed(cPage);
  const components = {};
  let y = 0;
  for (const c of spec.components) {
    const names = variantNames(c.variants.map((v) => v.variant));
    const comps = [];
    let x = 0;
    c.variants.forEach((v, i) => {
      const key = `component:${c.name}/${v.variant}`;
      const comp = existing[key] || api.createComponent();
      for (const child of [...comp.children]) child.remove();
      b.style(comp, v.node);
      b.children(comp, v.node);
      comp.name = c.variants.length > 1 ? names[i] : c.name;
      comp.description = c.description;
      comp.setPluginData(NODE_KEY, key);
      if (!existing[key]) {
        cPage.appendChild(comp);
        comp.x = x;
        comp.y = y;
      }
      x += v.node.w + 32;
      comps.push(comp);
    });
    let height = Math.max(...c.variants.map((v) => v.node.h));
    if (comps.length > 1) {
      let set = existing[`set:${c.name}`];
      if (!set) {
        set = api.combineAsVariants(comps, cPage);
        set.setPluginData(NODE_KEY, `set:${c.name}`);
        set.x = 0;
        set.y = y;
      } else
        for (const comp of comps)
          if (comp.parent !== set) set.appendChild(comp);
      set.name = c.name;
      set.description = c.description;
      height = set.height;
    }
    components[c.name] = {
      first: comps[0],
      variants: Object.fromEntries(
        c.variants.map((v, i) => [v.variant, comps[i]]),
      ),
    };
    y += height + 64;
  }
  // Écrans : un cadre par écran, composants du DS en instances.
  const sPage = await managedPage(api, 'page:screens', PAGES.screens);
  const screens = managed(sPage);
  spec.screens.forEach((s, i) => {
    const key = `screen:${s.name}`;
    const frame = screens[key] || api.createFrame();
    for (const child of [...frame.children]) child.remove();
    frame.name = s.name;
    b.style(frame, s.node);
    b.children(frame, s.node, components);
    frame.setPluginData(NODE_KEY, key);
    if (!screens[key]) {
      sPage.appendChild(frame);
      frame.x = i * (s.width + 120);
      frame.y = 0;
    }
  });
  return {
    ...b.stats,
    components: spec.components.length,
    screens: spec.screens.length,
  };
}

// Fil principal du plugin (API Figma). Concaténé après logic.js dans code.js.
// N'écrit que dans la collection « Revela · DS-Studio », après clic sur un plan
// affiché, puis relit les variables pour prouver l'écriture.

figma.showUI(__html__, { width: 480, height: 700, themeColors: true });

// Collection du projet choisi dans le plugin (Revela par défaut).
async function readFigma(name = COLLECTION) {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = all.find((c) => c.name === name) || null;
  const variables = {};
  if (!collection) return { collection, state: { revision: null, variables } };
  const mode = collection.modes[0].modeId;
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (!v) continue;
    const written = v.getPluginData(WRITTEN);
    variables[v.name] = {
      type: v.resolvedType,
      value: v.valuesByMode[mode],
      written: written ? JSON.parse(written) : undefined,
      variable: v,
    };
  }
  return {
    collection,
    state: { revision: collection.getPluginData(REVISION) || null, variables },
  };
}

async function apply(source, expected, overwrite) {
  const name = source.collection || COLLECTION;
  const { collection: found, state } = await readFigma(name);
  const p = plan(source, state);
  // Validation liée au plan affiché : si Figma ou DS-Studio a bougé, rien n'est écrit.
  if (planKey(p) !== expected)
    throw new Error(
      'Figma ou DS-Studio a changé depuis l’affichage du diff : relisez avant d’appliquer.',
    );
  // Sans accord, les variables modifiées dans Figma sont laissées intactes.
  // Un conflit de type n'est jamais remplacé.
  const replaceable = p.conflicts.filter((c) => !c.reason.startsWith('type'));
  const collection = found || figma.variables.createVariableCollection(name);
  const mode = collection.modes[0].modeId;
  const rows = [...p.create, ...p.update, ...(overwrite ? replaceable : [])];
  for (const row of rows) {
    const token = source.tokens[row.key];
    const value = toFigma(token);
    const v =
      (state.variables[row.name] && state.variables[row.name].variable) ||
      figma.variables.createVariable(row.name, collection, row.type);
    v.setValueForMode(mode, value);
    v.scopes = scopesFor(row.key, token);
    v.description = `Géré par DS-Studio · révision ${source.revision}`;
    v.setPluginData(WRITTEN, JSON.stringify(value));
  }
  collection.setPluginData(REVISION, String(source.revision));
  // Relecture complète après écriture.
  const after = plan(source, (await readFigma(name)).state);
  return { written: rows.length, readback: after, synced: isSynced(after) };
}

// Variables de la collection, par nom (« color/brand »), pour les liaisons.
async function variablesByName() {
  const { state } = await readFigma();
  return Object.fromEntries(
    Object.entries(state.variables).map(([name, v]) => [name, v.variable]),
  );
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'plan') {
      const { state } = await readFigma(msg.source.collection || COLLECTION);
      const p = plan(msg.source, state);
      figma.ui.postMessage({ type: 'plan', plan: p, key: planKey(p) });
    } else if (msg.type === 'apply') {
      const result = await apply(msg.source, msg.key, msg.overwrite === true);
      figma.ui.postMessage({ type: 'applied', ...result });
      figma.notify(
        result.synced
          ? `Variables Figma à jour (révision ${msg.source.revision}), relues.`
          : 'Écriture faite, mais la relecture montre des écarts.',
      );
    } else if (msg.type === 'build') {
      const variables = await variablesByName();
      if (!Object.keys(variables).length)
        throw new Error(
          'Appliquez d’abord les variables : les composants s’y lient.',
        );
      const result = await buildAll(figma, msg.spec, variables);
      figma.ui.postMessage({ type: 'built', ...result });
      figma.notify(
        `${result.components} composants et ${result.screens} écrans construits, liés aux variables.`,
      );
    } else if (msg.type === 'close') figma.closePlugin();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
  }
};
