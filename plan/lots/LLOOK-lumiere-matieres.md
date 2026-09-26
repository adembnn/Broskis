# Lot LLOOK · Lumière, matières et contraste du combat (« c'est vraiment moche » — Adem, 16h29)
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». **Fini et commité à 17h30.** Lis `CLAUDE.md`, `plan/PIVOT-TEMPS-REEL.md`, skills `.claude/skills/rendu-premium/SKILL.md`, `anti-slop`, `direction-artistique`, et `plan/recherche/perf-ecran-scinde.md`.

## Objectif
Que chaque demi-vue du combat ressemble à un vrai jeu (références : Smash Bros Ultimate, Fall Guys, Brawlhalla 3D) : persos qui se détachent nettement du décor, matières lisibles, lumière avec une direction et une couleur par map, zéro aspect « délavé / boueux / plastique gris ».

## Périmètre (tes seuls fichiers)
- `src/art/tokens.js` : lumières, couleurs, étalonnage par map (garde les noms existants, change les valeurs ; ajoute si besoin).
- `src/scene/fighters/loader.ts` : **matières des persos seulement** (couleur, rugosité, rim light / fresnel léger par `onBeforeCompile`, émissif discret de l'équipe P1 rouge / P2 bleu). Pas l'animation.
- `src/scene/render/environment.ts` et les lumières de scène : **lumières seulement**. NE TOUCHE PAS au rendu multi-vues ni au branchement du post-traitement (`src/core/ctx.ts`, `postfx.ts` : lot RTVIEW d'une autre session) ; si un réglage du post-traitement est nécessaire, passe par les tokens.
- Interdits : `src/scene/maps/**` (lots LMAP3/LSKY en cours), `src/scene/weapons/**`, `src/scene/camera/**`, `src/ui/**`, `src/gameplay/**`.

## Méthode
1. `git rebase main` ; ton Vite sur un port 5340-5349 ; matchs lancés par `gameHooks.startMatch({ map, split: true })`, vérifier `gameState.phase === 'fight'` (règle : tester uniquement la dernière version).
2. Mesure de départ : `node tools/maps/eval-maps.mjs --url http://localhost:<port> --out captures/llook/avant` (juge Gemini image inclus) et regarde toi-même les captures `-epauleP1` / `-epauleP2`.
3. Itère : persos plus saturés et plus clairs que le décor (rapport de luminance perso/sol ≥ 1,5), ombre portée nette sous les persos, rim light qui détoure, lumière clé chaude + remplissage froid, brouillard/étalonnage qui ne délave pas. Budget : 120 appels de dessin par vue, aucune nouvelle ombre dynamique.
4. Mesure finale `--out captures/llook/apres`. Objectif : critères « lisibilité » et « matières » ≥ 8 sur les 3 maps, sans baisser les autres.

## Rendu (`plan/rendus/LLOOK.md`, commité)
Notes avant/après par map, valeurs changées, chemins des captures, i/s mesurés. `npm run build` passe. Arrête ton Vite (ton PID seulement).
