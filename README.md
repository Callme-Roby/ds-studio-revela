# DS-Studio · Revela

Un atelier **web local** pour faire évoluer le Design System de **Revela**
(application photo, projet de fin d’études), relié à son code : on modifie les
**variables** et les **composants**, on voit l’aperçu sur les vrais écrans, on
valide un diff contrôlé, puis le code et Figma suivent. Un **assistant IA**
(Claude) peut vérifier le projet et proposer des changements plus larges,
jusqu’au code des composants, toujours soumis à votre validation.

```
DS-Studio (http://127.0.0.1:4310)
  proposition (manuelle ou Claude) → diff + contrôles / aperçu compilé → validation humaine
        │
        ├─> ds/tokens.css            variables (ou tokens.css d’un autre projet)
        ├─> ds/src/**                code des composants (+ commit Git local facultatif)
        └─> plugin Figma             variables « Revela · DS-Studio », relues
```

## L’atelier en un coup d’œil

| Partie (barre latérale) | Ce qu’on y fait                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Aperçu**              | Les écrans de Revela à leur largeur réelle (1024 à 1920 px), ajustés à la fenêtre      |
| **Variables**           | Catalogue des 45 tokens ; pour chacun : **Aperçu** (édition, composants qui l’utilisent rendus avec le brouillon) ou **Code** (ligne de `tokens.css`, utilisations dans `ds/src`) |
| **Composants**          | Catalogue des composants ; pour chacun : **Aperçu** (états, variables utilisées) ou **Code** (TSX et CSS éditables, proposés sur diff) |
| **Historique**          | Révisions de variables (r) et de code (c), chacune annulable                           |
| **Projet**              | Brief PFE privé                                                                         |
| **Intégrations**        | Cible code, import/export JSON, plugin Figma, statut des assistants                    |
| **Assistant IA** (flottant, repliable) | Variables : propositions de tokens. Composants : Claude édite une copie de `ds/` |

**Tout fonctionne sans compte** : mode manuel, aperçu, contrôles, historique et
écriture du code. Claude (IA) et Figma sont des options, chacune avec son compte.

## Démarrer en un double-clic

Après le clone, double-cliquez sur **`Lancer DS-Studio.cmd`** (Windows) ou
**`Lancer DS-Studio.command`** (macOS). Le raccourci installe les dépendances
au premier lancement, recompile si le code a changé, démarre le serveur et ouvre
le navigateur. Gardez sa fenêtre ouverte ; **Ctrl+C** arrête DS-Studio. Si
DS-Studio tourne déjà, il ouvre simplement le navigateur.

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
| `ds/`                  | **Le DS Revela** : `tokens.css` (généré), un TSX + un CSS par composant, écrans, registre du catalogue |
| `app/`                 | L’atelier : serveur local, interface, contrôles métier                      |
| `connectors/agents/`   | Adaptateurs IA : Claude Code (qualifié), Codex                               |
| `figma-plugin/`        | Plugin Figma de développement : pousse les variables validées              |
| `workspace/`           | PFE, règles de conception, décisions, seed des 45 tokens Revela             |
| `.ds-studio/`          | État local (révisions, historique) : **privé, jamais commité**              |

L’atelier affiche **les composants de `ds/src/`**, pas une copie. Une validation
de code écrit dans `ds/src`, puis recompile l’interface (en `npm start`) ; en
`npm run dev`, Vite recharge à chaud.

## La boucle complète, en 2 minutes

1. **Variables** → choisissez `color.brand`, saisissez `#8A3B20` : les composants
   qui l’utilisent changent déjà dans l’aperçu, sans rien écrire. **Proposer**.
2. Lisez le diff : ancienne/nouvelle valeur, **contrôles Revela** (gris neutres,
   16 paires de contraste, taille minimale, échelles), fichier code visé.
3. **Valider** : la révision passe à 1, `ds/tokens.css` est réécrit puis relu
   (en-tête : révision + empreinte). Un fichier modifié à la main n’est jamais écrasé.
4. **Composants** → Button → **Code** → `Button.css` : changez un rayon,
   **Proposer ce changement**. Le diff montre le code, l’aperçu **compilé** montre
   le résultat ; **Valider** écrit dans `ds/src` (commit Git local si coché).
5. **Historique** : chaque révision (r ou c) est datée, sourcée (manuel, import,
   Claude, annulation) et annulable par un nouveau diff.
6. **Figma** (facultatif) : dans le plugin, **Lire DS-Studio** puis **Appliquer**.

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
`/login`). Modèle `claude-sonnet-5-5`, effort moyen. Bouton **Assistant IA**
en bas à droite, deux périmètres :

- **Variables** : profil sans outils (aucun outil, aucun MCP, dossier vide).
  Claude propose des tokens ; même diff, mêmes contrôles, votre validation.
  Envoyés : tokens, `PFE.md`, `DESIGN_RULES.md`, brief privé.
- **Composants (code)** : Claude travaille dans une **copie temporaire** de
  `ds/`, avec seulement les outils de lecture et d’édition de fichiers (ni
  shell, ni réseau, ni MCP). DS-Studio compare la copie à `ds/src` : les
  différences deviennent une proposition de code, avec diff et aperçu compilé.
  Envoyés : le code de `ds/` et `DESIGN_RULES.md`.

N’y mettez rien de sensible. Détails : [docs/AGENT_ADAPTERS.md](docs/AGENT_ADAPTERS.md).

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
| Code des composants : édition, diff, aperçu compilé, validation, annulation, commit Git | **TESTÉ** (unitaires, API, navigateur) |
| Agent de code Claude (copie isolée de `ds/`)             | **TESTÉ avec un faux CLI** ; envoi réel à qualifier            |
| Plugin Figma (variables)                                   | **TESTÉ** dans un fichier de test, Figma desktop Windows        |
| Composants et pages poussés vers Figma                     | **PRÉVU** (voir [feuille de route](workspace/FEUILLE_DE_ROUTE.md)) |

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
