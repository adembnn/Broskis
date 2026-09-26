# Rendu Lot LSMASH-FX

## Fait
- `src/scene/fx/smash/index.ts` : Création du module d'effets visuels écoutant le bus pour les événements Smash (`hit` avec `launch` / `willKo`, `stock:lost`, `respawn`, `ledge:grab`, `super:fire`, `match:banner`).
- **Éjection** : Traînée de fumée générée dynamiquement selon la vitesse (`hit.launch`), déclenchement de la vrille (rotation X) et étincelles au-delà de 12 m/s.
- **Zoom KO** : Overlay plein écran attaché à la caméra avec shader personnalisé pour les lignes de vitesse radiales, la vignette rouge (`hit` avec `willKo: true`). Appels de `slowmo` (120ms puis 600ms ralenti) et `camera:cue`.
- **Explosion de sortie** : Effet de colonne avec particules `additive` pour les KO latéraux/inférieurs, et animation de "Star KO" (réduction d'échelle et vol vers le haut avec flash) pour les KO vers le ciel.
- **Réapparition** : Ajout d'une plateforme (cylindre + halo sphérique additif) qui clignote et disparaît au bout de 2s lors d'un `respawn`.
- **Ledge grab** : Flash blanc et particules de poussière sur la main du joueur attrapant le bord.
- **BRO SMASH** : Assombrissement du fond (via l'overlay existant), anneau d'énergie et éclairs.
- **GAME!** : Arrêt sur image (slowmo) et flash blanc puissant via l'événement `match:banner`.
- `src/scene/index.ts` : Ajout de l'appel à `installSmashFx`.
- Outil de test `tools/test-lsmash.mjs` pour capturer la planche.

## Décisions prises seul
- L'overlay plein écran (`Zoom KO`, `BRO SMASH`, `GAME!`) est réalisé avec un `ShaderMaterial` rendu au-dessus de tout le reste (`depthTest: false`) via un plan 2D calé sur la position/rotation de la caméra dans la boucle de rendu. Cela garantit un affichage correct sans interférer avec d'éventuels systèmes de caméra (qui pourraient la recréer ou interdire des enfants directs).
- Le tracking des éjections (`Launch Tracking`) mesure la vélocité frame-par-frame en plus du `launch` initial afin d'appliquer une décélération naturelle pour l'effet de fumée.

## Frictions
- La demande de "ralenti x0.2 pendant 0.6 s" et "arrêt sur image de 120 ms" a nécessité l'usage de `setTimeout` pour s'intercaler correctement.
- Le test visuel nécessitait d'emettre les événements "dans le vide", il a donc fallu créer un script e2e custom (`tools/test-lsmash.mjs`) qui simule un match, émet les events, et capture les rendus.

## Commandes pour tester
\`\`\`bash
npm run build
node tools/test-lsmash.mjs
\`\`\`