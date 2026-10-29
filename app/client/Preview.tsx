import { ItemPreview, Scenario } from './DesignSystem.js';
import { useDesignState } from './state.js';
import Capture from './Capture.js';

// Contenu des iframes : un écran de Revela (?scenario=) ou un seul composant (?item=).
export default function Preview() {
  const { state, error } = useDesignState();
  const params = new URLSearchParams(location.search);
  const item = params.get('item');
  if (params.get('capture') === '1') return <Capture />;
  if (!state) return <p role="alert">{error || 'Chargement de l’aperçu…'}</p>;
  return item ? (
    <ItemPreview tokens={state.tokens} id={item} />
  ) : (
    <Scenario
      tokens={state.tokens}
      scenario={params.get('scenario') ?? 'studio'}
    />
  );
}
