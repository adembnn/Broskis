# Lot LSMASH-FX · Les effets qui font « Smash » : éjections, KO, BRO SMASH
Exécution : **Gemini** · Dépend du contrat v2 déjà sur main (`src/core/events.ts` : `hit` avec `pct` / `launch` / `willKo`, `stock:lost`, `respawn`, `ledge:grab`, `super:fire`, `match:banner`). Les règles qui émettent ces événements sont codées **en parallèle** (lot LSMASH). Tu codes les effets en écoutant le bus, et tu les testes en émettant toi-même les événements (`ctx.bus.emit(...)` dans Playwright).

## À livrer (références : Super Smash Bros. Ultimate)
1. **Éjection** (`hit` avec `launch`) : traînée de fumée derrière le perso éjecté, plus épaisse selon la vitesse ; au-delà de 12 m/s, **vrille** (rotation du perso) et étincelles.
2. **Zoom KO** (`hit` avec `willKo: true`) : l'effet signature de Smash. Arrêt sur image de 120 ms, puis **ralenti ×0,2 pendant 0,6 s**, lignes de vitesse radiales et flash rouge sur les bords de l'écran. Demande-le via les événements existants `slowmo` et `camera:cue { shot: 'impact' }` : ne modifie pas la caméra, le lot LFIX2 la refait en parallèle.
3. **Explosion de sortie** (`stock:lost`) :
   - côté ou bas : **colonne d'explosion** à la couleur du joueur (P1 `#E0452B`, P2 `#2F7DE1`), dirigée vers le centre de l'arène depuis `exitPos`, avec secousse d'écran et flash ;
   - haut : **« star KO »**, le perso rapetisse vers le fond du ciel et une étoile scintille.
4. **Réapparition** (`respawn`) : plateforme lumineuse sous le perso et halo d'invulnérabilité clignotant.
5. **Rattrapage au bord** (`ledge:grab`) : éclat bref à la main, petite poussière.
6. **BRO SMASH** (`super:fire`) : le fond s'assombrit 0,8 s, éclairs à la couleur du joueur autour de lui, anneau d'énergie ; le projectile porte une aura.
7. **« GAME! »** (`match:banner { kind: 'game' }`) : arrêt sur image et flash blanc. Le texte lui-même est affiché par le lot LUX (interface).

## Tes chemins
`src/scene/fx/smash/**` (nouveau), une ligne d'installation dans `src/scene/index.ts`. Réutilise les outils d'effets existants de `src/scene/` (particules, onomatopées, secousse) : lis-les d'abord. **Rien d'autre.**

## Contrôles
- `npm run build` passe. 60 i/s tenus : particules en `InstancedMesh` ou `Points`, au plus 300 particules en même temps.
- Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin) : lance un match (`gameHooks.startMatch({ map: 'archipel' })`), émets chaque événement avec des données plausibles et fais une séquence de captures pour chaque effet dans `captures/lsmash-fx/`.
- Planche récapitulative : `captures/lsmash-fx/planche.png`.
