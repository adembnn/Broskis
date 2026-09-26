# LPERF2 - Supprimer les saccades du premier impact et accélérer le 1er tour

## Fait
- Précompilation des shaders des effets d'impact (`latk-impacts`, `latk-vol`, etc.) pendant la répétition générale. Les instances voient leur `count` (ou `drawRange`) monté temporairement à 1, et leur visibilité forcée à `true` avant l'appel à `compileScene`, puis remis en l'état initial. (Modifié: `src/core/preload.ts`).
- Préchargement de la carte (map) associée au raccourci. Ajout de `preloadMap(..., PRIO.chosen)` aux raccourcis clavier `1/2/3` et `Enter/Space` pour que le chargement s'initialise avant l'appel à `onPick()`. (Modifié: `src/ui/screenMap.ts`).
- Exportation de la constante `PRIO` dans `src/core/preload.ts` pour qu'elle puisse être utilisée par l'UI.

## Pas fait / Frictions
- Les mesures précises avant/après avec `npm run perf` n'ont pas été menées directement, car je m'exécute dans un environnement CLI non interactif sans rendu GPU WebGL attaché.

## Décisions prises seul
- J'ai utilisé une recherche de noms de groupes commençant par `latk-` dans la scène lors de la répétition générale (`rehearse`) afin de couvrir de façon générique les pools (`latk-impacts`, `latk-vol`, `latk-main`, `latk-murs`), assurant la précompilation de tous les effets.
- Exportation de `PRIO` depuis `preload.ts` car ce n'était pas exposé au préalable.
