---
name: game-feel
description: Table chiffrée de « juice » (retours visuels, sonores et caméra qui rendent une action satisfaisante). À appliquer à chaque action du joueur ou de l'adversaire.
---

# Game feel

Game feel = la sensation que l'action « claque ». Références : « Juice it or lose it » (Jonasson & Purho, 2012), « The Art of Screenshake » (Jan Willem Nijman), game-feel.md du pack threejs-game-skills.

## Règle
Toute action a **au moins 3 retours** : caméra, image, son, interface.

## Table (à coder dans `src/art/juice.js`, valeurs dans les tokens)
| Événement | Hitstop (gel) | Trauma (secousse) | Autres |
|---|---|---|---|
| Action du joueur (tir, sort, saut) | 0 | 0,1 | anticipation 120 ms (le personnage se ramasse), recul, son montant |
| Coup qui touche | 70 ms | 0,4 | flash blanc 1 image sur la cible, particules dans le sens du choc, chiffre qui saute |
| Coup critique / combo | 90 ms | 0,7 | coup de FOV +8° (élargir l'angle de caméra), ralenti 300 ms, son grave |
| Esquive / parade | 50 ms | 0,2 | onde de choc, son métallique aigu |
| Victoire | 250 ms | 0,5 | ralenti, caméra qui tourne autour, lumière qui change |

- Screenshake = trauma², décroissance 1,4/s, plafonné. Jamais de secousse permanente.
- Squash & stretch (écraser/étirer) à l'impact. Easing (accélération/décélération) partout, jamais linéaire.
- Son : variation de hauteur ±5 % à chaque lecture.

## Réactivité
Entrée → réaction visible < 100 ms, même si l'IA n'a pas encore répondu (table des délais : skill `ia-en-jeu`).

## Test
Couper le son : l'écran « répond »-il ? Fermer les yeux : l'oreille comprend-elle ce qui se passe ?
