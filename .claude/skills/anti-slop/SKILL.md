---
name: anti-slop
description: Liste noire de l'« AI slop » (rendu générique d'IA) en 3D, interface, texte et IA de jeu. À lire avant de produire tout visuel, texte, dialogue ou HUD, et par chaque agent critique.
---

# Anti-slop

AI slop = ce qu'une IA produit quand personne ne lui impose de goût : joli de loin, vide de près, identique à mille autres démos.

## 3D — refusé
- Primitives brutes (cubes, sphères) « sauvées » par du bloom, du brouillard ou des particules. Le brouillard ne remplace pas un décor.
- Lumière ambiante seule, pas d'environment map (image qui éclaire la scène) : tout paraît gris et plat.
- Bloom partout, seuil bas : la scène « bave ». Le bloom se réserve aux sources voulues (sources lumineuses, effets de jeu).
- Néons cyan/magenta, violet→bleu par défaut. Les couleurs viennent de l'univers du jeu et de ses matières, pas du réflexe « futuriste » ou « magique ».
- Caméra fixe plein cadre. Aucun premier plan.
- Particules qui scintillent sans raison de jeu.

## Interface (HUD = informations affichées par-dessus le jeu) — refusé
- Cartes arrondies à ombre grise empilées, « stat cards » de tableau de bord.
- Glassmorphism (panneaux flous translucides), dégradés violets, emojis-icônes.
- Inter, Roboto, Arial. Petites capitales espacées au-dessus de chaque titre.
- Tout centré, tout de la même taille, plus de 5 couleurs.

## Texte et IA — refusé
- « Bienvenue, aventurier ! », « Plonge dans un monde… », épique / ultime / légendaire.
- Un PNJ (personnage non joueur) qui parle comme un assistant : « Bien sûr ! », listes, politesse, réponses longues.
- Tous les personnages avec la même voix. Chacun : un tic de langage, un désir, un défaut.
- IA décorative : si on l'enlève et que le jeu est identique, elle ne sert à rien.

## Test en 3 questions (un seul « non » = refaire)
1. Au milieu de 10 captures de jeux de hackathon, reconnaît-on la nôtre en 1 seconde ?
2. Y a-t-il un détail précis, artisanal, que personne n'aurait eu par défaut ?
3. Un directeur artistique de talent aurait-il fait CE choix, ou est-ce le premier réflexe ?
