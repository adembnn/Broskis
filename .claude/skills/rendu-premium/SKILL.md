---
name: rendu-premium
description: Recettes chiffrées pour qu'une scène Three.js paraisse premium et non amateur (couleurs, lumière, matériaux, post-processing, budgets de performance). À utiliser pour tout travail sur la scène 3D.
---

# Rendu premium Three.js

Ordre obligatoire : **formes → matériaux → lumière → effets.** Le bloom ne rend pas beau un cube (source : pack threejs-game-skills de majidmanzarpour, à consulter pour les détails).

## 1. Couleurs à l'écran
- `renderer.outputColorSpace = THREE.SRGBColorSpace`.
- Tone mapping : `AgXToneMapping` (neutre) ou `ACESFilmicToneMapping` (cinéma, mais assombrit et décale les teintes). Régler d'abord `toneMappingExposure`, pas le reste.

## 2. Environment map (image qui éclaire la scène) — toujours
```js
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4; // scène sombre : bas ; scène lumineuse : ~1
```

## 3. Lumière en petite pile
- **Key** (principale, chaude, un peu de côté), **rim** (contre-jour qui détache les personnages du fond), **practicals** (sources visibles dans le décor : lampes, feux, écrans → PointLight + matériau émissif).
- Ombres réelles : seulement les personnages principaux et 1–2 gros objets. Le reste : fausse ombre (disque au dégradé radial sous l'objet).
- Lumière qui vit : les sources vacillent (bruit sur l'intensité, ±8 %), jamais de lumière parfaitement fixe.

## 4. Matériaux par rôle
Définir dans les tokens des matériaux par rôle (ex. `principal`, `bordure`, `sol`, `danger`, `recompense`, `emissif`). Varier la rugosité et le métal plutôt que la teinte seule. Un effet de bord lumineux (Fresnel) sur les personnages pour la lisibilité.

## 5. Post-processing (effets appliqués à l'image finale)
RenderPass → UnrealBloom (strength 0,35–0,6, radius 0,2–0,4, **threshold 0,85**) → vignette légère → OutputPass **en dernier**. Grain léger. Aberration chromatique (décalage des couleurs) seulement sur un impact bref.

## 6. Composition
Premier plan (un objet flou proche de la caméra), plan moyen (l'action), fond (le décor). La caméra respire (léger mouvement permanent) et se rapproche aux moments forts.

## 7. Budgets (portable de démo)
≤ 300 draw calls (ordres de dessin envoyés à la carte graphique), ≤ 750 k triangles, ≤ 2 lumières avec ombres, shadow map ≤ 2048, `setPixelRatio(Math.min(devicePixelRatio, 2))`, ≤ 2 passes de post-processing. Si les images/s chutent : couper d'abord post-processing et ombres. Vérifier `renderer.info`.

## Assets
Kenney.nl, Poly Pizza, Quaternius (licence CC0 = libre sans attribution), Poly Haven (textures, HDRI). Blender MCP seulement si quelqu'un le maîtrise.
