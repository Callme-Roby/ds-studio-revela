// Construction des composants et écrans Figma à partir de l'export DS-Studio
// (/api/figma/spec). Concaténé après logic.js dans code.js.
// - Pages gérées « Revela · Composants » et « Revela · Écrans », retrouvées
//   par donnée de plugin ; rien d'autre dans le fichier n'est touché.
// - Couleurs, marges internes, espacements, rayons et tailles de texte liés aux
//   variables de la collection « Revela · DS-Studio » quand le token est connu.
// - Un composant déjà construit est vidé puis reconstruit sur place : son
//   identifiant ne change pas, les instances ailleurs dans le fichier suivent.

import { variableName } from './logic.js';

export const NODE_KEY = 'ds-studio-node';
export const PAGES = {
  components: 'Revela · Composants',
  screens: 'Revela · Écrans',
};

export const fontStyle = (w) =>
  w >= 700 ? 'Bold' : w >= 600 ? 'Semi Bold' : w >= 500 ? 'Medium' : 'Regular';

// Noms de variantes Figma « clé=valeur, clé=valeur » avec les mêmes clés partout.
export function variantNames(variants) {
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
export function buildSummary(spec) {
  return {
    revision: spec.revision,
    codeRevision: spec.codeRevision,
    components: spec.components.length,
    variants: spec.components.reduce((n, c) => n + c.variants.length, 0),
    screens: spec.screens.map((s) => s.name),
  };
}

export function textRuns(node, out = []) {
  if (node.kind === 'text') out.push(node.characters);
  else for (const c of node.children) textRuns(c, out);
  return out;
}

export function fontsUsed(spec) {
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

export async function buildAll(api, spec, variables) {
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
