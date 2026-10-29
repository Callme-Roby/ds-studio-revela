# DS-Studio — instructions communes

Lire [START_HERE.md](START_HERE.md). Le contexte appartient à l’étudiant.

## Carte du dépôt

- `app/shared/model.ts` : contrat des tokens, validations, diff et variables CSS.
- `app/server/store.ts` : propositions, journal local et annulations sélectives.
- `app/server/http.ts` : frontière HTTP locale et routes à périmètre fermé.
- `ds/` : DS Revela livré avec le dépôt (`tokens.css` généré ; `src/components/`
  un TSX + un CSS par composant, `screens/`, `catalog.tsx` registre du catalogue).
  `app/client/DesignSystem.tsx` l’affiche avec les variables du brouillon.
- `app/client/` : coquille (`App.tsx`, barre latérale), `views/` (Aperçu,
  Variables, Composants, Historique, Intégrations), `Assistant.tsx` flottant,
  dialogues de diff (`TokenDiffDialog`, `CodeDiffDialog`).
- `app/server/code-target.ts` : écriture de `tokens.css` (par défaut `ds/tokens.css`).
- `app/server/components.ts` : propositions de code limitées à `ds/src`, diff,
  validation relue, journal `components-history.json`, annulation ;
  `preview-build.ts` (aperçu compilé en mémoire), `git.ts` (commit local facultatif).
- `app/server/registry.ts` + `app/shared/projects.ts` : projets (Revela intégré,
  projets externes déclarés), un dossier d’état par projet, état Git en lecture seule.
- `app/shared/token-sources.ts` + `app/server/external-tokens.ts` : tokens d’un
  projet externe (CSS, SCSS, JSON) lus et réécrits sur place, propositions, journal.
- `app/server/project-git.ts` : clonage GitHub, état, récupération et envoi sur
  clic (jamais de force-push) ; composants externes via `ComponentStore` (scope).
- `app/server/settings.ts` (démarrage fait, IA choisie), `app/server/detect.ts`
  (détection en lecture seule) ; `app/client/Onboarding.tsx` : assistant de démarrage.
- `connectors/agents/claude-code.ts` : agent de code sur une copie temporaire de
  `ds/`, outils fichiers seulement ; ses différences deviennent une proposition.
- `connectors/agents/` : Codex et Claude Code (profil sans outils) qualifiés, Gemini indisponible.
- `connectors/figma/` : contrat ; `figma-plugin/` : plugin de développement (variables).
- `workspace/` : PFE, règles, décisions et DS d’exemple versionnables.
- `.ds-studio/` : état privé d’exécution, jamais à commiter.

Ne remplacez pas le mécanisme de validation par un accès fichier libre de l’agent.
Ne laissez pas de commande ou d’écriture proposée s’exécuter automatiquement.
Le chat embarqué refuse toute exécution de commande, plutôt que de fournir une fausse
dialogue de permissions. Le chat Variables ne propose que des tokens connus ;
l’agent de code n’édite qu’une copie temporaire de `ds/` et seules ses différences
dans `ds/src` deviennent une proposition, soumise au diff et à la validation.
Le brief privé possède sa propre API fermée.

## Skills

Codex peut découvrir `.agents/skills/`. Utilisez `$token-change` pour une évolution
de token et `$component-audit` pour vérifier sa propagation. Les autres agents
peuvent lire ces fichiers explicitement ; leur découverte native n’est pas affirmée.

## Vérifications

`npm run check`, `npm test`, `npm run build`, puis `npm run test:e2e` pour un
changement de parcours. Installer Chromium de test par `npx playwright install chromium`
si nécessaire. Ne pas lancer `npm run test:live` sans besoin de qualifier Codex :
il contacte un service IA et peut consommer du quota. `npm run scan` vérifie les
fichiers suivis par Git, sans inspecter les identifiants de la machine.

## V2

Le brief privé est géré par `app/server/project.ts`, son schéma par
`app/shared/project.ts`. Les écritures atomiques partagées sont dans
`app/server/files.ts`. Lire `docs/V2_CHANGELOG.md` pour les nouvelles frontières.
La récupération explicite utilise le même bail que le serveur. Ne contournez pas
ce bail et ne remplacez jamais une restauration par un effacement de `.ds-studio/`.
