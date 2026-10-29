# Feuille de route — DS-Studio pour Revela

Cible : une modification de token, proposée à la main ou par une IA, validée une
seule fois par un humain, met à jour DS-Studio, le code de Revela et le fichier
Figma, puis chaque cible est relue pour prouver l’écriture.

```
IA (propose) ─┐
              ├─> diff + contrôles ─> validation humaine ─> contrôleur ─┬─> état DS-Studio
Manuel ───────┘                                                          ├─> tokens.css de Revela
                                                                         └─> variables Figma
```

L’IA n’écrit nulle part. Seul le contrôleur écrit, après validation, sur des
cibles déclarées à l’avance, et relit le résultat.

| # | Étape | Résultat attendu | Statut |
| - | ----- | ---------------- | ------ |
| 1 | Cadrage | `PFE.md` et `DESIGN_RULES.md` décrivent Revela | IMPLEMENTED, à relire par l’étudiant |
| 2 | Tokens Revela | Schéma v2 à 45 clés, migration de l’état r3 sans perte | TESTED (Windows : unitaires, e2e Chromium, état réel) |
| 3 | Composants et écrans | Catalogue Revela, scénarios Studio / Catalogue / Développement en 1024–1920 px | TESTED (Windows, e2e Chromium) |
| 4 | Contrôles métier | Le diff signale neutralité, contraste et taille minimale | TESTED (Windows, unitaires + e2e Chromium) |
| 5 | Sortie vers le code | Après validation : écriture atomique d’un `tokens.css` dans Revela, relu ensuite | TESTED (Windows) : importé par `index.css`, boucle validation → build Revela prouvée |
| 6 | IA | Un adaptateur qualifié propose des changements sur le schéma Revela | Claude TESTED (Windows, CLI 2.1.87, Sonnet 5.5 effort moyen, envois réels) |
| 7 | Figma | Variables du fichier Revela mises à jour depuis la révision validée, puis relues | TESTED (plugin de développement, Figma desktop Windows, fichier de test, révision 5) |

## Version 2 : studio de DS livrable (décidé le 2026-10-29)

Cible : un dépôt GitHub qu’un testeur clone et lance sans compte, avec un vrai DS
branché derrière ; variables **et composants** modifiables avec aperçu ; un LLM
qui vérifie le projet et modifie le DS (« vibe coding ») sous diff validé ;
historique des versions ; plugin Figma qui pousse variables, composants et pages.

Choix de l’étudiant : DS Revela inclus dans le dépôt (`ds/`) ; l’IA ne modifie
que le DS, sur une copie isolée, avec diff de code et validation ; tout marche
sans compte, Claude et Figma restent facultatifs.

| # | Phase | Contenu | Statut |
| - | ----- | ------- | ------ |
| A | Dépôt livrable | `ds/` (tokens + composants réels) cible par défaut, DA sombre, README, guide plugin, CI, `git init` | TESTED (CI verte Windows/macOS/Linux, publié sur GitHub) |
| B | Composants et IA | Nouvelle arborescence (barre latérale, Aperçu, catalogues Variables/Composants avec Aperçu/Code, Historique, assistant flottant) ; un fichier par composant ; propositions de code avec diff, aperçu compilé, validation, annulation, commit Git local ; agent Claude sur copie isolée de `ds/` | TESTED (unitaires, API, navigateur ; agent avec faux CLI), envoi réel de l’agent de code à qualifier |
| C | Figma composants | Le plugin crée/actualise composants et pages à partir d’une description exportée par DS-Studio, liés aux variables | IMPLEMENTED (capture + plugin testés, API Figma simulée) ; essai dans Figma réel à faire |

## Phase D : brancher d’autres projets (décidé le 2026-10-29)

Cible : connecter n’importe quel projet (dossier local ou dépôt GitHub cloné par
DS-Studio), avec ou sans plugin Figma, et le déclarer par un formulaire où l’IA
propose la configuration ; le projet Revela intégré reste le projet par défaut.

Choix de l’étudiant :
- **N’importe quel projet, via l’IA** : Claude analyse le dépôt (lecture seule)
  et propose un **profil** : où sont les tokens et dans quel format, où sont
  les composants, URL du serveur de dev, fichier Figma. DS-Studio ne fait
  qu’appliquer ce profil avec ses propres adaptateurs de lecture/écriture
  (variables CSS, SCSS, JSON plat et DTCG, Tailwind en lecture) : aucun code
  écrit par l’IA n’est exécuté. Un format non couvert est signalé, pas deviné.
- **GitHub** : DS-Studio clone le dépôt dans un dossier choisi ; chaque
  validation peut créer un commit local ; **pousser vers le vrai dépôt se fait
  au clic** (état en avance/en retard affiché, jamais automatique).
- **Aperçu** : le serveur de dev du projet (URL locale ou Storybook) dans
  l’iframe, à largeur réelle ; DS-Studio ne lance aucune commande du projet,
  il affiche celle à lancer.
- **Déclaration** : formulaire (dossier ou URL GitHub, lien Figma, case
  « plugin Figma ») + bouton « Laisser l’IA analyser » ; on peut aussi coller
  les liens dans l’assistant flottant, qui ouvre le même formulaire prérempli.

| # | Étape | Contenu |
| - | ----- | ------- |
| D1 | Projets | Liste de projets (`.ds-studio/projects.json`), un dossier d’état par projet, sélecteur dans la barre latérale ; Revela devient « projet intégré » — TESTED (unitaires, API, navigateur) |
| D2 | Tokens génériques | Schéma de tokens dynamique par projet, adaptateurs lecture/écriture sur place (CSS, SCSS, JSON), diff et historique inchangés ; contrôles génériques (contraste des paires déclarées) — TESTED (unitaires, API, navigateur) ; contrôles : syntaxe des valeurs seulement, paires de contraste reportées à D5 |
| D3 | Code et Git | Composants = fichiers des dossiers déclarés ; clone GitHub, commits locaux, **pousser au clic** — TESTED (unitaires avec dépôt distant local, API, navigateur jusqu’à l’envoi) ; clonage réel depuis GitHub non essayé |
| D4 | Aperçu | Iframe du serveur de dev, largeurs réelles, rechargement après validation — TESTED (navigateur avec faux serveur de dev) ; aperçu des composants par page catalogue ou Storybook |
| D5 | Déclaration par l’IA | Formulaire + analyse Claude en lecture seule → profil proposé, relu et validé ; liens collés dans l’assistant — en partie : assistant de démarrage (projet, détection heuristique des tokens et composants, choix de l’IA) TESTED ; mise en route (installation, serveur de dev au clic) et configuration par Claude (lecture seule, chemins vérifiés, page catalogue au diff) TESTED (API, navigateur, essai réel billboard pour l’installation et le serveur) ; liens collés dans l’assistant à faire |
| D6 | Figma par projet | Collection « <Projet> · DS-Studio », case « plugin Figma » ; composants/écrans Figma seulement là où DS-Studio sait rendre — TESTED (API simulée, routes) ; essai dans Figma réel à faire |

## Pourquoi cet ordre

L’IA et Figma travaillent sur les tokens : ils doivent d’abord exister sous leur
forme Revela (étape 2). La sortie vers le code (5) est entièrement locale, donc
démontrable sans compte ni réseau. L’IA (6) et Figma (7) dépendent de comptes,
de quotas et de droits externes : on les branche en dernier, sur une base testée.

## Points à trancher avant les étapes 5 à 7

- **Code (5)** : cible unique `Revela/apps/desktop/src/renderer/tokens.css`,
  importée par `index.css`. Remplacer ensuite les 51 couleurs écrites en dur par
  ces variables est un chantier dans le dépôt Revela, mené à part.
- **IA (6)** : Codex (déjà intégré, CLI 0.164.0, compte et quota requis) ou
  qualification de l’adaptateur Claude (`claude -p`, outils désactivés, sortie
  JSON), avec les tests décrits dans `docs/AGENT_ADAPTERS.md`.
- **Figma (7)**, d’après `docs/FIGMA.md` : DS-Studio n’est pas un client MCP
  autorisé par Figma. Deux pistes à vérifier sur la documentation officielle au
  moment de l’étape :
  - un **plugin Figma** qui lit la révision validée sur le serveur local et
    écrit les variables pendant que l’étudiant a le fichier ouvert ;
  - l’**API REST des variables**, dont l’écriture semble réservée à certains plans.
  Dans les deux cas : fichier de test d’abord, cible et révision contrôlées, relecture.
  Le chat IA ne reçoit jamais d’accès Figma.
