# DS-Studio · Revela

Un atelier **web local** pour faire évoluer le Design System de **Revela**
(application photo, projet de fin d’études) : on modifie les variables, on voit
l’aperçu sur les vrais composants et écrans, on valide un diff contrôlé, puis le
code et Figma suivent.

```
DS-Studio (http://127.0.0.1:4310)
  proposition (manuelle ou Claude) → diff + contrôles Revela → validation humaine
        │
        ├─> ds/tokens.css            code du DS (ou tokens.css d’un autre projet)
        └─> plugin Figma             variables « Revela · DS-Studio », relues
```

**Tout fonctionne sans compte** : mode manuel, aperçu, contrôles, historique et
écriture du code. Claude (IA) et Figma sont des options, chacune avec son compte.

## Démarrer en 3 commandes

Prérequis : **Node.js 22.12+** ([téléchargement](https://nodejs.org/en/download))
et Git. Testé sur Windows 11 avec Node 22.23.4.

```sh
git clone <url-du-dépôt> ds-studio
cd ds-studio
npm ci
npm run build
npm start
```

Ouvrez **http://127.0.0.1:4310** (pas `localhost` : le contrôle d’hôte est
strict). Laissez le terminal ouvert ; **Ctrl+C** arrête le serveur.

## Ce que contient le dépôt

| Dossier                | Rôle                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `ds/`                  | **Le DS Revela** : `tokens.css` (généré), composants React et leurs styles |
| `app/`                 | L’atelier : serveur local, interface, contrôles métier                      |
| `connectors/agents/`   | Adaptateurs IA : Claude Code (qualifié), Codex                               |
| `figma-plugin/`        | Plugin Figma de développement : pousse les variables validées              |
| `workspace/`           | PFE, règles de conception, décisions, seed des 45 tokens Revela             |
| `.ds-studio/`          | État local (révisions, historique) : **privé, jamais commité**              |

L’aperçu de l’atelier affiche **les composants de `ds/src/`**, pas une copie :
modifier un composant dans `ds/` change l’aperçu (en `npm run dev`).

## La boucle complète, en 2 minutes

1. **Design System** → choisissez `color.mat`, saisissez `#2B2B2B`, **Proposer**.
2. Lisez le diff : ancienne/nouvelle valeur, **contrôles Revela** (gris neutres,
   16 paires de contraste, taille minimale, échelles), fichier code visé.
3. **Valider** : la révision passe à 1, `ds/tokens.css` est réécrit puis relu
   (en-tête : révision + empreinte). Un fichier modifié à la main n’est jamais écrasé.
4. **Historique** : chaque révision est datée, sourcée (manuel, import, Claude,
   annulation) et annulable par un nouveau diff.
5. **Figma** (facultatif) : dans le plugin, **Lire DS-Studio** puis **Appliquer**.

Un problème de contrôle introduit par une proposition exige une **case d’accord
explicite** ; le serveur refuse la validation sans elle.

## Brancher un autre projet

Par défaut, DS-Studio écrit `ds/tokens.css`. Pour écrire dans un autre projet,
créez `.ds-studio/code-target.json` (privé, chemin absolu, fichier nommé
`tokens.css`) :

```json
{ "file": "C:\\chemin\\vers\\mon-projet\\src\\tokens.css" }
```

Puis importez ce fichier dans le CSS du projet (`@import './tokens.css';`).
Les alias historiques de Revela (`--ink`, `--rule`, `--mat`…) sont générés.

## Claude dans l’atelier (facultatif)

Requiert **Claude Code 2.1.x** installé et connecté par vous (`claude` puis
`/login`). Dans le chat, choisissez **Claude Code · profil sans outils** :
modèle `claude-sonnet-5-5`, effort moyen, aucun outil, aucun MCP, dossier
temporaire vide. Claude **propose** des changements de tokens ; ils passent par
le même diff, les mêmes contrôles et votre validation. Les tokens, `PFE.md`,
`DESIGN_RULES.md` et le brief sont envoyés à Anthropic : n’y mettez rien de
sensible. Détails : [docs/AGENT_ADAPTERS.md](docs/AGENT_ADAPTERS.md).

## Plugin Figma (facultatif)

Figma **desktop**, sur la même machine que DS-Studio. Guide pas à pas :
[docs/FIGMA_PLUGIN.md](docs/FIGMA_PLUGIN.md). En bref : **Plugins →
Development → Import plugin from manifest…** → `figma-plugin/manifest.json`,
puis dans un fichier : **Lire DS-Studio** → **Appliquer**. Le plugin crée ou met
à jour la collection « Revela · DS-Studio » (45 variables), protège les
retouches faites dans Figma et relit après écriture.

## État réel

| Fonction                                                   | État                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Tokens Revela (45), diff, contrôles, historique, annulation | **TESTÉ** (unitaires + navigateur)                              |
| Aperçu des composants et écrans Revela, 4 largeurs         | **TESTÉ** (Playwright)                                          |
| Écriture du code (`tokens.css`) relue                      | **TESTÉ**, y compris dans le dépôt Revela réel                  |
| Claude Sonnet 5.5 (propositions de tokens)                 | **TESTÉ** sur Windows, CLI 2.1.87, envois réels                 |
| Plugin Figma (variables)                                   | **TESTÉ** dans un fichier de test, Figma desktop Windows        |
| Édition des composants par l’IA, pages/composants Figma    | **PRÉVU** (voir [feuille de route](workspace/FEUILLE_DE_ROUTE.md)) |

Preuves et limites, étape par étape : [workspace/DECISIONS.md](workspace/DECISIONS.md).

## Vérifier

```sh
npm run check        # types
npm test             # tests unitaires et API
npx playwright install chromium
npm run test:e2e     # parcours navigateur
npm run scan         # aucun fichier privé suivi par Git
```

`npm run dev` sert l’interface avec Vite (rechargement à chaud, y compris `ds/`).
Les tests utilisent des dossiers temporaires et ne touchent pas vos données.

## Origine

Basé sur le starter pédagogique DS-Studio V2 (licence [MIT](LICENSE)).
Lanceurs graphiques, sauvegarde/restauration et sécurité :
[docs/LAUNCHER.md](docs/LAUNCHER.md), [docs/SECURITY.md](docs/SECURITY.md).
