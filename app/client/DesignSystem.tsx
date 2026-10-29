import * as DS from '../../ds/src/index.js';
import { tokenCss, type Tokens } from '../shared/model.js';

// Les composants viennent du DS du dépôt (ds/src) : l'aperçu affiche le vrai
// code, avec les variables du brouillon à la place de ds/tokens.css.
export * from '../../ds/src/index.js';

export function Catalogue({ tokens }: { tokens: Tokens }) {
  return <DS.Catalogue vars={tokenCss(tokens)} />;
}
export function Scenario({
  tokens,
  scenario,
}: {
  tokens: Tokens;
  scenario: string;
}) {
  return <DS.Scenario vars={tokenCss(tokens)} scenario={scenario} />;
}
