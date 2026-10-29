# Plugin Figma « Revela · DS-Studio »

Le plugin pousse la **révision validée** de DS-Studio vers les variables d’un
fichier Figma. DS-Studio n’a aucun accès à Figma : c’est vous qui lancez le
plugin dans Figma, qui lisez le plan et qui cliquez **Appliquer**.

## Prérequis

- **Figma desktop** (l’application, pas le navigateur) sur la même machine.
- DS-Studio lancé (`npm start`) : le plugin lit `http://localhost:4310`.
- Un fichier Figma où vous pouvez éditer. Commencez par un **fichier de test**.

## Installer (une fois)

1. Ouvrez un fichier Figma.
2. Menu **Plugins → Development → Import plugin from manifest…**
3. Choisissez `figma-plugin/manifest.json` dans ce dépôt.

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
5. Sans DS-Studio lancé : **export JSON** (bouton *Exporter les tokens* de
   l’atelier) puis chargez le fichier dans le plugin.

## Ce que le plugin écrit

- Une collection **« Revela · DS-Studio »**, un mode, 45 variables nommées
  `groupe/clé` (`color/warning`, `space/md`, `font/body`…), avec des portées
  (scopes) adaptées : couleurs de texte → texte, espacements → gap et tailles, etc.
- Les variables hors de cette collection ne sont **jamais** touchées.

## Garde-fous

- **Retouche faite dans Figma** : signalée en conflit et conservée, sauf si vous
  cochez explicitement « Remplacer … par la valeur DS-Studio ».
- **Type différent** (ex. variable texte au lieu de nombre) : jamais remplacé.
- **Plan périmé** : si Figma ou DS-Studio a changé entre la lecture et le clic,
  l’écriture est refusée ; relisez.
- Côté serveur, seule la route `GET /api/figma/tokens` (lecture) accepte le
  plugin (origine `null`, hôte `localhost`). Toutes les autres routes refusent.

## Dépannage

| Symptôme                                      | Cause et solution                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `Invalid value for devAllowedDomains`         | Ancien manifest avec une IP : réimportez `figma-plugin/manifest.json`.    |
| « DS-Studio injoignable sur localhost:4310 »  | DS-Studio n’est pas lancé : `npm start`, puis **Lire DS-Studio**.         |
| « Dossier déjà verrouillé » au `npm start`    | Verrou d’un serveur arrêté brutalement : voir [LAUNCHER](LAUNCHER.md).    |
| Plan vide alors que DS-Studio a changé        | La validation n’a pas abouti : vérifiez la révision dans l’atelier.       |

## Limites

- Plugin de **développement** : non publié, à importer sur chaque poste.
- Variables seulement pour l’instant ; la création de composants et de pages
  Figma est prévue (feuille de route).
