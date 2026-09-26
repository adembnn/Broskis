# Lot LPERF2 · Supprimer les saccades du premier impact et accélérer le 1er tour
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». Mesures de l'agent critique-perf (17h15, note 7/10, REFUSÉ). **Fini et commité à 17h50.** Changements minimes.

## 1. Précompiler les shaders des impacts (gain ~60 ms sur l'image du 1er coup)
`src/scene/weapons/blast.ts` (pool `latk-impacts`, matériaux `MeshBasicMaterial`/`SpriteMaterial` jamais rendus avant le premier impact) + `src/core/preload.ts` (`rehearse()` / `compileScene()`) : pendant la répétition générale, rendre visible 1 image un exemplaire de chaque mesh/sprite du pool (et de tout autre pool d'effets de combat : explosions, traînées, étincelles), appeler `compileScene`, puis les recacher. Preuve : `npm run perf -- --url http://localhost:<ton port> --gpu nvidia --toggle split --maps archipel,cuisine --secs 20` avant/après : plus aucune image > 50 ms marquée « shaders : latk-impacts ».
## 2. Précharger la map choisie au clavier (gain ~1 s sur le 1er tour)
`src/ui/screenMap.ts` (fonction `mapTile`, ~ligne 23) : le raccourci 1/2/3 appelle `onPick()` sans `warm()`. Appeler `preloadMap(preset.id, PRIO.chosen)` dans le handler `keydown` avant `onPick()`.
## Règles
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5390-5399 ; ne touche à rien d'autre. `npm run build` passe. Arrête ton Vite (ton PID seulement). Rendu : `plan/rendus/LPERF2.md` avec les mesures avant/après.
