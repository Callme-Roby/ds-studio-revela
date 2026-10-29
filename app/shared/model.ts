import { z } from 'zod';

// Ce sous-ensemble explicite utilise les noms $type/$value, pas toute la norme DTCG.
const color = z
  .object({
    $type: z.literal('color'),
    $value: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue : #RRGGBB'),
  })
  .strict();
const dimension = z
  .object({
    $type: z.literal('dimension'),
    $value: z.number().finite().min(0).max(128),
  })
  .strict();
const font = z
  .object({
    $type: z.literal('fontFamily'),
    $value: z.enum(['system-ui', 'Arial', 'Georgia', 'Verdana']),
  })
  .strict();
// Liste figée des clés de la version 1 : seuls ces noms existent dans un état v1.
const v1Shape = {
  'color.brand': color,
  'color.brandHover': color,
  'color.onBrand': color,
  'color.surface': color,
  'color.canvas': color,
  'color.text': color,
  'color.muted': color,
  'color.border': color,
  'color.danger': color,
  'color.success': color,
  'color.focus': color,
  'font.family': font,
  'font.body': dimension,
  'font.heading': dimension,
  'space.sm': dimension,
  'space.md': dimension,
  'space.lg': dimension,
  'radius.control': dimension,
};
// Version 2 : clés Revela ajoutées, les 18 clés v1 gardent nom, type et sens.
export const tokensSchema = z
  .object({
    ...v1Shape,
    'color.surfaceHover': color,
    'color.mat': color,
    'color.disabled': color,
    'color.borderStrong': color,
    'color.dangerSurface': color,
    'color.warning': color,
    'color.warningSurface': color,
    'color.warningBorder': color,
    'color.pick': color,
    'color.channelR': color,
    'color.channelG': color,
    'color.channelB': color,
    'color.maskHandle': color,
    'color.aiStart': color,
    'color.aiMid': color,
    'color.aiEnd': color,
    'font.xs': dimension,
    'font.sm': dimension,
    'font.md': dimension,
    'font.lg': dimension,
    'font.xl': dimension,
    'space.2xs': dimension,
    'space.xs': dimension,
    'space.xl': dimension,
    'space.2xl': dimension,
    'radius.md': dimension,
    'radius.lg': dimension,
  })
  .strict();
export type Tokens = z.infer<typeof tokensSchema>;
export type TokenKey = keyof Tokens;
export const tokenKeys = Object.keys(tokensSchema.shape) as TokenKey[];
const v1TokenKeys = Object.keys(v1Shape) as TokenKey[];
// Valeurs données aux clés v2 lors de la migration d'un état v1 (inventaire Revela).
export const v2Additions: Omit<Tokens, keyof typeof v1Shape> = {
  'color.surfaceHover': { $type: 'color', $value: '#EBEBEB' },
  'color.mat': { $type: 'color', $value: '#2E2E2E' },
  'color.disabled': { $type: 'color', $value: '#8A8A8A' },
  'color.borderStrong': { $type: 'color', $value: '#8A8A8A' },
  'color.dangerSurface': { $type: 'color', $value: '#FDF3F3' },
  'color.warning': { $type: 'color', $value: '#8F5600' },
  'color.warningSurface': { $type: 'color', $value: '#FDF0DD' },
  'color.warningBorder': { $type: 'color', $value: '#E0A760' },
  'color.pick': { $type: 'color', $value: '#F5A623' },
  'color.channelR': { $type: 'color', $value: '#D02A2A' },
  'color.channelG': { $type: 'color', $value: '#1F9E3F' },
  'color.channelB': { $type: 'color', $value: '#2B62D9' },
  'color.maskHandle': { $type: 'color', $value: '#66CCFF' },
  'color.aiStart': { $type: 'color', $value: '#E08A3C' },
  'color.aiMid': { $type: 'color', $value: '#4A5A9E' },
  'color.aiEnd': { $type: 'color', $value: '#A95BB0' },
  'font.xs': { $type: 'dimension', $value: 10 },
  'font.sm': { $type: 'dimension', $value: 11 },
  'font.md': { $type: 'dimension', $value: 12 },
  'font.lg': { $type: 'dimension', $value: 13 },
  'font.xl': { $type: 'dimension', $value: 15 },
  'space.2xs': { $type: 'dimension', $value: 2 },
  'space.xs': { $type: 'dimension', $value: 4 },
  'space.xl': { $type: 'dimension', $value: 24 },
  'space.2xl': { $type: 'dimension', $value: 32 },
  'radius.md': { $type: 'dimension', $value: 6 },
  'radius.lg': { $type: 'dimension', $value: 20 },
};
export type TokenValue = string | number;
export const changeSchema = z
  .object({
    key: z.enum(tokenKeys as [TokenKey, ...TokenKey[]]),
    value: z.union([z.string().max(100), z.number().finite()]),
  })
  .strict();
export const proposeSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    changes: z.array(changeSchema).min(1).max(50),
  })
  .strict();
export interface Patch {
  key: TokenKey;
  before: TokenValue;
  after: TokenValue;
}
export interface Revision {
  id: string;
  revision: number;
  date: string;
  source: 'manual' | 'codex' | 'claude' | 'import' | 'undo';
  patches: Patch[];
}
export interface State {
  version: 2;
  revision: number;
  tokens: Tokens;
  history: Revision[];
}
export interface Proposal {
  id: string;
  revision: number;
  source: Revision['source'];
  patches: Patch[];
}
function stateShape<V extends number>(
  version: V,
  tokens: z.ZodType,
  keys: TokenKey[],
) {
  const patch = z
    .object({
      key: z.enum(keys as [TokenKey, ...TokenKey[]]),
      before: z.union([z.string(), z.number()]),
      after: z.union([z.string(), z.number()]),
    })
    .strict();
  return z
    .object({
      version: z.literal(version),
      revision: z.number().int().nonnegative(),
      tokens,
      history: z.array(
        z
          .object({
            id: z.string().uuid(),
            revision: z.number().int().positive(),
            date: z.string().datetime(),
            source: z.enum(['manual', 'codex', 'claude', 'import', 'undo']),
            patches: z.array(patch).min(1),
          })
          .strict(),
      ),
    })
    .strict();
}
export const stateSchema = stateShape(2, tokensSchema, tokenKeys);
const v1StateSchema = stateShape(1, z.object(v1Shape).strict(), v1TokenKeys);
// Migration v1 → v2 : tokens et historique conservés tels quels, nouvelles clés ajoutées.
// Une révision ancienne reste annulable car ses patches ne touchent que des clés v1.
export function migrateState(input: unknown): {
  state: State;
  migratedFrom?: 1;
} {
  const version = (input as { version?: unknown } | null)?.version;
  if (version !== 1) return { state: stateSchema.parse(input) as State };
  const v1 = v1StateSchema.parse(input);
  const state = stateSchema.parse({
    ...v1,
    version: 2,
    tokens: { ...(v1.tokens as object), ...structuredClone(v2Additions) },
  }) as State;
  return { state, migratedFrom: 1 };
}
export const agentReplySchema = z
  .object({
    message: z.string().max(12000),
    changes: z.array(changeSchema).max(20),
  })
  .strict();
export type AgentReply = z.infer<typeof agentReplySchema>;
export function applyChanges(
  tokens: Tokens,
  changes: { key: TokenKey; value: TokenValue }[],
): Tokens {
  const next = structuredClone(tokens);
  if (new Set(changes.map((c) => c.key)).size !== changes.length)
    throw new Error('Un token ne peut apparaître deux fois.');
  for (const change of changes) next[change.key].$value = change.value as never;
  return tokensSchema.parse(next);
}
export function diff(before: Tokens, after: Tokens): Patch[] {
  return tokenKeys
    .filter((key) => before[key].$value !== after[key].$value)
    .map((key) => ({
      key,
      before: before[key].$value,
      after: after[key].$value,
    }));
}
export function tokenCss(tokens: Tokens): Record<string, string> {
  return Object.fromEntries(
    tokenKeys.map((key) => [
      `--${key.replaceAll('.', '-')}`,
      `${tokens[key].$value}${tokens[key].$type === 'dimension' ? 'px' : ''}`,
    ]),
  );
}
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = hex
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
