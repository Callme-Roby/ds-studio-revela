// Logique pure du plugin : aucune dépendance à l'API Figma, testée par npm test.
// Le script de build retire les mots-clés export pour produire code.js.

export const COLLECTION = 'Revela · DS-Studio';
// Valeur écrite par le plugin, mémorisée sur chaque variable pour repérer
// une modification faite à la main dans Figma.
export const WRITTEN = 'ds-studio-value';
export const REVISION = 'ds-studio-revision';

export function variableName(key) {
  return key.replace('.', '/');
}
export function figmaType(token) {
  return token.$type === 'color'
    ? 'COLOR'
    : token.$type === 'dimension'
      ? 'FLOAT'
      : 'STRING';
}
// Portée Figma de chaque variable : elle n'apparaît que là où elle a un sens.
export function scopesFor(key, token) {
  if (token.$type === 'fontFamily') return ['FONT_FAMILY'];
  if (key.startsWith('font.')) return ['FONT_SIZE'];
  if (key.startsWith('space.')) return ['GAP', 'WIDTH_HEIGHT'];
  if (key.startsWith('radius.')) return ['CORNER_RADIUS'];
  if (key.includes('text') || key.includes('muted') || key.startsWith('color.on'))
    return ['TEXT_FILL'];
  if (key.includes('border') || key.includes('focus')) return ['STROKE_COLOR'];
  return ['ALL_FILLS', 'STROKE_COLOR'];
}
export function toFigma(token) {
  if (token.$type !== 'color') return token.$value;
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(token.$value.slice(i, i + 2), 16) / 255,
  );
  return { r, g, b, a: 1 };
}
export function display(value) {
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
export function same(a, b) {
  if (a && typeof a === 'object' && b && typeof b === 'object')
    return display(a) === display(b) && (a.a ?? 1) === (b.a ?? 1);
  return a === b;
}

// figma : { revision, variables: { nom: { type, value, written } } }
// written : valeur mémorisée lors de la dernière écriture du plugin (ou absente).
export function plan(source, figma) {
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
export function planKey(p) {
  return JSON.stringify([
    p.revision,
    p.create.map((r) => [r.name, r.after]),
    p.update.map((r) => [r.name, r.before, r.after]),
    p.conflicts.map((r) => [r.name, r.before, r.after]),
  ]);
}
export function isSynced(p) {
  return !p.create.length && !p.update.length && !p.conflicts.length;
}
