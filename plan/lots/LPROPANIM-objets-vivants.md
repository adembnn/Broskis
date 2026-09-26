# Lot LPROPANIM · Les objets du décor s'animent quand on les touche
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». **Fini et commité à 17h30.** Lis `CLAUDE.md`, `plan/PIVOT-TEMPS-REEL.md`, `.claude/skills/game-feel/SKILL.md` (table temps réel), `src/scene/maps/engine.ts` (construction des accessoires : `LoadedMap.props`, `prop.holder`) et `src/core/events.ts` (`prop:triggered`, `hit`, `projectile:*`, `map:warn`…).

## Objectif
Un décor qui réagit : aujourd'hui les objets sont figés. Chaque objet touché par un projectile, un joueur ou une explosion répond par une animation courte et lisible (0,15-0,6 s), sans coût notable :
- tonneaux et caisses : écrasement-étirement + petite rotation ; tonneaux explosifs : gonflement 0,2 s avant l'explosion ;
- grille-pain tremplin : ressort qui rebondit quand il lance ;
- rouleau à pâtisserie : rotation cohérente quand il roule ; bocal : oscille ;
- canon du galion : recul ; mât et voiles : balancement lent permanent ;
- plateformes : enfoncement-rebond de 3 cm quand un joueur atterrit dessus ;
- dalles de l'archipel qui vont tomber : tremblement 1 s avant (en plus de l'annonce existante).
Tout passe par l'animation des `holder` (transformations), jamais en recréant des maillages ; valeurs dans les tokens (`src/art/tokens.js` ou `src/scene/maps/tokens.ts`).

## Périmètre
- Nouveau fichier `src/scene/maps/prop-anim.ts` (écoute le bus, anime les holders) + **au plus 5 lignes** dans `src/scene/maps/engine.ts` pour l'installer et exposer ce qu'il faut. Un autre agent (LMAP3) refait les maps en parallèle : ne modifie rien d'autre dans engine.ts ni dans archipel/galion/cuisine.ts ; base-toi sur `kind` des props, pas sur des ids en dur.
- Interdits : `src/gameplay/**` (collisions inchangées), `src/scene/weapons/**`, `src/scene/camera/**`, `src/ui/**`.

## Méthode et preuve
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5350-5359 ; `gameHooks.startMatch({ map, split: true })`, vérifier `gameState.phase === 'fight'`. Déclenche les réactions par `window.ctx.bus.emit(...)` et par de vrais tirs (`gameHooks.input`). Captures en rafale (−50/+50/+150/+300 ms) par objet dans `captures/lpropanim/`, regardées. i/s mesurés avant/après. `npm run build` passe. Arrête ton Vite (ton PID seulement).

## Rendu (`plan/rendus/LPROPANIM.md`, commité)
Objet × animation × capture, fichiers touchés, i/s avant/après.
