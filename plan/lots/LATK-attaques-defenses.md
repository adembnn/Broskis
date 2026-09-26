# Lot LATK · Attaques et défenses modélisées et animées : « l'arme, c'est l'objet »
Exécution : **2 agents Claude en parallèle** (LATK1 : objets, projectiles, impacts ; LATK2 : corps des combattants). Retour d'Adem (15h05) : « on n'a pas du tout modélisé les attaques : si je scanne une bouteille et que je l'utilise en grenade, ce n'est pas du tout modélisé. Pareil pour les tirs. Les attaques, les défenses… ne sont pas modélisées, pas du tout animées. »

## Principe (le cœur de la démo)
L'objet scanné **est** l'arme, et on le voit du début à la fin :
- dans la main du perso quand il la choisit ;
- en vol quand il la lance ou la tire ;
- à l'impact, en éclats aux couleurs de l'objet (`weapon.palette`) ;
- en mur quand c'est un bouclier.

L'objet est affiché avec son **sticker 3D** : la découpe « carton » extrudée du lot LS, `src/scene/sticker/` (`makeSticker(url, …)`), à partir de `weapon.stickerUrl`. Faute de sticker : `makeFallbackSticker(category, palette)`, en attendant l'arrivée du vrai.
Références de feeling : Worms (grenade qui rebondit, mèche, explosion en cercle), Smash (objets lancés), Brawlhalla (armes ramassées), Overwatch (tir lisible).

## LATK1 · Objets, projectiles, impacts (`src/scene/weapons/**`, nouveau)
- **En main** (`weapon:pick`) : le sticker de l'arme choisie dans la main droite (`handslot.r`), à la bonne taille (≈ 0,5 m), qui change avec l'arme. Pendant la charge (`aim:update` avec puissance) : l'objet tremble et luit de plus en plus.
- **BLASTER** : l'objet reste en main et tire. Rafale de projectiles (mini-copies du sticker ou éclats de sa couleur), éclair de bouche au bout de l'objet, traçantes, recul de l'objet, douilles colorées.
- **GRENADE** : l'objet quitte la main au lâcher (`anim:release`, sinon `fire`), tourne sur lui-même, suit la cloche, **rebondit** (trait `bouncy`) et clignote comme une mèche. Puis explosion : flash, **anneau d'onde au sol au rayon réel**, éclats à la couleur de l'objet, fumée, onomatopée « BOOM ».
- **THROWABLE** : l'objet est lancé fort, tourne vite, laisse une traînée ; gros impact avec anneau de poussière, marque au sol, secousse, « WHAM ».
- **SHIELD** (`shield:placed`) : l'objet grandit en **mur-sticker** géant (montée avec rebond, poussière à la pose). S'il est touché : étincelles et vacillement ; renvoi sur parade parfaite : ricochet visible.
- **Traits visibles** :
  - `explosive` : explosion plus grosse ;
  - `sticky` : éclaboussure gluante ;
  - `slippery` : flaque luisante ;
  - `healing` : étincelles vertes sur le lanceur ;
  - `split` : l'objet se divise en 3 ;
  - `loud` : ondes sonores ;
  - `heavy` : poussière et secousse ;
  - `bouncy` : écrasement à chaque rebond.
- **Vue du défenseur** : le projectile arrive **vers la caméra** ; il doit rester lisible et grossir (c'est le moment de la parade).
- **Position des projectiles** : lis-la dans le runtime de `src/gameplay/projectiles.ts` en lecture seule. Si ce n'est pas exposé, rejoue la trajectoire depuis `projectile:spawn { from, vel }` avec les mêmes formules (`src/gameplay/trajectory.ts`). Ne modifie pas la logique de jeu : le lot LSMASH y travaille.
- Réutilise `src/scene/fx/` et `src/scene/fx/smash/`. Pools, `InstancedMesh`, 300 particules maximum, 60 i/s.

## LATK2 · Le corps des combattants (`src/scene/fighters/**`, `src/scene/animation/**`)
- Utilise **les bons clips** parmi les 139 du pack Character Animations (`public/assets/packs/animations/clips.json`, squelette Rig_Medium) et les 13 de base. **Jamais `T-Pose`.**
  - lancer (grenade, throwable) : élan, lancer, accompagnement ;
  - tir (blaster) : bras tendu qui vise, recul à chaque tir ;
  - bouclier : pose au sol ;
  - parade : garde levée, variante « parfaite » avec contre ;
  - coups reçus : avant et arrière ;
  - éjection : vrille ;
  - atterrissage ;
  - accroché au bord (`ledge:grab`) et remontée (`ledge:climb`) ;
  - équilibre au bord (`teeter`) ;
  - victoire (`match:end`) ;
  - réapparition (`respawn`).
- **Anticipation → action → accompagnement** : 120 ms d'élan au minimum. Le lâcher de l'objet tombe sur la bonne image du clip et émet `anim:release` à ce moment-là (LATK1 s'y cale).
- **Visée** : pendant la charge, le perso se tourne vers la direction de visée et prend une pose de charge qui tremble.
- **Défense** : quand le défenseur appuie sur parade, garde levée immédiate (moins de 50 ms), puis réaction selon `parry:result` (parfaite = contre, bonne = recul, ratée = coup reçu).
- **Mesure** : `npm run anim` (banc du lot LE, réparé par LFIX2) + le juge vidéo Gemini (`tools/anim/juge-gemini.mjs`). Donne le score avant/après ; vise 8/10 du juge.

## Commun
- Lire d'abord `CLAUDE.md`, `plan/README.md`, `src/core/types.ts` et `src/core/events.ts` (contrat v2 : `hit.launch`, `stock:lost`, `ledge:*`, `teeter`, `super:fire`, `match:banner`), ainsi que les skills `.claude/skills/game-feel` et `rendu-premium`.
- D'autres agents travaillent en parallèle :
  - LSMASH : règles, `src/gameplay/**` ;
  - LUX : interface, `src/ui/**` ;
  - LMAP2 : maps, `src/scene/maps/**` ;
  - LPERF : performance, corrections chirurgicales ;
  - LLOAD : chargements.
  N'y touche pas, sauf une ligne d'installation dans `src/scene/index.ts`.
- Contrôle visuel obligatoire : séquences de captures Playwright pour chaque catégorie, en vue 3/4 et en vue défenseur (`captures/latk/`), plus une planche récapitulative. Relis-les comme un animateur exigeant et corrige avant de rendre.
