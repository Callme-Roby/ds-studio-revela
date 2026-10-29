# Mon projet de fin d’études

Projet : **Revela (RevelaOne)**, application desktop de gestion de shooting studio
pour photographes : tethering Sony, catalogue, tri, édition RAW non destructive,
export. Windows x64 et macOS Apple Silicon. Code React dans Electron.

Ne placez ici aucun secret ni donnée sensible. Ce fichier est envoyé au fournisseur
IA uniquement lorsque vous utilisez le chat dans l’application.

## Problème

L’interface de Revela n’a pas de Design System explicite : 6 variables CSS pour
51 couleurs écrites en dur, 9 tailles de texte et des doublons. Chaque changement
visuel se fait à la main dans `index.css`, sans vue d’ensemble ni contrôle
d’accessibilité. Inventaire : `workspace/REVELA_TOKENS.md`.

## Publics

- Photographes en studio, sur un poste fixe ou un portable, souvent en lumière
  contrôlée et sous pression de temps pendant la séance.
- À confirmer : assistant·e plateau, retoucheur·se, client présent à l’écran ?

## Contraintes du terrain

- La photo est jugée à l’écran : l’interface ne doit pas fausser la perception
  des couleurs (gris neutres, passe-partout autour de l’image).
- Application desktop dense : écrans de 1280 à 1920 px, texte d’interface en 11–12 px.
- L’état de la caméra (connectée, absente, en erreur) doit rester lisible en permanence.

## Objectif de l’outil

Faire de DS-Studio l’atelier du Design System de Revela : une modification de
token est proposée (à la main ou par une IA), examinée dans un diff, validée par
un humain, puis répercutée **au même moment** :

1. dans DS-Studio (catalogue et écrans Revela) ;
2. dans le code de Revela (variables CSS) ;
3. dans les variables du fichier Figma de Revela.

L’IA propose, elle n’applique jamais. Chaque écriture vers le code ou Figma passe
par la même validation humaine et se relit après coup.

## Lien Figma

À renseigner dans le brief privé de l’application, pas ici (le dépôt peut devenir public).

## À préciser

- Publics prioritaires et parcours à soutenir en premier.
- IA choisie pour les propositions (Codex est le seul adaptateur qualifié en V2).
- Plan Figma disponible et droits d’édition sur le fichier.
- Ce que je veux démontrer à la soutenance.
