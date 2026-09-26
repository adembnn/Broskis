---
name: son
description: Donner au jeu une identité sonore (ambiance, sons d'actions, musique) sans fichiers ou avec des banques libres. À utiliser dès qu'une action est jouable.
---

# Son

Un jeu muet paraît inachevé. Le son est le moyen le moins cher de gagner en « AAA ».

- **Ambiance permanente** (couche de fond) : la rumeur du lieu (foule, vent, machines, feu…). Banques libres : freesound.org (vérifier licence CC0), Kenney (packs audio CC0), Sonniss GDC bundle (gratuit, libre de droits).
- **Chaque événement de la table `game-feel` a un son**, avec variation de hauteur ±5 %. Vérifier qu'aucun événement n'est muet.
- **Sons générés par code** (Web Audio API ou bibliothèque ZzFX, ~1 ko) pour les actions : rapide et cohérent.
- **Mixage** : la musique baisse (« ducking ») quand une action importante part ou quand l'IA parle.
- **Voix** : Gradium (partenaire, synthèse vocale) pour l'adversaire ou le commentateur, si les crédits sont là. Sinon, texte seul, bien mis en scène.
- Démarrer l'audio au premier clic (les navigateurs bloquent le son avant une interaction).
