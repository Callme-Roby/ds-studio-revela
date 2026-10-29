// Types de la logique pure du plugin, pour les tests TypeScript.
import type { Tokens } from '../../app/shared/model.js';

type Token = Tokens[keyof Tokens];
export interface Row {
  key: string;
  name: string;
  type: 'COLOR' | 'FLOAT' | 'STRING';
  before?: string;
  after: string;
  reason?: string;
}
export interface Plan {
  revision: number | string;
  figmaRevision: string | null;
  create: Row[];
  update: Row[];
  conflicts: Row[];
  unchanged: number;
  extra: string[];
}
export interface FigmaState {
  revision?: string | null;
  variables: Record<string, { type: string; value: unknown; written?: unknown }>;
}
export const COLLECTION: string;
export const WRITTEN: string;
export const REVISION: string;
export function variableName(key: string): string;
export function figmaType(token: Token): Row['type'];
export function scopesFor(key: string, token: Token): string[];
export function toFigma(token: Token): unknown;
export function display(value: unknown): string;
export function same(a: unknown, b: unknown): boolean;
export function plan(
  source: { revision: number | string; tokens: Tokens },
  figma: FigmaState,
): Plan;
export function planKey(p: Plan): string;
export function isSynced(p: Plan): boolean;
