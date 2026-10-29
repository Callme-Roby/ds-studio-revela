// Types des fonctions pures de build.js, pour les tests.
import type {
  FigmaSpec,
  SpecFrame,
  SpecText,
} from '../../app/shared/figma-spec.js';

export const NODE_KEY: string;
export const PAGES: { components: string; screens: string };
export function fontStyle(weight: number): string;
export function variantNames(variants: string[]): string[];
export function buildSummary(spec: FigmaSpec): {
  revision: number;
  codeRevision: number;
  components: number;
  variants: number;
  screens: string[];
};
export function textRuns(node: SpecFrame | SpecText, out?: string[]): string[];
export function fontsUsed(spec: FigmaSpec): string[];
export function buildAll(
  api: unknown,
  spec: FigmaSpec,
  variables: Record<string, unknown>,
): Promise<{
  nodes: number;
  bound: number;
  instances: number;
  components: number;
  screens: number;
}>;
