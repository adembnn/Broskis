# Lot LINTRO · Survol de l'arène avant chaque combat (façon Smash)
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». Demande d'Adem (17h14). **Fini et commité à 17h55.**
Lis `CLAUDE.md` (règle 9 : chaque vue reste sur son joueur PENDANT le combat), `plan/PIVOT-TEMPS-REEL.md`, `src/scene/camera/**` (caméras par joueur du lot RTVIEW), `src/core/events.ts` (`match:start`, `countdown`, phases `countdown`/`fight`).

## Objectif
Au début de chaque match, avant le `GO!` : un survol cinématique de 3,5 s maximum qui montre toute l'arène (travelling circulaire en hauteur autour du plateau, qui finit dans le dos de chaque joueur), **sur les 2 vues en même temps** (exception validée par Adem : elle a lieu avant le combat). À la fin, chaque vue rejoint en douceur (0,4 s) sa caméra de joueur normale, puis `READY? 3-2-1 GO!` continue comme aujourd'hui. Pendant le combat, aucun changement : chaque vue reste sur son joueur.
- Passable : n'importe quelle touche d'action (tir/saut d'un des 2 joueurs) saute l'intro.
- Désactivable par `?intro=0` et par `gameHooks.startMatch({ intro: false })` (les tests automatiques s'en servent) ; en `?demo=1` elle est jouée.
- Durée et hauteurs dans les tokens (`src/scene/camera/tokens.ts` ou `src/art/tokens.js`).

## Périmètre
- Nouveau fichier `src/scene/camera/intro.ts` + **au plus 10 lignes** dans les fichiers existants de `src/scene/camera/` (le lot RTVIEW de l'autre session y travaille : changements minimaux, signale chaque ligne) et 1 option dans `src/core/types.ts` (`intro?: boolean`) si besoin.
- Interdits : `src/gameplay/**` (le compte à rebours et les phases restent tels quels ; si le combat doit attendre la fin de l'intro, décale seulement le début du compte à rebours via un événement existant ou signale-le), `src/scene/maps/**`, `src/ui/**`.

## Preuve
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5360-5369 ; captures RÉELLES (jamais « simulées ») à 0 / 1 / 2 / 3 / 3,6 s après `startMatch({ map, split: true })` sur les 3 maps dans `captures/lintro/`, regardées ; puis `phase === 'fight'` et vues sur leurs joueurs. `npm run build` passe. Arrête ton Vite (ton PID seulement).
Rendu : `plan/rendus/LINTRO.md` (fait / pas fait, fichiers, lignes modifiées hors intro.ts, captures).
