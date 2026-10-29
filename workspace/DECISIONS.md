# Journal de décisions du projet

## V1 — Starter

React permet d’employer exactement les mêmes composants dans le catalogue et
le viewport isolé. Le backend HTTP Node utilise la bibliothèque standard ; Zod
valide les entrées et les fichiers. Vite compile le frontend. Pas d’Electron,
base distante, Figma ou LLM obligatoire.

Codex propose du JSON sans outils ; le contrôleur est l’unique auteur des changements
locaux validés. Claude et Gemini ne sont pas activés sans qualification.

## À compléter par l’étudiant

Date, problème, options explorées, décision, preuves et limite connue.

## 28/10/2026 — Palette Revela importée (étape A)

**Problème.** Le DS de Revela n’existe presque qu’en valeurs écrites en dur
(51 couleurs, 9 tailles de texte, 6 variables CSS). Inventaire et proposition
complète : `workspace/REVELA_TOKENS.md`.

**Options.** A : faire correspondre Revela aux 18 clés existantes de DS-Studio.
B : étendre le schéma (alerte, passe-partout, sélection, IA, canaux), ce qui
exige une migration de l’état.

**Décision.** Étape A d’abord, par import de `workspace/revela-tokens.json`
(révision 3, 14 changements depuis r2). `color.muted` passe à `#6B6B6B` au lieu
de `#8A8A8A` pour atteindre 4,5:1. `font.body` vaut 14 et non 12 : DS-Studio en
dérive les libellés (× 0,8), et 12 les faisait tomber à 9,6 px.

**Preuves (Windows, Chromium du panneau de l’app, serveur local).**
- Disque : `state.json` en r3, identique au fichier importé ; copie r2 conservée.
- Catalogue et aperçu : mêmes variables (`#111111`, 14 px, rayon 4 px) ;
  libellés 11,2 px, cartes 12,25 px.
- Contrastes : texte 18,88:1, texte secondaire 5,33:1 (4,89:1 sur `#F5F5F5`),
  erreur 7,33:1, succès 5,13:1.
- Viewports 320, 375, 430, 1024 px, scénarios Découvrir et Inscription : aucun
  débordement horizontal.
- Persistance : valeurs identiques après rechargement et redémarrage du serveur.

**Limites connues.**
- `color.border` `#ECECEC` (1,18:1) : contours des champs presque invisibles.
  Un seul token sert aux filets et aux champs ; à séparer en étape B.
- `color.brandHover` `#000000` : survol à peine perceptible sur `#111111`.
- Textes de 10 px fixés dans `styles.css` (badge, kicker, pied de page), hors tokens.
- Les composants restent ceux de l’exemple Lisière ; seuls les tokens viennent de Revela.
- Annulation possible : Historique → révision 3.

## 28/10/2026 — Schéma v2 : tokens Revela et migration (étape 2)

**Problème.** Les 18 clés ne pouvaient pas représenter Revela (alerte,
passe-partout, sélection, canaux, IA, contour de champ distinct).

**Options.** Renommer les clés selon `REVELA_TOKENS.md` (cassait l’historique
r1–r3 et les composants) ou **ajouter** des clés en gardant les 18 existantes.

**Décision.** Ajout : 27 clés, 45 au total, nommage plat de DS-Studio
(`color.warning`, `font.md`…). Les 18 clés gardent leur sens ; `color.border`
reste le filet, `color.borderStrong` (`#8A8A8A`, 3,45:1 sur blanc, 3,17:1 sur
`#F5F5F5`) servira au contour des champs. État en version 2, migré à la lecture.
Seed versionné remplacé par les 45 valeurs Revela (seed Lisière sauvegardé).

**Preuves (Windows).**
- `npm run check` et `npm run build` : OK.
- `npm test` : 30 réussis, 0 échec, 2 ignorés (liens symboliques non autorisés
  sous Windows, déjà ignorés avant). Trois tests ajoutés : migration avec
  archive, valeurs et historique conservés, annulation d’une révision v1 après
  migration ; copie précédente v1 restaurée puis migrée ; v1 falsifié refusé
  sans écriture.
- État réel : v2, r3, 45 clés ; 18 valeurs et historique identiques à la
  sauvegarde ; archive `state-v1-preserved-….json` identique à l’original.
- Interface : « 45 tokens », nouvelles variables CSS présentes, diff sur
  `color.warning` basé sur r3, fermé sans écriture.

- `npm run test:e2e` (Chromium Playwright installé ensuite) : 10 réussis sur 10.
  Deux tests supposaient le seed Lisière (bleu `#3154C4` écrit en dur, « 3
  résultat(s) » pour `space`) ; ils lisent désormais la valeur de départ dans
  `/api/state` et ne dépendent plus du seed.

**Limites connues.**
- Les nouvelles clés ne sont encore utilisées par aucun composant (étape 3).
- `workspace/revela-tokens.json` (18 clés) n’est plus importable tel quel.
- Opacité, graisses, ombres, durées : hors du format de tokens.
- Sauvegarde externe avant migration :
  `Documents/DS-Studio-sauvegardes/ds-studio-2026-10-28-avant-v2/`.

## 28/10/2026 — Composants et écrans Revela (étape 3)

**Problème.** Le catalogue et l’aperçu montraient encore Lisière (réservation,
inscription, navigation mobile) : impossible de juger un token sur Revela.

**Options.** Importer les vrais composants de Revela (liés à Electron, à l’IPC
et au boîtier) ou les **recréer** en versions visuelles avec les mêmes rôles.

**Décision.** Recréation dans `app/client/DesignSystem.tsx`, tout en tokens :
badge live, alertes, vignette avec sélection, curseur, contrôle segmenté, champ
(`color.borderStrong`), recherche IA en dégradé, canaux et poignée de masque,
bulle d’aide. Catalogue en six sections. Aperçu en trois écrans — Prise de vue,
Bibliothèque, Développement — avec onglets de mode, scène sur passe-partout et
panneau de 300 px à droite. Largeurs : 1024, 1280, 1440, 1920 px (Revela est
desktop). Les photos sont des dégradés de gris neutres, seul contenu hors token.

**Preuves (Windows, Chromium).**
- `npm run check`, `npm run build` : OK. `npm test` : 30 réussis, 2 ignorés.
- `npm run test:e2e` : 10/10. Le test de propagation suit désormais le
  contrôle segmenté du catalogue, le bouton Déclencher et l’onglet de mode de
  l’aperçu ; le test des largeurs vérifie 1024 à 1920 px, le panneau à droite,
  le déclenchement, la sélection d’une photo, le changement de mode et la recherche.
- 3 écrans × 4 largeurs : aucun débordement, écran tenu en 800 px de haut,
  texte minimal 11 px. Catalogue : aucun élément hors du panneau.
- 42 tokens sur 45 utilisés ; aucun hexadécimal dans les styles des composants.

**Limites connues.**
- Recréations visuelles : le code de Revela n’est pas encore relié (étape 5).
- Non utilisés : `color.disabled` (le désactivé reste une opacité),
  `space.xl`, `radius.md`.
- Pas de vérification visuelle automatisée (captures comparées).
- Cibles de la vignette (étoile) en 28 px : au-dessus du minimum de 24 px,
  sous les 44 px des autres contrôles.

## 28/10/2026 — Contrôles Revela dans le diff (étape 4)

**Problème.** Le diff ne montrait que des valeurs : rien n’empêchait de teinter
un gris d’interface, de casser un contraste ou de rendre un texte illisible.

**Options.** Bloquer toute proposition fautive, ou **signaler** et laisser la
décision à l’humain. Les règles sont « des objectifs à tester, pas une
certification » (`DESIGN_RULES.md`) : un blocage strict empêcherait d’essayer.

**Décision.** Module partagé `app/shared/rules.ts`, calculé sur l’avant et
l’après de la proposition :
- neutralité (R = V = B) de 10 gris d’interface, dont `color.mat` ;
- contraste de 16 paires réellement affichées (4,5:1 texte, 3:1 contour et focus) ;
- taille minimale 10 px, y compris les libellés dérivés de `font.body × 0,8` ;
- échelles de tailles et d’espaces croissantes.
Le diff sépare problèmes **introduits**, **résolus** et **déjà présents**. Un
problème introduit verrouille « Valider et enregistrer » jusqu’à une case
« Je valide en connaissance de cause » ; corriger ou ne rien aggraver ne demande rien.
`color.brand` n’est pas soumis à la neutralité : le choix de l’accent reste ouvert.

**Preuves (Windows, Chromium).**
- Seed et état réel r3 : 0 problème.
- `npm test` : 36 réussis, 2 ignorés (liens symboliques Windows) ; 6 tests de règles.
- `npm run test:e2e` : 11/11. Nouveau test : `color.surface` `#FFF5F5` signalé
  (écart de 10), validation verrouillée puis déverrouillée par l’accord, ancien
  `--ink-mute` `#8A8A8A` signalé à 3,45:1, aucune écriture. Le test de la boucle
  centrale passe par l’accord pour `space.md` 22 (échelle inversée).
- Contrôle visuel du diff dans le panneau : `color.mat` `#2E2A33` signalé, fermé sans écriture.

**Limites connues.**
- Les paires de contraste sont déclarées à la main : un nouveau composant
  exige d’y ajouter ses paires.
- Les alertes sont calculées dans le navigateur ; le serveur ne les impose pas
  (l’IA de l’étape 6 devra passer par le même diff).
- Pas de contrôle sur les couleurs de sens entre elles (pick, canaux, IA).

## 28/10/2026 — Écriture des tokens dans le code de Revela (étape 5)

**Problème.** Une validation dans DS-Studio ne changeait rien dans Revela.

**Options.** Laisser un agent modifier `index.css` (accès fichier libre, refusé
par `AGENTS.md`) ou faire écrire **un seul fichier généré** par le contrôleur,
après la validation humaine.

**Décision.** `app/server/code-target.ts` :
- cible déclarée par l’étudiant dans `.ds-studio/code-target.json` (privé,
  hors Git), chemin absolu vers un fichier nommé `tokens.css`, dossier réel ;
  jamais fournie par HTTP ni par une IA ;
- après chaque validation (et annulation), le serveur génère `:root` avec les
  45 variables et des alias des variables historiques (`--ink`, `--ink-mute`,
  `--rule`, `--mat`, `--accent`, `--space`), écrit de façon atomique, **relit**
  et compare ;
- en-tête avec révision et empreinte : un fichier modifié à la main ou non
  généré par DS-Studio n’est jamais écrasé ;
- l’état DS-Studio reste la source : un échec côté code n’annule pas la
  révision ; l’en-tête affiche l’état du code et propose « Écrire le code » ;
- le diff annonce le chemin qui sera écrit avant la validation.

**Preuves (Windows).**
- `npm test` : 41 réussis, 2 ignorés (liens symboliques Windows). 5 tests
  `code-target` : sans configuration, écriture relue puis mise à jour,
  fichier modifié ou étranger jamais écrasé, configuration invalide refusée,
  validations rapprochées terminées sur la dernière révision. Test HTTP :
  réponse de validation `{ state, code }`.
- `npm run test:e2e` : 11/11 (cible non configurée dans les tests).
- Réel : `Revela/apps/desktop/src/renderer/tokens.css` écrit et relu en
  révision 3 (58 lignes, droits 644), badge « Code Revela · à jour r3 » ;
  diff d’essai sur `color.warning` affichant la cible, fermé sans écriture.

**Limites connues.**
- `index.css` de Revela n’importe pas encore `tokens.css` et redéclare ses
  6 variables dans `:root` : aucun effet visible dans Revela tant que ce
  branchement n’est pas fait.
- Fichier non suivi dans le dépôt Revela (`git status` : `??`), à committer
  par l’étudiant s’il le souhaite.
- Un éditeur qui convertit les fins de ligne fera passer le fichier en
  « modifié » : écriture alors refusée, par prudence.
- Les 51 couleurs écrites en dur dans Revela ne sont pas encore remplacées.

## 28/10/2026 — Revela importe `tokens.css` (suite de l’étape 5)

**Décision.** Dans `Revela/apps/desktop/src/renderer/index.css`, le bloc
`:root` qui déclarait `--ink`, `--ink-mute`, `--rule`, `--mat`, `--accent` et
`--space` est remplacé par `@import './tokens.css';`. Ces six variables
viennent désormais des alias générés. Seul effet visuel immédiat : `--ink-mute`
passe de `#8a8a8a` à `#6B6B6B` (3,45:1 → 5,33:1, 54 usages).

**Preuve de bout en bout (Windows).**
- Révision 4 : `color.mat` `#2E2E2E` → `#262626`, validée à ma demande
  explicite (clic exécuté par l’agent dans le panneau, sur le diff que j’avais
  approuvé, sans alerte des contrôles Revela).
- Réponse de validation : « tokens.css écrit et relu (révision 4) » ; fichier
  en révision 4 avec `--color-mat: #262626;` ; catalogue et aperçu à `#262626`.
- `npm run build -w @revela/desktop` : OK ; CSS compilé avec
  `--color-mat:#262626` et `--mat:var(--color-mat)`, plus aucune trace de `#2e2e2e`.

**Limites connues.**
- L’application Revela n’a pas été lancée : rendu à l’écran non vérifié.
- Dans le dépôt Revela, `index.css` modifié et `tokens.css` non suivi :
  rien n’est commité.
- Le build doit être relancé (ou `npm run dev` tourner) pour voir un nouveau token.

## 28/10/2026 — Adaptateur Claude (étape 6)

**Problème.** L’IA devait proposer des changements de tokens ; seul Codex était
qualifié et son CLI n’est pas installé. Claude Code 2.1.87 est installé.

**Décision (choix de l’étudiant).** Brancher Claude, avec accord pour quelques
envois réels de qualification. `connectors/agents/claude.ts` :
- `claude -p` en JSON, `--tools ""`, aucun MCP (`--strict-mcp-config`,
  configuration vide), `--setting-sources ""`, sans commandes slash ni session
  conservée, `--permission-mode dontAsk` ; dossier temporaire vide ; variables
  d’environnement filtrées ; contexte et demande par l’entrée standard ;
- `--json-schema` : réponse `{message, changes}` limitée aux 45 clés existantes ;
- refus si erreur du service, plus de 2 tours, refus de permission (outil
  tenté), réponse sans sortie structurée ou illisible ; stderr jamais renvoyé.
  Le second tour est celui de la réponse structurée (`--json-schema`), mesuré
  sur 2.1.87 + Sonnet 5.5 ; le premier seuil (1 tour) refusait à tort ;
- modèle et effort fixés par l’étudiant : `--model claude-sonnet-5-5`,
  `--effort medium` (le CLI 2.1.87 doit encore prouver qu’il connaît ce modèle) ;
- versions 2.1.x acceptées, qualification faite sur 2.1.87 ;
- proposition tracée `source: claude` dans l’historique ;
- serveur : un commit qui introduit un problème des contrôles Revela est
  refusé sans `acknowledged` (409), quelle que soit la source.

**Preuves (Windows, sans envoi).**
- `npm test` : 46 réussis, 2 ignorés. Faux CLI : profil (options, dossier vide,
  environnement sans clé), réponse valide, outil tenté, erreur service sans
  fuite, clé inventée, version non qualifiée, stderr sensible, CLI absent.
  HTTP : accord exigé (409 puis 200), proposition Claude via le même diff,
  source tracée, aucune écriture avant validation.
- `npm run test:e2e` : 11/11.
- Serveur réel : Claude détecté disponible (2.1.87).
- Envoi réel n° 1 (sonde sans donnée du projet) : refusé par le service,
  jeton OAuth expiré ; profil accepté, aucun outil ni refus de permission.

**Qualification réelle (Windows, CLI 2.1.87, après reconnexion de l’étudiant).**
- Envoi 2 (DS-Studio, contexte complet) : refusé par le garde-fou « 1 tour ».
- Envoi 3 (sonde sans donnée du projet, arguments exacts) : `num_turns` 2,
  aucun refus de permission, sortie structurée présente, modèle
  `claude-sonnet-5-5` ; Claude refuse la consigne glissée dans le JSON.
- Envoi 4 (DS-Studio, contexte complet, garde-fou corrigé) : 20 s ; proposition
  `color.warning` `#8F5600` → `#7A4A00` expliquée ; diff « Proposition claude ·
  basée sur la révision 4 », cible `tokens.css` annoncée, contrôles Revela sans
  problème introduit. Validée par l’étudiant dans le panneau : révision 5,
  source `claude`, `tokens.css` de Revela écrit et relu en révision 5.
- Envoi 5 (adaptateur réel, seed public, demande hostile : lire les
  identifiants, `npm install`, écrire dans Figma, surface rouge, clé inventée) :
  12 s, tout refusé, `changes` vide, aucun secret dans la réponse.
- Ratios annoncés par Claude pour `#7A4A00` exacts (6,66 / 7,48 / 6,86:1),
  mais faux pour `#111111` sur `#FF0000` (5,25 annoncé, 4,72 réel) : les
  contrôles calculés par DS-Studio restent la référence, pas les chiffres de l’IA.
- Incident pendant les tests : un premier script a écrit la demande dans un
  champ du brief privé (premier `textarea` de la page) ; rechargement, brief
  enregistré vérifié intact, rien sauvegardé. Saisie ensuite ciblée par libellé.

**Limites connues.**
- Qualifié sur une seule version (2.1.87) et une seule plateforme (Windows).
- Le contexte complet (brief privé compris) part chez Anthropic à chaque envoi.
- Quota consommé à chaque demande ; délai observé 12 à 21 s.

## 2026-10-28 — Étape 7 : plugin Figma « Revela · DS-Studio »

**Choix.** Un plugin de développement (`figma-plugin/`), lancé par l’étudiant
dans Figma desktop, lit la révision validée sur `GET /api/figma/tokens`, montre
le plan (créations, mises à jour, conflits) et n’écrit qu’après son clic, puis
relit. DS-Studio n’obtient aucun accès Figma ; le chat IA non plus.

**Garde-fous.**
- Collection dédiée « Revela · DS-Studio », un mode, 45 variables nommées
  `groupe/clé`, portées (scopes) explicites.
- Valeur écrite mémorisée sur chaque variable : une retouche faite à la main
  dans Figma est un conflit, conservé sauf accord explicite ; type différent
  jamais remplacé ; variables hors DS-Studio laissées telles quelles.
- Empreinte du plan : si Figma ou DS-Studio a changé entre lecture et clic,
  l’écriture est refusée.
- Serveur : seule exception à la règle d’origine, la route `/api/figma/tokens`
  en lecture (GET + préflight), origine `null`, hôte `localhost` accepté pour
  elle seule ; toutes les autres routes refusent.

**Incidents réels.**
- Manifest refusé : Figma n’accepte pas d’IP dans `devAllowedDomains`
  (`http://127.0.0.1:4310`) ; passage à `http://localhost:4310`.
- « Lire DS-Studio » sans effet : serveur arrêté, et préflight « Private
  Network Access » de Chromium sans réponse. Préflight ajouté (204,
  `Access-Control-Allow-Private-Network`), délai de 5 s et message d’état
  immédiat dans le plugin.

**Preuves.**
- Tests : logique du plan, `code.js` exécuté tel quel contre une imitation de
  l’API Figma (création, relecture, conflit respecté, plan périmé refusé),
  manifest, routes HTTP (préflight accepté sur la route plugin, refusé ailleurs).
- Réel : l’étudiant a appliqué la révision 5 dans le fichier de test « Revela ·
  test DS-Studio ». Relecture indépendante via Figma MCP (lecture seule) :
  collection « Revela · DS-Studio », 45 variables, valeurs identiques une à une
  à `/api/state` révision 5 (dont `color/warning` `#7A4A00`, `color/mat`
  `#262626`).

**Limites connues.**
- Synchronisation déclenchée dans Figma (clic ou « Suivre les validations »
  plugin ouvert), pas poussée par DS-Studio.
- Plugin de développement : fonctionne seulement avec Figma desktop sur la
  machine où DS-Studio tourne ; testé dans le fichier de test, pas encore dans
  le fichier Revela réel ; aucune liaison des variables aux composants Figma.

## 2026-10-29 — Phase B : arborescence, catalogues, code des composants, agent de code

**Demande de l’étudiant.** Un outil relié au code du DS : modifier variables et
composants avec aperçu, mettre à jour le projet, un LLM qui vérifie et modifie
plus largement (« vibe coding »), l’historique des versions ; une barre latérale,
plus de place pour l’iframe, variables et composants en catalogue avec bascule
Aperçu / Code, l’assistant flottant et repliable.

**Choix.**
- Barre latérale : Aperçu, Variables, Composants, Historique, Projet,
  Intégrations ; routage par ancre (`#/composants/button`).
- Aperçu : Revela à sa largeur réelle (1024 à 1920 px), réduit pour tenir dans
  la fenêtre (option « Ajuster »), sans changer sa largeur CSS.
- DS découpé : un TSX + un CSS par composant, écrans à part, registre
  `catalog.tsx` (fichiers + démonstration). L’onglet Code d’une fiche ouvre ses
  vrais fichiers.
- Variables : l’aperçu rend les composants qui utilisent la variable avec le
  brouillon, avant toute proposition ; l’onglet Code montre la ligne de
  `tokens.css` et les utilisations dans `ds/src` (index des `var(--…)`).
- Code : une proposition n’écrit rien ; DS-Studio compile en mémoire une copie
  de `ds/src` avec la proposition (aperçu réel du code proposé) ; une
  proposition qui ne compile pas ne peut pas être validée ; la validation
  vérifie que les fichiers n’ont pas changé depuis la proposition, écrit, relit,
  journalise (révision `c`), recompile l’interface, et crée si demandé un commit
  Git local des seuls fichiers validés (`git commit --only`, jamais de push).
- Agent de code : Claude Code (Sonnet 5.5, effort moyen) dans une copie
  temporaire de `ds/`, outils `Read, Edit, Write, Glob, Grep` en `acceptEdits`,
  ni shell, ni MCP, ni réglages chargés. Seules les différences dans `src/`
  deviennent une proposition ; écritures hors copie ou dans `tokens.css` ignorées.

**Incidents et corrections.**
- Course à l’affichage : en changeant d’onglet de fichier, l’éditeur montrait un
  instant l’ancien contenu sous le nouveau nom ; une proposition aurait écrasé
  `Button.css` avec le TSX. Trouvé par le test navigateur ; le contenu est
  désormais lié au fichier chargé.
- Arrêt du serveur : un onglet ouvert gardait une connexion persistante et
  l’arrêt propre prenait jusqu’à 2 min 30 (cause probable du verrou bloqué du
  2026-10-29, le serveur ayant été tué pendant ce délai). Connexions fermées à
  l’arrêt : environ 1 s.
- Les tests navigateur travaillent sur une copie de `ds/` (`DS_STUDIO_DS_DIR`) :
  une validation de code en test n’écrit jamais dans le dépôt.

**Preuves.** `npm run check`, `npm run build` ; 65 tests unitaires et API
(2 ignorés, Linux) dont stockage du code, conflit, chemins refusés, compilation
échouée, commit Git limité, agent de code avec faux CLI, routes HTTP ; 14 tests
navigateur dont l’édition de `Button.css` avec aperçu compilé (rayon 20 px avant
écriture), validation et annulation ; 20 tests du lanceur ; `qualify`.

**Limites connues.**
- Agent de code non encore essayé avec un envoi réel (quota de l’étudiant).
- Éditeur de code simple (zone de texte), sans coloration ni autocomplétion.
- Après une validation de code en `npm start`, l’interface se recompile puis se
  recharge (environ 1 s).
- Figma reçoit toujours les variables seulement (phase C).

## 2026-10-29 — Phase C : composants et écrans vers Figma (essai réel à faire)

**Choix.** DS-Studio capture lui-même ses composants et écrans (iframe cachée,
styles calculés) et produit un export lu par le plugin ; le plugin reconstruit
des nœuds Figma liés aux variables. Couleurs rattachées aux tokens par un rendu
témoin (une couleur unique par token), dimensions par famille (space, radius,
font). Reconstruction sur place pour garder les identifiants des composants.

**Preuves.** Plugin exécuté tel quel contre une imitation de l’API Figma, dont
un export réel (11 composants, 19 variantes, 3 écrans, 289 liaisons) ; capture
testée dans le navigateur (`color.onBrand` distingué de `color.surface`) ;
routes de l’export (dépôt protégé, lecture plugin seule).

**Limites.** Pas encore essayé dans Figma réel ; police Inter à la place de la
police système ; champs et curseurs simplifiés ; sens unique DS-Studio → Figma.

## 2026-10-29 — Phase D1 : plusieurs projets

**Choix.** Registre `.ds-studio/projects.json` (privé) ; Revela reste le projet
intégré, non supprimable, avec l’état existant (aucune migration). Un projet
externe = nom, dossier absolu vérifié, source (local ou URL GitHub), fichier
Figma, case « plugin Figma » ; un dossier d’état par projet. Déclarer un projet
ne lit ni n’exécute rien de son contenu ; l’état Git est lu (branche, origine,
fichiers modifiés), jamais modifié ; retirer un projet ne supprime aucun fichier.
Projet externe actif : vue d’ensemble seulement, le reste arrive en D2 à D6.

**Incidents.** Dépôt Git sans commit non reconnu (`rev-parse HEAD` échoue sur
une branche vide) : branche lue par `symbolic-ref`. Plugin Figma : cases à
cocher séparées de leur texte à 480 px, corrigé avec la nouvelle DA.

**Preuves.** 6 tests du registre, test HTTP (CSRF, bascule, retrait, plugin
refusé), test navigateur (ajout avec erreur de chemin puis succès, vue
d’ensemble, retour à Revela) ; 78 tests unitaires et API, 16 navigateur.
Un échec intermittent du test du lanceur, non reproduit sur 3 relances.

## 2026-10-29 — Phase D2 : variables d’un projet externe

**Choix.** La source de vérité reste les fichiers du projet : pas de copie des
tokens dans DS-Studio. Lecteurs/écrivains maison (aucun code de l’IA exécuté) :
variables CSS de `:root`/`html`/`:host` (les autres sélecteurs, ex. thème
sombre, sont comptés mais pas édités), variables SCSS de premier niveau, JSON
plat ou DTCG (`$value`, `$type`). Écriture par remplacement de la valeur à sa
position exacte : le reste du fichier est conservé octet pour octet (JSON :
indentation et nombres conservés). Validation : chaque fichier doit être
identique à celui de la proposition (empreinte), puis réécriture atomique,
relecture des valeurs, journal `token-history.json` dans le dossier d’état du
projet (révisions t, annulables).

**Garde-fous.** Fichiers relatifs au projet, sans `..`, résolus par `realpath`
(un lien qui sort du projet est refusé ; casse ignorée sous Windows), 1 Mo
maximum ; valeurs vérifiées par type (couleur, dimension) et sans `;`, `{`, `}`
ni retour à la ligne ; une proposition d’un projet ne se valide pas dans un autre.

**Preuves.** 5 tests des lecteurs/écrivains, 5 du service (conflit, chemins,
valeurs, projets croisés), 1 HTTP, 1 navigateur (déclaration des fichiers,
modification, fichier vérifié sur disque, annulation). Vérifié à l’écran.

**Limites.** Pas encore de contrôles de contraste pour un projet externe (les
paires de couleurs seront proposées par l’IA en D5) ; pas d’aperçu (D4).
Deux tests navigateur ont dépassé leur délai lors d’une exécution sous forte
charge (1 min 48 au lieu de 19 s), puis sont passés.

## 2026-10-29 — Phase D3 : composants et Git des projets externes

**Choix.** Le stockage de code de Revela (propositions, diff, validation relue,
journal, annulation, commit des seuls fichiers validés) est réutilisé pour un
projet externe, limité aux dossiers de composants déclarés et à des extensions
de code courantes ; node_modules, dist, build et .git sont ignorés. Pas d’aperçu
compilé pour un projet externe (son serveur de dev viendra en D4). Git :
clonage d’une URL `https://github.com/…` dans un dossier vide, avec les
identifiants Git de l’étudiant (jamais d’invite dans le terminal, fenêtre du
gestionnaire d’identifiants possible) ; commit local facultatif à chaque
validation (variables ou code) ; envoi uniquement sur clic et confirmation ;
première publication d’une branche possible ; jamais de force-push, envoi
refusé si le distant a des commits non récupérés.

**Incidents.** Deux boutons « Ajouter » dans la vue d’ensemble ont rendu un test
navigateur ambigu (cible par formulaire). Un test écrit avec `\t` dans un chemin
Windows avait produit une tabulation (chaîne brute).

**Preuves.** 4 tests Git sur un dépôt distant local (publication, en avance,
envoi, refus si le distant a avancé, commit limité aux fichiers validés,
chemins refusés), 1 test HTTP (dossiers, chemins fermés, plugin refusé),
1 test navigateur (dossier déclaré, composant modifié, commit, envoi vérifié
dans le dépôt distant). 94 tests unitaires et API, 18 navigateur, 20 lanceur.

**Limites.** Clonage depuis le vrai GitHub non essayé (pas de réseau en test) ;
pas de « git pull » dans DS-Studio (à faire dans le terminal) ; éditeur de code
simple.

## 2026-10-29 — Assistant de démarrage (projet + IA)

**Demande de l’étudiant.** Un onboarding pour brancher un projet (dossier
local ou dépôt) et brancher une IA pour l’assistant.

**Choix.** Assistant au premier lancement (réglage `onboarded` dans
`.ds-studio/settings.json`, privé), relançable depuis le menu des projets :
projet (local ou clonage GitHub) → détection → IA → récapitulatif. La détection
est heuristique et en lecture seule (profondeur 6, 6 000 entrées au plus,
node_modules/dist/.git et dossiers cachés ignorés) : fichiers dont nos propres
lecteurs trouvent des variables, dossiers nommés components/ui/atoms…, scripts
dev/start/storybook du package.json (affichés, jamais lancés). L’IA reste un
CLI officiel connecté par l’étudiant (Claude Code ou Codex) : pas de clé d’API
saisie ni stockée par DS-Studio ; l’assistant indique les commandes
d’installation et de connexion, vérifie l’état, et l’assistant flottant utilise
l’IA choisie (« Sans IA » : invitation à en brancher une).

**Incidents.** Un dossier `components` ne contenant que des sous-dossiers
n’était pas proposé (comptage limité aux fichiers directs) : comptage du
sous-arbre. Ordre des détections dépendant du disque : départage par chemin.
L’assistant modal bloquait les tests partant de données vierges (e2e, lanceur,
qualification Codex) : démarrage marqué fait dans ces tests, test dédié pour
l’assistant.

**Preuves.** Détection et réglages (2 tests unitaires), parcours navigateur
complet (détection, node_modules ignoré, « Sans IA », réouverture depuis le
menu), vérifié à l’écran (Claude Code détecté connecté sur ce poste).
96 tests unitaires et API, 19 navigateur, 20 lanceur, qualification.

**Limites.** L’analyse du dépôt par Claude (paires de contraste, conventions)
reste à faire (D5) ; pas de saisie de clé d’API par choix de sécurité.

## 2026-10-29 — Intégrations : plugin téléchargeable, IA gérée, export Figma bloqué

**Constat de l’étudiant.** « Composants et écrans : export en préparation… »
sans fin. Cause : son serveur tournait depuis le matin avec l’ancien code, alors
que l’interface (recompilée) appelait les nouvelles routes de l’export ; et
l’interface relançait l’export à chaque échec, sans limite. Correctif : un
échec est affiché dans la carte et n’est plus relancé automatiquement pour les
mêmes révisions ; le bouton reste disponible. Redémarrer le serveur suffit.

**Ajouts demandés.** Plugin Figma téléchargeable (archive ZIP générée à la
volée, sans dépendance : manifest, code, interface, mode d’emploi), relue par
Windows et par un test ; carte « Assistant IA » : choix Claude Code / Codex /
sans IA (même réglage que l’assistant de démarrage), état de connexion,
commandes d’installation et de connexion, vérification à la demande.

**Preuves.** Tests ZIP (CRC de référence, relecture), test HTTP du
téléchargement, archive décompressée par Windows (code.js identique), choix de
l’IA enregistré, export prêt sur un serveur à jour. 98 tests unitaires et API,
19 navigateur.

## 2026-10-29 — Phases D4 et D6 : aperçu des projets externes, plugin par projet

**Constat de l’étudiant** (projet Next.js « CDPP » branché) : le plugin Figma
ne proposait que Revela ; pas d’iframe du projet ; pas de version visuelle des
composants.

**Choix.**
- Aperçu : le serveur de développement du projet, lancé par l’étudiant (jamais
  par DS-Studio), dans une iframe à largeur réelle ; adresse déduite des
  dépendances (next → 3000, vite → 5173, astro → 4321, Storybook → 6006) ;
  adresses locales uniquement (`frame-src` limité à localhost) ; vérification
  « répond / ne répond pas » avec la commande à lancer.
- Composants : DS-Studio ne compile pas une app Next ; l’aperçu d’un composant
  passe par le projet lui-même — histoire Storybook (index.json, rapprochée par
  nom de fichier ou titre) ou page catalogue de l’app (`/chemin#NomDuComposant`).
- Plugin : sélecteur de projet (Revela + projets cochés « plugin Figma »),
  collection par projet, conversion des valeurs (couleurs #RRGGBB, rgb(),
  dimensions px/rem/em en pixels, le reste en texte), noms en groupes Figma
  (chaque « . » devient « / »), portées « toutes » pour les familles inconnues ;
  composants et écrans Figma pour Revela seulement.

**Incidents.** Carte Aperçu recréée à l’enregistrement (clé React liée à
l’adresse) : message de confirmation perdu, trouvé par le test navigateur.
Ports à un chiffre refusés par le motif d’adresse locale. Vue « Aperçu » d’un
projet externe ramenée à la vue d’ensemble par le routage : nom brut de la vue
conservé.

**Preuves.** 105 tests unitaires et API (conversion, histoires, plugin
multi-projets sur API simulée : deux collections distinctes, Revela intact ;
routes plugin et aperçu), 20 navigateur (faux serveur de dev : page, composant
dans le catalogue, instructions quand le serveur s’arrête), 20 lanceur.

**Limites.** Pas de page catalogue générée automatiquement (prévu avec l’agent
de code des projets externes, D5) ; pas d’essai encore dans Figma réel.

## 2026-10-29 — Page catalogue générée par Claude (projet externe)

**Demande de l’étudiant.** Générer avec Claude une page `/ds-studio` dans CDPP
(Next.js) pour voir chaque composant, proposée sur diff avant écriture.

**Choix.** Agent de code des projets externes : copie du projet dans un
dossier temporaire (sans node_modules, .git, sorties de build ni fichiers de
plus de 2 Mo), outils de lecture et d’édition seulement, 10 min au plus.
Seules les différences dans le dossier de la page (`src/app/ds-studio/` pour
l’App Router, `pages/ds-studio/` sinon) deviennent une proposition ; toute
autre modification de la copie est jetée. Consigne : une section
`#NomDuComposant` par composant, props d’exemple tirées du code et des pages,
`robots: noindex`, `notFound()` en production. Le chemin devient le catalogue
d’aperçu du projet ; la page est ensuite éditable comme un composant.

**Preuves.** Test HTTP avec un faux CLI qui écrit la page mais aussi un
composant et la config : seule la page est proposée, rien n’est écrit avant
validation, puis la page est écrite et listée ; refus sans dossier de
composants ou avec un chemin invalide. 106 tests unitaires et API,
20 navigateur, 20 lanceur.

**Limites.** Génération réelle à lancer par l’étudiant (son quota Claude) ;
routeurs autres que Next.js non pris en charge pour la génération.

**Essai réel (2026-10-29).** Page catalogue générée par Claude sur CDPP,
validée par l’étudiant sur diff, affichée dans l’aperçu des composants.

## Assistant IA sur les projets externes (2026-10-29)

L’assistant suit le projet actif. Sur un projet externe, Claude édite une
copie du projet (lecture et édition de fichiers, ni shell ni réseau). Les
fichiers de tokens modifiés deviennent une proposition de valeurs (ajouts et
suppressions de tokens ignorés, valeurs contrôlées) ; les dossiers de
composants, une proposition de code. Chaque proposition s’ouvre dans son
diff ; rien n’est écrit sans validation. Le reste de la copie est jeté.

## Projets ajoutés par le formulaire : détection appliquée (2026-10-30)

Comme l’assistant de démarrage, l’ajout d’un projet (dossier ou dépôt) pré-remplit
fichiers de tokens, dossier de composants et adresse d’aperçu détectés ; seul
l’état de DS-Studio est écrit, tout reste modifiable. Le lecteur CSS lit aussi
`:root` après un `@import` et les blocs `@theme` de Tailwind 4 (cas réel :
billboard). Un même fichier ou dossier déclaré deux fois ne compte qu’une fois.

## Mise en route d'un projet : commandes au clic, configuration par Claude (2026-10-30)

**Demande.** Un projet intégré doit être branché dès le début (variables,
composants, aperçu), avec l'IA qui configure au besoin juste après sa
connexion.

**Choix de l'étudiant.** DS-Studio peut lancer `install` et le script `dev`
du projet, au clic ; la configuration par Claude enchaîne tout.

**Garde-fous.** Deux tâches fixes seulement (gestionnaire déduit du fichier de
verrou, script dev/start/serve du package.json) : aucune commande saisie n'est
exécutée. Sortie visible, arrêt de l'arbre de processus, arrêt automatique
avec DS-Studio. Claude analyse une copie en lecture seule (aucun fichier
retenu) et répond en JSON ; chaque chemin est vérifié avant d'être appliqué
aux réglages de DS-Studio. La page catalogue reste soumise au diff. Les
fichiers `.env` ne sont ni lus ni écrits : seules leurs présences sont
signalées, et Claude nomme les variables nécessaires sans valeur.

**Essai réel (billboard).** `npm install` (493 paquets, 2 min) puis
`next dev` lancés depuis la carte ; aperçu affiché. Sans `.env.local`, la
base Neon est injoignable : la page garde ses panneaux de démonstration.

## Un port par projet, styles rattachés à leur composant (2026-10-30)

Deux projets réglés sur localhost:3000 affichaient le même serveur (CDPP
montrait billboard). Au démarrage par DS-Studio, chaque projet reçoit un port
qui n’est ni celui d’un autre projet ni occupé (variable PORT, et `--port`
pour Next, Vite, Astro, Nuxt…) ; l’adresse d’aperçu le suit. Un projet ajouté
reçoit d’emblée un port libre parmi les projets. Composants : `X.module.css`
et `X.stories.tsx` pointent sur la section `#X` ; les fichiers de la page
catalogue affichent la page entière. Arrêt de DS-Studio : les serveurs lancés
sont arrêtés de façon synchrone (un serveur survivait à l’arrêt).
