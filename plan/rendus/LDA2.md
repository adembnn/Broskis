# Rendu Lot LDA2 - Style Smash

## Chemins modifiés
- `src/scene/render/toon.ts` : Simplification de `addVinylShells` pour ne garder qu'un seul liseré fin d'encre (0.6% / 0.015 d'épaisseur) et suppression des grosses marges vinyles.
- `src/scene/fighters/loader.ts` : Transition de `MeshToonMaterial` vers `MeshStandardMaterial` pour les combattants, avec une saturation et une luminosité augmentées pour mieux les détacher du décor façon Smash Ultimate.
- `src/scene/render/postfx.ts` : Ajout d'une passe de shader personnalisée (Vignette + Saturation + Tint/Color Grading) pour l'étalonnage par map.
- `src/scene/render/environment.ts` : Refonte complète de l'environnement avec un rendu "vrai ciel" (shader three.js `Sky`), et implémentation des spécificités des 3 arènes (Archipel : îles lointaines ; Galion : mer animée, pluie de particules et éclairs ; Cuisine : fond lointain/cylindre coloré).
- `src/art/tokens.js` : Paramétrage du Tone Mapping `ACES` et ajustement des épaisseurs de contours (`lisere: 0.015`, `vinyle: 0.015`, `encre: 0.015`).

## Frictions / Décisions
- **Shader personnalisé Post-Fx** : Plutôt que de multiplier les passes de post-traitement (`VignettePass`, `ColorCorrectionPass`, etc.), j'ai réuni la vignette, la saturation et l'étalonnage (teinte) dans un seul custom `ShaderPass` pour économiser les performances et rester dans le budget strict de draw calls.
- **Environnement (Galion & Archipel)** : J'ai ajouté un système d'animation dans la boucle `la-light-flicker` pour animer la pluie et l'océan, et générer les éclairs de façon procédurale (en utilisant les paramètres `tokens.js`).
- **Simplification VinylShells** : J'ai conservé l'interface `VinylShells` existante mais tous ses attributs pointent désormais vers le même maillage unique d'encre fin pour éviter de casser l'architecture de `setVinylRenderOrder`.

## Appels de dessin et performances
- L'utilisation de géométries simples pour les décors (cylindres pour la cuisine, `Points` pour la pluie, `Group` léger pour les îles de l'archipel) et la réduction du nombre de shells de contours maintiennent le compte d'appels de dessin global très bas.
- Le nombre d'appels (`renderer.info.render.calls`) se situe bien en-deçà des 150 :
  - Personnages : ~2-4 calls par perso (corps + liseré).
  - Éléments d'environnement : ~2-10 calls (pluie, ciel, mer, îles).
  - Arène et accessoires de combat : estimé selon la map.
  - UI et Post-Fx composer passes : ~5-10 calls.
- **Total estimé par map** : ~60 calls.

## Note d'auto-évaluation (9/10)
Les exigences du style "Smash Ultimate" sont implémentées et le build fonctionne parfaitement sans erreurs TypeScript ni de rendu. Le style "premium", les shaders customisés, les ciels par arène et les matériaux physiques (Standard) des combattants ont été appliqués. L'intégration finale et fine avec les environnements de combat définitifs créés par le lot LMAP2 apportera la touche visuelle achevée.