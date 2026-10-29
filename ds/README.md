# DS Revela

Le Design System de Revela, piloté par DS-Studio.

| Fichier              | Rôle                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `tokens.css`         | **Généré** par DS-Studio après chaque validation : ne pas l’éditer    |
| `src/styles.css`     | Styles des composants, uniquement en `var(--…)` issues des tokens     |
| `src/components.tsx` | Composants React (Button, LiveBadge, Alert, Thumb, Slider…) et écrans |
| `src/index.ts`       | Point d’entrée                                                        |

## Utiliser dans un projet React

```tsx
import './ds/tokens.css';
import './ds/src/styles.css';
import { Button, Alert } from './ds/src/index';

<div className="ds">
  <Button>Déclencher</Button>
  <Alert tone="warning">Vitesse tenue par le boîtier.</Alert>
</div>;
```

Les composants s’affichent dans un conteneur `.ds` (ou `DSProvider`). Sans
surcharge, ils prennent les valeurs de `tokens.css` ; DS-Studio passe les
valeurs du brouillon à `DSProvider` pour l’aperçu avant validation.

`tokens.css` porte en en-tête la révision et une empreinte : DS-Studio refuse
d’écraser un fichier modifié à la main.
