# Lot LJUMP · Un saut qui sert vraiment (réécrit pour le temps réel, pivot de 15h25)

Bug vu par Adem : « des tuiles tombent, un broski essaie de sauter mais ne peut pas atteindre la marche ». Mesure avant le lot : saut 5,6 m/s et double saut 6,4 m/s pour une gravité de 20 m/s², soit un saut de **0,78 m** et un double saut de **≈ 1,8 m**, alors que les plateformes traversables sont à 2,3-2,4 m (LMAP2). Elles étaient donc inatteignables.

Hauteur d'un saut = v² / (2 × g). Le périmètre de ce lot, après le pivot : les **constantes** de saut, les **plateformes traversables** (one-way : on les traverse en montant, on atterrit dessus) et le **coyote time**. Le déplacement, le contrôle en l'air, le coyote time et le rattrapage au bord appartiennent au cœur temps réel (RTCORE, `src/gameplay/**`).

## À quoi sert le saut en 1v1 temps réel

| Usage | Ce qu'il faut | Référence Smash / Brawlhalla | Réglage retenu |
|---|---|---|---|
| **Esquiver** un tir tendu (blaster, throwable) ou une vague qui balaie le sol | Passer les pieds au-dessus d'un projectile à ~0,5-1 m du sol, pendant ~0,3 s | Saut court (tap) pour esquiver, saut plein pour passer par-dessus | Saut simple : **1,09 m**, 0,33 s de montée |
| **Prendre de la hauteur** sur une plateforme pour tirer d'en haut ou casser la ligne de tir | Pieds au-dessus du dessus d'une plateforme de **2,0 m** (MAX_LEDGE_HEIGHT promis par LMAP3), avec marge si le 2e saut part en retard | Plateformes traversables par le dessous (Battlefield), double saut | Double saut au sommet : **2,59 m** ; parti 0,15 s trop tard : **≈ 2,37 m** en théorie |
| **Franchir une marche ou un trou** quand l'arène s'effrite (Archipel) ou qu'un obstacle bloque (caisse, tonneau 1,1 m, canon 1,06 m) | Monter d'1 m d'un seul saut | Saut simple suffit pour une marche basse | Saut simple 1,09 m + « montée auto » de Rapier (0,35 m) au contact |
| **Revenir au bord** après une éjection | Remonter 2 à 3 m sous le bord | Double saut de rattrapage + accroche au bord (ledge grab) | Double saut 2,59 m + accroche automatique de `launch.ts` (déjà là, RTCORE) |
| **Rater de peu** une plateforme | Ne pas « rebondir » sous le dessus pour quelques cm | Smash pose le perso sur une plateforme dès qu'il en touche le dessus en descente | Pieds jusqu'à **0,35 m** sous le dessus, au sommet ou en descente, corps dans l'emprise : posé dessus |
| **Sauter juste après le bord** en courant | Le saut part « du sol » quelques images après avoir quitté le bord | Coyote time des jeux de plateforme (≈ 0,1 s) | **COYOTE_S = 0,1 s** (RTCORE, vérifié par le test) |

## Ce qui a été fait (code)
- `src/gameplay/tuning.ts` : `JUMP_VELOCITY` **6,6** m/s et `AIR_JUMP_VELOCITY` **7,75** m/s (avant 5,6 / 6,4 ; RTCORE avait mis 7,5 / 7,2 en parallèle, soit 1,41 m au 1er saut : trop haut pour « esquiver court » ; on garde 1,09 m + 2,59 m) ; `GRAVITY` inchangée (20) ; `ONEWAY_SNAP_BELOW` (0,35 m) et `ONEWAY_SNAP_MAX_VY` (1,5 m/s). `COYOTE_S` = 0,1 s vit déjà sur main (RTCORE, `movement.ts::jump`, `lastGroundedAt`) : pas de doublon.
- `src/gameplay/character.ts` :
  - **intégration exacte de la gravité** (moyenne des vitesses sur l'image) : l'apex vaut v²/2g quelle que soit la cadence (avant, la hauteur dépendait des saccades du navigateur) ;
  - **plateformes traversables** : le filtre du contrôleur (`userData.oneWay` / `topY`, posés par `src/scene/maps/engine.ts`) existait déjà (on traverse en montant, on se pose en descendant). Ajout : `snapOntoOneWay` pose le perso sur le dessus s'il le rate de moins de 0,35 m ; `oneWayBoxes(ctx)` liste les plateformes (utile au bot et à une future « descente à travers ») ;
  - **dalles qui tombent** : une dalle en chute libre (corps dynamique, vitesse verticale < −1 m/s) n'est plus un sol (`arena.ts::isFallingDebris`, utilisé par les rayons de sol et le contrôleur). Avant, le perso pouvait « surfer » la dalle jusqu'au vide sans jamais être en l'air pour sauter ou s'accrocher au bord.

## Déjà fait par RTCORE (main) / reste possible
- Contrôle en l'air (`AIR_ACCEL`, `AIR_DRAG`) et coyote time : sur main.
- Descente à travers une plateforme (bas + saut, façon Brawlhalla) : non fait. `oneWayBoxes` donne le dessus ; il suffit de passer les pieds 0,4 m sous `topY` (le moteur de map désactive alors la plateforme, `ONEWAY_EXIT` = 0,35 m).
- Rattrapage latéral au rebord d'une marche solide : non fait ; le double saut suffit pour 2,0 m.

## Preuve
`node tools/jump/test-saut.mjs` (Vite sur le port 5195, `gameHooks.input(p, 'jump', down)` si présent, sinon `gameHooks.jump()` ; temps de jeu, pas temps réel, pour ne pas dépendre des saccades du navigateur sans écran). Résultat sur main rebasé (temps réel), 18/18 :
- saut simple 1,09 / 1,09 / 1,08 m (archipel / cuisine / galion) ; double saut au sommet 2,59 / 2,59 / 2,55 m ; double saut parti en retard (0,18 à 0,27 s après le sommet, saccades du navigateur sans écran) 2,28 / 2,24 / 1,86 m ;
- les 6 plateformes (dessus 2,30 à 2,40 m) atteintes par un double saut depuis le sol, pieds posés à 2,37 à 2,47 m ;
- coyote : saut accepté juste après avoir quitté le bord (1,09 m) ; anneau de l'Archipel qui tombe sous les pieds : le perso tombe avec (−1,30 m) et s'accroche au bord ; chute hors du plateau : une vie perdue ; 0 erreur console.
