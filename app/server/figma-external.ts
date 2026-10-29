import type { ExternalToken } from './external-tokens.js';

// Variables d'un projet externe au format lu par le plugin Figma :
// couleurs en #RRGGBB, dimensions en pixels (rem/em × 16), le reste en texte.
// Une valeur non convertible (calc(), var(), %…) devient une variable texte.

type PluginToken = {
  $type: 'color' | 'dimension' | 'string';
  $value: string | number;
};

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

export function toPluginToken(
  t: Pick<ExternalToken, 'type' | 'value'>,
): PluginToken {
  const v = t.value.trim();
  if (t.type === 'color') {
    let m = v.match(/^#([0-9a-f]{3,4})$/i);
    if (m)
      return {
        $type: 'color',
        $value: (
          '#' + [...m[1].slice(0, 3)].map((c) => c + c).join('')
        ).toUpperCase(),
      };
    m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (m) return { $type: 'color', $value: `#${m[1].toUpperCase()}` };
    m = v.match(
      /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i,
    );
    if (m)
      return {
        $type: 'color',
        $value: `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`.toUpperCase(),
      };
  }
  if (t.type === 'dimension') {
    const m = v.match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
    if (m)
      return {
        $type: 'dimension',
        $value: Number(m[1]) * (m[2] === 'rem' || m[2] === 'em' ? 16 : 1),
      };
  }
  return { $type: 'string', $value: v };
}

// Clés uniques : un même nom dans deux fichiers garde le nom du fichier en préfixe.
export function pluginTokens(tokens: ExternalToken[]) {
  const count = new Map<string, number>();
  for (const t of tokens) count.set(t.key, (count.get(t.key) ?? 0) + 1);
  const out: Record<string, PluginToken> = {};
  for (const t of tokens) {
    const key =
      count.get(t.key)! > 1
        ? `${t.file.replace(/\.[^.]+$/, '')}.${t.key}`
        : t.key;
    out[key] = toPluginToken(t);
  }
  return out;
}
