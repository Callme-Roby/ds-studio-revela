# DS Revela

Le Design System de Revela, piloté par DS-Studio.

| Fichier                         | Rôle                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `tokens.css`                    | **Généré** par DS-Studio après chaque validation : ne pas l’éditer    |
| `src/components/<Nom>.tsx`      | Un composant React par fichier (Button, LiveBadge, Alert, Thumb…)     |
| `src/components/<Nom>.css`      | Ses styles, uniquement en `var(--…)` issues de `tokens.css`           |
| `src/screens/`                  | Écrans de Revela (Prise de vue, Bibliothèque, Développement)          |
| `src/provider.tsx`, `base.css`  | Conteneur `.ds` (typographie, focus) et surcharge des variables       |
| `src/catalog.tsx`               | Registre du catalogue : nom, groupe, fichiers et démonstration        |
| `src/index.ts`                  | Point d’entrée                                                        |

Chaque composant importe son propre CSS. Pour ajouter un composant au
catalogue de DS-Studio, créez `components/<Nom>.tsx` et `.css`, exportez-le dans
`index.ts` et ajoutez une entrée dans `catalog.tsx` (avec `files` et `Demo`).

## Utiliser dans un projet React

```tsx
import './ds/tokens.css';
import { DSProvider, Button, Alert } from './ds/src/index';

<DSProvider>
  <Button>Déclencher</Button>
  <Alert tone="warning">Vitesse tenue par le boîtier.</Alert>
</DSProvider>;
```

Sans surcharge, les composants prennent les valeurs de `tokens.css` ; DS-Studio
passe les valeurs du brouillon à `DSProvider` pour l’aperçu avant validation.

`tokens.css` porte en en-tête la révision et une empreinte : DS-Studio refuse
d’écraser un fichier modifié à la main. Les fichiers de `src/` modifiés depuis
DS-Studio passent par un diff, un aperçu compilé et une validation ; chaque
validation est une révision de code (`c1`, `c2`…), annulable.
