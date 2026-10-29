# Règles de conception

## Générales

- Employer les couleurs sémantiques plutôt que des hexadécimaux dans les composants.
- Conserver un contraste de 4,5:1 pour le texte courant et 3:1 pour le grand texte.
- Conserver 3:1 pour le contour d’un champ ou d’un contrôle qu’il faut repérer.
- Garder un focus clavier visible et des libellés explicites pour les formulaires.
- Distinguer normal, survol, focus, désactivé et erreur.
- Expliquer chaque proposition : intention, composants touchés, preuve attendue.
- Ne jamais annoncer une synchronisation Figma qui n’a pas été relue et démontrée.

## Propres à Revela

- Les gris de l’interface restent strictement neutres (R = V = B) : une interface
  teintée fausse la perception des couleurs de la photo.
- La photo est toujours entourée du passe-partout neutre (`color.surface.mat`).
- La couleur est réservée au sens : état de la caméra, alerte, erreur, photo
  choisie, canaux R/V/B, recherche IA. Jamais décorative.
- Aucun texte en dessous de 10 px ; le texte d’interface courant est en 11–12 px.
- L’état de la caméra reste visible et compréhensible sans la couleur seule.
- Vérifier les écrans Studio, Catalogue et Développement en 1280 et 1920 px.

Ces règles sont des objectifs à tester, pas une certification automatique.
