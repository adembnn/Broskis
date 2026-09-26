---
name: game-feel
description: Table chiffrée de « juice » (retours visuels, sonores et caméra qui rendent une action satisfaisante) pour le combat temps réel en écran scindé. À appliquer à chaque action d'un joueur.
---

# Game feel — temps réel, écran scindé

Game feel = la sensation que l'action « claque ». Sources et justification de chaque chiffre : `plan/recherche/game-design-temps-reel.md` §1 (ne pas recopier ici). Règles du jeu : `plan/PIVOT-TEMPS-REEL.md` (fait foi).

## Règle
Toute action a **au moins 3 retours** parmi : caméra, image, son, interface. Entrée → réaction visible **< 100 ms** (une image au mieux), même si l'IA n'a pas répondu.

## Table (codée dans `src/art/juice.js`, valeurs dans `src/art/tokens.js`)
Hitstop = gel de quelques images au contact. Trauma = force de secousse (0 à 1). FOV punch = élargissement bref de l'angle de caméra.

| Événement | Hitstop | Trauma (vue) | FOV | Autres retours |
|---|---|---|---|---|
| Tir relâché | 0 | 0 | 0 | flash à la bouche, traînée courte, claquement + souffle, recul du haut du corps |
| Charge (0,3–1 s) | 0 | 0,05 → 0,15 (tireur) | +2° progressif | particules aspirées vers l'arme, son montant, perso qui se ramasse |
| Impact léger | 50 ms | 0,3 (cible) | +4° (cible) | flash blanc 1 image, étincelles dans l'axe, % qui saute, grunt |
| Impact fort (charge pleine) | 90 ms | 0,6 (cible) + 0,2 (tireur) | +8° | gerbe + débris de décor, son grave, ralenti ×0,3 pendant 250 ms |
| Blocage | 20 ms | 0,15 (bloqueur) | 0 | étincelles absorbées, son mat |
| Parade parfaite (< 150 ms) | 60 ms | 0,4 (les 2 vues) | +6° | onde de choc, son métallique aigu, « PERFECT! » + voix animateur, ralenti ×0,3 pendant 0,3 s |
| Éjection | 0 après le hitstop | ∝ % (plafond 0,7) | jusqu'à +12° selon la vitesse | traînée de fumée, souffle qui s'éloigne |
| KO / perte de vie | 250 ms | 0,5 (les 2 vues) | zoom sur l'éjecté (vue de l'éjecteur) | ralenti 450 ms, flash, confettis de l'objet-arme, musique coupée 0,2 s puis sting + animateur |
| Saut / double saut | 0 | 0 | −2° | poussière / traînée sous les pieds, 2e saut 5 % plus aigu |
| Atterrissage | 15 ms | 0,1 (0,3 si grande chute) | 0 | squash vertical, poussière, thud |
| Caisse Snap ramassée | 0 | 0,2 | +5° | halo à la couleur de l'objet qui éclate, jingle unique, icône qui rebondit dans le HUD |
| Arme de nouveau prête | 0 | 0 | 0 | anneau de recharge qui se ferme + « tic » discret, icône qui pulse 150 ms |

- Trauma : secousse = trauma², décroissance 1,4/s, plafonnée. Jamais de secousse permanente.
- Hitstop en temps réel : gèle **les 2 combattants concernés et leurs projectiles**, jamais l'entrée ni l'autre vue au-delà de 90 ms (sauf KO et parade parfaite, voulus pour les 2).
- Squash & stretch à l'impact. Easing partout, jamais linéaire. Son : hauteur ±5 % à chaque lecture.

## Écran scindé : règles « par vue »
1. Secousse, FOV punch et zoom KO s'appliquent à **la caméra de la vue concernée** (la cible ou le bloqueur), pas à l'autre. Exceptions notées « les 2 vues » dans la table.
2. Le ralenti (échelle de temps globale) touche tout le monde : réservé à impact fort, parade parfaite, KO, GAME!.
3. Les flashs plein écran deviennent des flashs **de la demi-vue** (bord intérieur teinté). Seules les bannières READY? / GO! / GAME! couvrent les 2 vues.
4. Chaque tir adverse a 2 signaux : l'anneau `projectile:incoming` (400 ms avant l'impact) autour de soi + un repère au bord de sa vue côté source, et un son qui monte.
5. Aucun effet ne masque le personnage de sa propre vue plus de 100 ms.

## Test
Couper le son : la vue « répond »-elle ? Fermer les yeux : l'oreille distingue-t-elle tir, blocage, parade, KO ? Regarder UNE seule demi-vue : comprend-on qui a touché qui ?
