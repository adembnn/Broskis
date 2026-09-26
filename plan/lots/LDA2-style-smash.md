# Lot LDA2 · Moins « cartoon », plus Smash / Brawlhalla : rendu et arènes
Exécution : **Gemini** · Retour d'Adem et Titouan (14h, en jouant) : « ça fait très cartoon », les maps sont « trop cartoonesques » ; ils veulent l'univers de **Super Smash Bros. Ultimate** et de **Brawlhalla**.

## Direction (arbitrage de Claude)
- **Rendu « stylisé premium » façon Smash Ultimate**, pas « dessin animé plat » :
  - **suppression des grosses marges blanches vinyle** autour des persos (les 3 coques de `addVinylShells`) : c'est l'élément le plus « cartoon ». Garde au plus un liseré sombre très fin (0,6 % de la taille) sur les persos seulement ;
  - matières : `MeshStandardMaterial` / `MeshPhysicalMaterial` avec les textures KayKit, rugosité 0,55 à 0,8, pas d'ombrage en 2 ou 3 aplats ;
  - lumière : lumière principale chaude + ciel froid (hémisphère), **lumière de contour** (rim light) derrière les persos pour les détacher du fond, ombres douces ;
  - post-traitement : tone mapping **ACES Filmic**, bloom léger sur les effets et les lumières (seuil haut), vignette douce, étalonnage par map ;
  - persos plus saturés et plus lumineux que le décor (lisibilité façon Smash).
- **Ambiance par map, façon Smash** (la disposition des arènes est refaite en parallèle par le lot LMAP2 dans `src/scene/maps/**` : tu fais la lumière, le ciel, le fond lointain et l'étalonnage) :
  - **Archipel** : coucher de soleil orange-violet, mer de nuages, îles lointaines, rayons de soleil ;
  - **Galion** : tempête, éclairs qui illuminent la scène, pluie légère en particules, mer animée autour ;
  - **Cuisine** : lumière de fenêtre réaliste, arrière-plan flou (profondeur).
- **Ciel et fond** : un vrai ciel par map (shader de ciel de three.js `examples/jsm/objects/Sky.js`, ou dégradé + nuages en billboards) et des éléments lointains à faible coût (silhouettes, brouillard de distance).
- Budget : **150 appels de dessin maximum** et 60 i/s visés. Réutilise les packs déjà téléchargés dans `public/assets/packs/` (hexagon, pirate, restaurant, furniture, platformer). **Aucun nouveau téléchargement.**

## Tes chemins
`src/scene/render/**` (dont l'environnement : ciel, lumières, fond lointain), `src/art/tokens.js` (mets à jour les jetons), `src/scene/fighters/loader.ts` (matières et coques des persos seulement), `src/scene/postfx*`. **Pas** `src/scene/maps/**` (lot LMAP2), **pas** la caméra (`src/scene/camera/**`, lot LFIX2 en parallèle), **pas** le HUD ni les règles (lot LSMASH en parallèle).

## Contrôles
- `npm run build` passe.
- Captures avant/après par map dans `captures/lda2/` (lance le match avec `gameHooks.startMatch({ map })`).
- Compte des appels de dessin par map (`renderer.info.render.calls`) dans ton rendu.
- Relis ton résultat contre cette consigne et donne-toi une note sur 10 par map, avec ce qui manque.
