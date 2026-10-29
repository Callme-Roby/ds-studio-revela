// Tokens d'un projet externe, lus et réécrits sur place dans ses propres
// fichiers : variables CSS (:root), variables SCSS ($var), JSON (plat ou DTCG).
// Fonctions pures : aucune lecture disque ici, testables directement.

export type Format = 'css' | 'scss' | 'json';
export type TokenType = 'color' | 'dimension' | 'other';
export type FoundToken = {
  key: string;
  value: string;
  type: TokenType;
  line: number;
  // Position de la valeur dans le texte (CSS/SCSS), pour la remplacer sur place.
  start?: number;
  end?: number;
};

export const formatOf = (file: string): Format | null =>
  file.endsWith('.css')
    ? 'css'
    : file.endsWith('.scss')
      ? 'scss'
      : file.endsWith('.json')
        ? 'json'
        : null;

const colorRe =
  /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^)]*\))$/i;
const dimensionRe = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|pt)?$/;
export function typeOf(value: string): TokenType {
  const v = value.trim();
  if (colorRe.test(v)) return 'color';
  if (dimensionRe.test(v)) return 'dimension';
  return 'other';
}

// Valeur acceptable pour un token de ce type : jamais de quoi casser le fichier.
export function validValue(type: TokenType, value: string): string | null {
  const v = value.trim();
  if (!v) return 'Valeur vide.';
  if (/[;{}\n\r]/.test(v))
    return 'Caractères interdits (; { } ou retour à la ligne).';
  if (v.length > 200) return 'Valeur trop longue (200 caractères maximum).';
  if (type === 'color' && !colorRe.test(v))
    return 'Couleur attendue (#RRGGBB, rgb(), hsl()…).';
  if (type === 'dimension' && !dimensionRe.test(v))
    return 'Dimension attendue (ex. 16px, 1.5rem, 0).';
  return null;
}

const lineAt = (text: string, index: number) =>
  text.slice(0, index).split('\n').length;

// Variables CSS déclarées dans :root, html, :host ou @theme (Tailwind 4) ; les
// autres sélecteurs (thèmes, composants) sont comptés mais pas édités ici.
export function parseCss(text: string) {
  const tokens: FoundToken[] = [];
  let ignored = 0;
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  for (const block of clean.matchAll(blockRe)) {
    // Le sélecteur suit la dernière instruction (@import "…"; par exemple).
    const selector = block[1].split(';').pop()!.trim();
    const root =
      /^(:root|html|:host)(\s*,\s*(:root|html|:host))*$/.test(selector) ||
      /^@theme(\s+[a-z]+)*$/.test(selector);
    const bodyStart = block.index! + block[0].indexOf('{') + 1;
    for (const d of block[2].matchAll(
      /--([A-Za-z0-9_-]+)\s*:\s*([^;]*?)\s*(;|$)/g,
    )) {
      if (!root) {
        ignored++;
        continue;
      }
      const valueOffset = d.index! + d[0].indexOf(':') + 1;
      const raw = block[2].slice(valueOffset);
      const lead = raw.length - raw.trimStart().length;
      const start = bodyStart + valueOffset + lead;
      const value = d[2];
      if (tokens.some((t) => t.key === d[1])) continue;
      tokens.push({
        key: d[1],
        value,
        type: typeOf(value),
        line: lineAt(text, start),
        start,
        end: start + value.length,
      });
    }
  }
  return { tokens, ignored };
}

export function parseScss(text: string) {
  const tokens: FoundToken[] = [];
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  let depth = 0;
  let i = 0;
  // Variables de premier niveau seulement (hors blocs).
  for (const line of clean.split('\n')) {
    const m =
      depth === 0
        ? line.match(/^\s*\$([A-Za-z0-9_-]+)\s*:\s*(.+?)(\s*!default)?\s*;/)
        : null;
    if (m) {
      const value = m[2];
      const start = i + line.indexOf(value, line.indexOf(':') + 1);
      if (!tokens.some((t) => t.key === m[1]))
        tokens.push({
          key: m[1],
          value,
          type: typeOf(value),
          line: lineAt(text, start),
          start,
          end: start + value.length,
        });
    }
    for (const c of line) depth += c === '{' ? 1 : c === '}' ? -1 : 0;
    i += line.length + 1;
  }
  return { tokens, ignored: 0 };
}

// JSON : feuilles texte/nombre (clé = chemin pointé) ; un objet avec $value
// (format DTCG) est une feuille, son $type est respecté quand il est connu.
export function parseJson(text: string) {
  const data = JSON.parse(text) as unknown;
  const tokens: FoundToken[] = [];
  const lines = text.split('\n');
  const findLine = (k: string) =>
    Math.max(1, lines.findIndex((l) => l.includes(`"${k}"`)) + 1);
  const walk = (node: unknown, path: string[]) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const o = node as Record<string, unknown>;
      if (
        '$value' in o &&
        (typeof o.$value === 'string' || typeof o.$value === 'number')
      ) {
        const value = String(o.$value);
        const declared =
          o.$type === 'color'
            ? 'color'
            : o.$type === 'dimension'
              ? 'dimension'
              : null;
        tokens.push({
          key: path.join('.'),
          value,
          type: declared ?? typeOf(value),
          line: findLine(path.at(-1)!),
        });
        return;
      }
      for (const [k, v] of Object.entries(o))
        if (!k.startsWith('$')) walk(v, [...path, k]);
    } else if (typeof node === 'string' || typeof node === 'number') {
      const value = String(node);
      tokens.push({
        key: path.join('.'),
        value,
        type: typeOf(value),
        line: findLine(path.at(-1)!),
      });
    }
  };
  walk(data, []);
  return { tokens, ignored: 0 };
}

export function parse(format: Format, text: string) {
  return format === 'css'
    ? parseCss(text)
    : format === 'scss'
      ? parseScss(text)
      : parseJson(text);
}

// Réécrit seulement les valeurs demandées, le reste du fichier est conservé
// octet pour octet (CSS/SCSS) ; le JSON garde son indentation.
export function write(
  format: Format,
  text: string,
  changes: Record<string, string>,
) {
  if (format === 'json') {
    const data = JSON.parse(text) as Record<string, unknown>;
    for (const [key, value] of Object.entries(changes)) {
      const path = key.split('.');
      let node = data as Record<string, unknown>;
      for (const p of path.slice(0, -1))
        node = node[p] as Record<string, unknown>;
      const last = path.at(-1)!;
      const cur = node[last];
      const typed = (old: unknown) =>
        typeof old === 'number' && !Number.isNaN(Number(value))
          ? Number(value)
          : value;
      if (cur && typeof cur === 'object' && '$value' in (cur as object))
        (cur as Record<string, unknown>).$value = typed(
          (cur as Record<string, unknown>).$value,
        );
      else node[last] = typed(cur);
    }
    const indent = text.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return (
      JSON.stringify(data, null, indent).replace(/\n/g, eol) +
      (/\r?\n$/.test(text) ? eol : '')
    );
  }
  const found = parse(format, text).tokens.filter((t) => t.key in changes);
  let out = text;
  for (const t of found.sort((a, b) => b.start! - a.start!))
    out = out.slice(0, t.start) + changes[t.key] + out.slice(t.end);
  return out;
}
