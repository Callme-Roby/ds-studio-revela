# Plugin Figma « Revela · DS-Studio »

Le plugin pousse la **révision validée** de DS-Studio vers un fichier Figma :
les **variables**, puis les **composants** (avec leurs variantes) et les
**écrans** de Revela, liés à ces variables. DS-Studio n’a aucun accès à Figma : c’est vous qui lancez le
plugin dans Figma, qui lisez le plan et qui cliquez **Appliquer**.

## Prérequis

- **Figma desktop** (l’application, pas le navigateur) sur la même machine.
- DS-Studio lancé (`npm start`) : le plugin lit `http://localhost:4310`.
- Un fichier Figma où vous pouvez éditer. Commencez par un **fichier de test**.

## Installer (une fois)

0. Dans DS-Studio : **Intégrations → Télécharger le plugin**, puis
   décompressez l’archive (ou utilisez le dossier `figma-plugin/` du dépôt).
1. Ouvrez un fichier Figma.
2. Menu **Plugins → Development → Import plugin from manifest…**
3. Choisissez `manifest.json` (dossier décompressé ou `figma-plugin/` du dépôt).

Le plugin apparaît dans **Plugins → Development → Revela · DS-Studio**.
`figma-plugin/code.js` est généré par `npm run figma:build` (déjà fait dans le dépôt).

## Utiliser

1. Lancez le plugin (clic droit sur la toile → **Plugins → Development**).
2. **Lire DS-Studio** : le plugin affiche « DS-Studio : révision N » et le plan :
   variables à créer, à modifier, en conflit, déjà à jour.
3. **Appliquer N changement(s) à Figma** : écriture, puis relecture.
   Message attendu : « … relues : Figma est à jour (révision N) ».
4. Option **Suivre les validations** : tant que le plugin est ouvert, il relit
   DS-Studio toutes les 3 s et propose le nouveau plan à chaque validation.
5. **Composants et écrans** : la case « Construire aussi les composants et les
   écrans » est cochée quand l’export de DS-Studio est à jour. Le bouton devient
   « Appliquer N variable(s), puis construire composants et écrans » (ou
   « Construire composants et écrans » si les variables sont déjà à jour).
6. Sans DS-Studio lancé : **export JSON** (bouton *Exporter les tokens* de
   l’atelier) puis chargez le fichier dans le plugin.

## Ce que le plugin écrit

- Une collection **« Revela · DS-Studio »**, un mode, 45 variables nommées
  `groupe/clé` (`color/warning`, `space/md`, `font/body`…), avec des portées
  (scopes) adaptées : couleurs de texte → texte, espacements → gap et tailles, etc.
- Les variables hors de cette collection ne sont **jamais** touchées.
- Une page **« Revela · Composants »** : un composant par entrée du catalogue
  (Button, LiveBadge, Alert, Thumb, Slider, Segmented, Field, AiSearch,
  Channels, Tooltip, ModeTabs), en **jeu de variantes** quand il en a
  (`variant=primary, state=default`…). Mise en page automatique, textes en Inter.
- Une page **« Revela · Écrans »** : Prise de vue, Bibliothèque, Développement
  à 1440 × 900, où chaque composant du DS est une **instance** (libellés de
  l’écran reportés).
- **Liaisons** : fonds, contours et textes liés aux variables de couleur ;
  marges internes et espacements aux `space/*` ; rayons aux `radius/*` ;
  tailles de texte aux `font/*`. Modifier une variable dans Figma met donc à
  jour composants et écrans.

## D’où viennent composants et écrans

DS-Studio prépare un **export** (Intégrations → « Préparer l’export Figma »,
refait automatiquement après chaque validation) : il affiche chaque composant et
chaque écran dans une iframe cachée, relève géométrie, mise en page et styles
calculés, et retrouve la variable d’origine de chaque valeur. Pour les couleurs,
un second rendu remplace chaque variable par une couleur témoin unique : deux
variables de même valeur (`color.brand` et `color.text` valent `#111111`) ne
sont donc jamais confondues. Le plugin lit cet export sur
`GET /api/figma/spec`, en lecture seule.

Reconstruction : un composant déjà construit est vidé puis reconstruit **sur
place** (même identifiant) : les instances placées ailleurs dans le fichier
suivent. Une retouche faite **à l’intérieur** d’un composant ou d’un écran
généré est remplacée à la reconstruction ; travaillez avec des instances.

## Garde-fous

- **Retouche faite dans Figma** : signalée en conflit et conservée, sauf si vous
  cochez explicitement « Remplacer … par la valeur DS-Studio ».
- **Type différent** (ex. variable texte au lieu de nombre) : jamais remplacé.
- **Plan périmé** : si Figma ou DS-Studio a changé entre la lecture et le clic,
  l’écriture est refusée ; relisez.
- **Export périmé** (variables validées depuis) : la construction est désactivée
  jusqu’à ce que DS-Studio régénère l’export ; relisez ensuite.
- **Sans variables** dans le fichier, la construction est refusée.
- Côté serveur, seules les routes `GET /api/figma/tokens` et
  `GET /api/figma/spec` (lecture) acceptent le plugin (origine `null`, hôte
  `localhost`). Toutes les autres routes refusent.

## Dépannage

| Symptôme                                      | Cause et solution                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `Invalid value for devAllowedDomains`         | Ancien manifest avec une IP : réimportez `figma-plugin/manifest.json`.    |
| « DS-Studio injoignable sur localhost:4310 »  | DS-Studio n’est pas lancé : `npm start`, puis **Lire DS-Studio**.         |
| « Dossier déjà verrouillé » au `npm start`    | Verrou d’un serveur arrêté brutalement : voir [LAUNCHER](LAUNCHER.md).    |
| « Export en préparation » sans fin, ou erreur d’export | Serveur DS-Studio lancé avant une mise à jour : Ctrl+C puis relancez-le. |
| Plan vide alors que DS-Studio a changé        | La validation n’a pas abouti : vérifiez la révision dans l’atelier.       |

## Limites

- Plugin de **développement** : non publié, à importer sur chaque poste.
- Rendu approché : police Inter à la place de la police système, curseurs et
  champs natifs simplifiés, photos de démonstration en aplat de gris.
- Sens unique : DS-Studio → Figma. Une retouche de composant faite dans Figma ne
  revient pas dans le code.
