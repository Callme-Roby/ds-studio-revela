import {
  applyChanges,
  contrast,
  type Proposal,
  type TokenKey,
  type Tokens,
} from './model.js';

// Contrôles métier de Revela (workspace/DESIGN_RULES.md), calculés sur les tokens.
// Ce sont des alertes pour la décision humaine, pas une certification.

export interface Finding {
  id: string;
  rule: 'neutralité' | 'contraste' | 'taille' | 'échelle';
  message: string;
}
export interface Audit {
  introduced: Finding[];
  resolved: Finding[];
  remaining: Finding[];
}

// Gris d'interface : une teinte fausserait la perception des couleurs de la photo.
const neutralKeys: TokenKey[] = [
  'color.surface',
  'color.canvas',
  'color.surfaceHover',
  'color.mat',
  'color.text',
  'color.muted',
  'color.disabled',
  'color.border',
  'color.borderStrong',
  'color.onBrand',
];
// Paires réellement affichées par les composants : [premier plan, fond, minimum, usage].
const pairs: [TokenKey, TokenKey, number, string][] = [
  ['color.text', 'color.surface', 4.5, 'texte courant'],
  ['color.text', 'color.canvas', 4.5, 'texte sur fond secondaire'],
  ['color.text', 'color.surfaceHover', 4.5, 'texte au survol'],
  ['color.muted', 'color.surface', 4.5, 'libellés et texte secondaire'],
  ['color.muted', 'color.canvas', 4.5, 'texte secondaire sur fond secondaire'],
  ['color.onBrand', 'color.brand', 4.5, 'texte des actions principales'],
  ['color.onBrand', 'color.brandHover', 4.5, 'action principale au survol'],
  ['color.onBrand', 'color.danger', 4.5, 'bouton de suppression'],
  ['color.danger', 'color.surface', 4.5, 'texte d’erreur'],
  ['color.danger', 'color.dangerSurface', 4.5, 'alerte d’erreur'],
  ['color.warning', 'color.warningSurface', 4.5, 'alerte du boîtier'],
  ['color.success', 'color.surface', 4.5, 'état prêt et mention JPEG'],
  ['color.canvas', 'color.mat', 4.5, 'bulle d’aide sur le passe-partout'],
  ['color.borderStrong', 'color.surface', 3, 'contour des champs'],
  ['color.borderStrong', 'color.canvas', 3, 'contour sur fond secondaire'],
  ['color.focus', 'color.surface', 3, 'anneau de focus'],
];
const minText = 10;
const fontScale: TokenKey[] = ['font.xs', 'font.sm', 'font.md', 'font.lg', 'font.xl'];
const spaceScale: TokenKey[] = [
  'space.2xs',
  'space.xs',
  'space.sm',
  'space.md',
  'space.lg',
  'space.xl',
  'space.2xl',
];

const value = (t: Tokens, k: TokenKey) => t[k].$value;

export function findings(t: Tokens): Finding[] {
  const out: Finding[] = [];
  for (const k of neutralKeys) {
    const hex = String(value(t, k));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 0)
      out.push({
        id: `neutral:${k}`,
        rule: 'neutralité',
        message: `${k} (${hex}) n’est pas un gris neutre : écart de ${spread} entre les canaux.`,
      });
  }
  for (const [fg, bg, min, usage] of pairs) {
    const ratio = contrast(String(value(t, fg)), String(value(t, bg)));
    if (ratio < min)
      out.push({
        id: `contrast:${fg}:${bg}`,
        rule: 'contraste',
        message: `${usage} : ${fg} sur ${bg} = ${ratio.toFixed(2)}:1, minimum ${min}:1.`,
      });
  }
  // Libellés et navigation sont dérivés de font.body × 0,8 dans les composants.
  const sizes: [string, number][] = [
    ...fontScale.map((k) => [k, Number(value(t, k))] as [string, number]),
    ['font.body × 0,8 (libellés)', Number(value(t, 'font.body')) * 0.8],
  ];
  for (const [name, px] of sizes)
    if (px < minText)
      out.push({
        id: `size:${name}`,
        rule: 'taille',
        message: `${name} = ${+px.toFixed(2)} px, sous le minimum de ${minText} px.`,
      });
  for (const scale of [fontScale, spaceScale])
    for (let i = 1; i < scale.length; i++)
      if (Number(value(t, scale[i])) < Number(value(t, scale[i - 1])))
        out.push({
          id: `scale:${scale[i]}`,
          rule: 'échelle',
          message: `${scale[i]} est plus petit que ${scale[i - 1]} : échelle inversée.`,
        });
  return out;
}

export function audit(before: Tokens, after: Tokens): Audit {
  const a = findings(before);
  const b = findings(after);
  const had = new Set(a.map((f) => f.id));
  const has = new Set(b.map((f) => f.id));
  return {
    introduced: b.filter((f) => !had.has(f.id)),
    resolved: a.filter((f) => !has.has(f.id)),
    remaining: b.filter((f) => had.has(f.id)),
  };
}

// Avant/après reconstruits depuis les patches : reste juste si l'état a changé entre-temps.
export function auditProposal(tokens: Tokens, p: Proposal): Audit | undefined {
  try {
    const at = (side: 'before' | 'after') =>
      applyChanges(
        tokens,
        p.patches.map((x) => ({ key: x.key, value: x[side] })),
      );
    return audit(at('before'), at('after'));
  } catch {
    return undefined;
  }
}
