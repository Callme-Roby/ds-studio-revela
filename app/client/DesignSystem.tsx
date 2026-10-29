import * as DS from '../../ds/src/index.js';
import { tokenCss, type Tokens } from '../shared/model.js';

// Les composants viennent du DS du dépôt (ds/src) : l'aperçu affiche le vrai
// code, avec les variables du brouillon à la place de ds/tokens.css.
export * from '../../ds/src/index.js';

export function Scenario({
  tokens,
  scenario,
}: {
  tokens: Tokens;
  scenario: string;
}) {
  return <DS.Scenario vars={tokenCss(tokens)} scenario={scenario} />;
}
export function ItemPreview({ tokens, id }: { tokens: Tokens; id: string }) {
  const item = DS.catalog.find((i) => i.id === id);
  if (!item) return <p role="alert">Composant inconnu : {id}</p>;
  return (
    <DS.DSProvider vars={tokenCss(tokens)}>
      <div className="catalog-demo">
        <item.Demo />
      </div>
    </DS.DSProvider>
  );
}
