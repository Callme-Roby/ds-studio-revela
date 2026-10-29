// Fichier généré par npm run figma:build : modifier figma-plugin/src/.
// Logique pure du plugin : aucune dépendance à l'API Figma, testée par npm test.
// Le script de build retire les mots-clés export pour produire code.js.

const COLLECTION = 'Revela · DS-Studio';
// Valeur écrite par le plugin, mémorisée sur chaque variable pour repérer
// une modification faite à la main dans Figma.
const WRITTEN = 'ds-studio-value';
const REVISION = 'ds-studio-revision';

function variableName(key) {
  return key.replace('.', '/');
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
  if (key.includes('text') || key.includes('muted') || key.startsWith('color.on'))
    return ['TEXT_FILL'];
  if (key.includes('border') || key.includes('focus')) return ['STROKE_COLOR'];
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
        .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
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

// Fil principal du plugin (API Figma). Concaténé après logic.js dans code.js.
// N'écrit que dans la collection « Revela · DS-Studio », après clic sur un plan
// affiché, puis relit les variables pour prouver l'écriture.

figma.showUI(__html__, { width: 460, height: 640, themeColors: true });

async function readFigma() {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = all.find((c) => c.name === COLLECTION) || null;
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
  const { collection: found, state } = await readFigma();
  const p = plan(source, state);
  // Validation liée au plan affiché : si Figma ou DS-Studio a bougé, rien n'est écrit.
  if (planKey(p) !== expected)
    throw new Error(
      'Figma ou DS-Studio a changé depuis l’affichage du diff : relisez avant d’appliquer.',
    );
  // Sans accord, les variables modifiées dans Figma sont laissées intactes.
  // Un conflit de type n'est jamais remplacé.
  const replaceable = p.conflicts.filter((c) => !c.reason.startsWith('type'));
  const collection =
    found || figma.variables.createVariableCollection(COLLECTION);
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
  const after = plan(source, (await readFigma()).state);
  return { written: rows.length, readback: after, synced: isSynced(after) };
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'plan') {
      const { state } = await readFigma();
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
    } else if (msg.type === 'close') figma.closePlugin();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: e.message || String(e) });
  }
};
