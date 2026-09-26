# PIVOT 15h25 · Broskis passe en TEMPS RÉEL, 1 contre 1, écran scindé
Décision d'Adem et Titouan : « abandonner le tour par tour, les mécaniques ne sont pas assez fluides ; un jeu en temps réel, à la troisième personne, où l'on utilise ses armes ; un 1v1 ; à 2 sur le même PC, on scinde l'écran en deux ». Objectif : **le jeu le plus fluide possible.** Arbitrages de Claude ci-dessous : ils font foi pour tous les lots.

## Contrôles : 2 joueurs sur 1 clavier, visée verrouillée
- **Visée automatique verrouillée sur l'adversaire**, comme dans les jeux de combat en arène 3D (Power Stone, Dragon Ball Budokai Tenkaichi). Pas de souris.
  - Le blaster tire droit sur l'adversaire, avec une légère avance selon sa vitesse.
  - La grenade calcule sa cloche jusqu'à la position de l'adversaire.
  - Le throwable est un lancer tendu.
  - Le bouclier se pose entre soi et l'adversaire.
- **Touches par défaut** (module `src/core/input.ts`, réglables dans Settings) :

  | Action | P1 (gauche du clavier) | P2 (droite du clavier) |
  |---|---|---|
  | Bouger | ZQSD (WASD physique) | Flèches |
  | Sauter (×2) | ESPACE | MAJ DROITE |
  | Tirer (maintenir = charger) | F | L |
  | Bloquer / parer | G | K |
  | Armes 1, 2, 3 | 1, 2, 3 | 8, 9, 0 |

- **Manettes** (Gamepad API) si branchées. Stick gauche : bouger ; A : saut ; X ou RT : tir ; RB : blocage ; croix : armes. La 1re manette va à P1, la 2e à P2.

## Écran scindé
- Scission **verticale** : P1 à gauche, P2 à droite (même côté que ses touches). En mode vs IA, plein écran pour l'humain.
- Un seul `WebGLRenderer`. Pour chaque vue : `setViewport` + `setScissor`, avec sa caméra. Les ombres sont calculées une seule fois par image. Le post-traitement s'applique **une seule fois** sur l'image complète (les 2 vues rendues dans la même cible).
- Budget : 120 appels de dessin par vue au maximum. Ratio de pixels 1. 60 i/s sur la RTX 5060 (navigateur forcé sur la carte NVIDIA).

## Caméra (par joueur)
Troisième personne **verrouillée** :
- placée derrière et au-dessus du joueur, sur l'axe joueur → adversaire, légèrement décalée sur le côté ;
- les 2 persos toujours dans le cadre, et le vide visible autour de l'arène ;
- lissage 0,12 s, collision avec le décor, occlusion (le décor qui masque devient transparent), à reprendre du lot LFIX2 ;
- secousses et zoom KO (effets Smash) seulement dans la vue concernée.

## Règles temps réel (on garde les règles v2 façon Smash)
- **Déplacement** : 6,5 m/s, relatif à la caméra, contrôle en l'air, **double saut**, bords ouverts, rattrapage au bord automatique (`launch.ts`).
- **Dégâts en %**, éjection selon le %, **2 vies**, sortie de l'arène = perte d'une vie, réapparition invulnérable pendant 2 s. **Mort subite à 3:00** : les 2 joueurs passent à 150 %.
- **Armes** : 3 par joueur, **recharge en secondes** après usage :
  - BLASTER : rafale de 3 tirs, recharge de 1,2 s ;
  - GRENADE : 3 s ;
  - THROWABLE : 4 s ;
  - SHIELD : mur de 5 s, recharge de 8 s.
  Tir maintenu = charge (0,3 à 1 s, plus fort et plus loin). Stats et traits de l'arme : mêmes formules (`formulas.ts`), ramenées au temps réel.
- **Blocage** (maintenir G ou K) : dégâts ÷ 3, recul ÷ 2, déplacement ralenti. **Parade parfaite** : blocage déclenché moins de 150 ms avant l'impact. Le projectile est renvoyé, avec ralenti ×0,3 pendant 0,3 s et « PERFECT! ». Un anneau qui se referme autour du projectile entrant sert de repère (événement `projectile:incoming` émis 400 ms avant l'impact).
- **Caisse Snap** : tombe toutes les 35 s ; la toucher donne **instantanément** une 4e arme bonus, tirée des objets déjà scannés ou du cache, qui remplace l'arme choisie. Pas de pause.
- **Dangers de map sur minuterie** (20 à 30 s, annoncés 3 s avant) au lieu des tours.
- **Déroulé** : `READY?` puis `GO!` (compte à rebours de 3 s), combat, `GAME!` avec ralenti, écran de fin.

## Contrat (`src/core/types.ts` / `events.ts`)
- Phases : on ajoute `countdown` et `fight`. Les phases de tour (`turn-intro`, `move`, `aim`, `resolve`…) ne sont plus utilisées en match.
- `PlayerState` : on garde `pos`, `pct`, `stocks`, `onLedge`, `weapons`, `selected`. On ajoute `cooldowns: number[]` (secondes restantes par arme), `charge: number` (0 à 1), `blocking: boolean`, `yaw: number`.
- Événements : on garde `fire`, `projectile:spawn`, `projectile:incoming`, `hit`, `stock:lost`, `respawn`, `ledge:*`, `teeter`, `super:fire`, `match:banner`, `weapon:pick`, `parry:result` (émis quand un projectile touche un joueur qui bloque). On ajoute `block { player, on }`, `weapon:ready { player, index }` et `countdown { n }`. Les événements de tour (`turn:start`, `turn:end`, `move:update`, `parry:window`) ne sont plus émis.
- `window.gameHooks` reste obligatoire pour les tests : `startMatch({ …, split: true })`, `input(player, action, down)` (simule une touche), `setSeed`, `forcerVictoire`.

## Ce qu'on abandonne
Bascule de caméra vers le défenseur, budget de déplacement, chrono de tour, feintes / NICE / rythme « tic tic TAC » (remplacé par l'anneau du projectile entrant), IA au tour par tour.

## Répartition
- **Cœur temps réel** : `src/gameplay/**`, agent LSMASH redirigé.
- **Écran scindé et caméras** : `src/scene/camera/**`, rendu multi-vues dans `src/core/ctx.ts` / `src/scene/render/**`, nouvel agent RTVIEW.
- **HUD scindé et Settings** : `src/ui/**`, agent LUX redirigé.
- **Animation temps réel** (course fondue, attaques en mouvement sur le haut du corps) : agent LATK2 redirigé.
- **Objets, projectiles, impacts** : agent LATK1, inchangé.
- **Arènes un peu plus grandes pour courir** (diamètre 22 à 28 m, couverts pour jouer la ligne de tir) : agent LMAP2.
- **Performance** : LPERF, budget de l'écran scindé.
- **Chargements** : LLOAD, inchangé.
- **Bot temps réel + Gemini stratège** : plus tard, s'il reste du temps.
