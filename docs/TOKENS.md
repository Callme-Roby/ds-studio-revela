# Tokens et échanges locaux

La V2 conserve un JSON à clés sémantiques plates :

```json
{ "color.brand": { "$type": "color", "$value": "#3154C4" } }
```

Cet extrait n’est **pas un fichier complet importable**. Exportez le fichier complet
par l’application ou prenez `workspace/design-system.tokens.json` comme modèle.
Toutes ses clés doivent rester présentes, sans clé supplémentaire.

Les couleurs sont `#RRGGBB` ; les dimensions sont des nombres de 0 à 128, convertis
en pixels CSS ; les familles sont `system-ui`, `Arial`, `Georgia` ou `Verdana`.
Pas d’alias, de thèmes, d’alpha ou d’unités composées dans ce format. Ce format reprend les noms
`$type/$value` mais ne prétend pas implémenter toute la spécification DTCG (notamment
la représentation normative de couleur et dimension). Aucun convertisseur Figma
n’est fourni. Un export de plugin tiers doit être converti explicitement.

## Importer une palette

Exporter les tokens, modifier une valeur dans le JSON, puis importer via l’interface.
Le schéma et les valeurs sont validés avant proposition. Le diff et l’acceptation
sont les mêmes qu’en mode manuel. Un fichier invalide ne change ni le journal ni
le seed. Le navigateur transmet le contenu, jamais un chemin de fichier à ouvrir.

## Ajouter un token dans le code

Déclarer la clé et sa validation dans `model.ts`, la valeur de seed, les usages CSS
ou React et un contrôle visible. Concevoir et tester une migration avant de
distribuer un changement de schéma. Ne pas effacer les données de l’étudiant.

## Version 2 du schéma (Revela)

45 clés : les 18 clés v1, inchangées, plus 27 clés Revela (surfaces, passe-partout,
alerte, sélection, canaux, masques, IA, tailles, espaces, rayons). Au démarrage,
un `state.json` v1 est validé avec l’ancien schéma, archivé tel quel en
`state-v1-preserved-<uuid>.json`, puis réécrit en v2 avec les valeurs de
`v2Additions` pour les nouvelles clés. Tokens et historique v1 sont conservés ;
les révisions anciennes restent annulables. Un v1 incohérent est refusé sans écriture.

Un import doit désormais contenir les 45 clés : un fichier exporté en v1
(18 clés, comme `workspace/revela-tokens.json`) est refusé. Exporter d’abord
depuis l’application pour obtenir un modèle complet.

Hors du format : opacité (voiles Revela), graisses, ombres, durées et rayon
« pilule » (999 px dépasse la borne de 128).
