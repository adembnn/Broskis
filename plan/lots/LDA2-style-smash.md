# Lot LDA2 · Moins « cartoon », plus Smash / Brawlhalla : rendu et arènes
Exécution : **Gemini** · Retour d'Adem et Titouan (14h, en jouant) : « ça fait très cartoon », les maps sont « trop cartoonesques » ; ils veulent l'univers de **Super Smash Bros. Ultimate** et de **Brawlhalla**.

## Direction (arbitrage de Claude)
- **Rendu « stylisé premium » façon Smash Ultimate**, pas « dessin animé plat » :
  - **suppression des grosses marges blanches vinyle** autour des persos (les 3 coques de `addVinylShells`) : c'est l'élément le plus « cartoon ». Garde au plus un liseré sombre très fin (0,6 % de la taille) sur les persos seulement ;
  - matières : `MeshStandardMaterial` / `MeshPhysicalMaterial` avec les textures KayKit, rugosité 0,55 à 0,8, pas d'ombrage en 2 ou 3 aplats ;
  - lumière : lumière principale chaude + ciel froid (hémisphère), **lumière de contour** (rim light) derrière les persos pour les détacher du fond, ombres douces ;
  - post-traitement : tone mapping **ACES Filmic**, bloom léger sur les effets et les lumières (seuil haut), vignette douce, étalonnage par map ;
  - persos plus saturés et plus lumineux que le décor (lisibilité façon Smash).
- **Arènes façon Smash** : chaque map devient une **scène suspendue dans un décor lointain spectaculaire**, avec un plateau principal net et lisible, des bords francs au-dessus du vide et **2 plateformes flottantes** où l'on peut sauter (comme Battlefield). Les dalles, colliders Rapier et points d'apparition restent dans le format JSON du moteur de maps (`src/scene/maps/`).
  - **Archipel** → ruines flottantes au coucher du soleil (ambiance « Battlefield » / « Hyrule Castle ») : îles lointaines, mer de nuages, ciel dégradé orange-violet, rayons de soleil.
  - **Galion** → le stage « Pirate Ship » de Smash : pont du galion en pleine mer, tempête, éclairs qui illuminent la scène, pluie en particules légères, vagues animées autour ; la gîte tous les 3 tours reste.
  - **Cuisine géante** → l'esprit du stage « Living Room » de Smash : persos minuscules sur un plan de travail, **lumière de fenêtre réaliste**, arrière-plan de cuisine flou (profondeur), objets du quotidien immenses.
- **Ciel et fond** : un vrai ciel par map (shader de ciel de three.js `examples/jsm/objects/Sky.js`, ou dégradé + nuages en billboards) et des éléments lointains à faible coût (silhouettes, brouillard de distance).
- Budget : **150 appels de dessin maximum** et 60 i/s visés. Réutilise les packs déjà téléchargés dans `public/assets/packs/` (hexagon, pirate, restaurant, furniture, platformer). **Aucun nouveau téléchargement.**

## Tes chemins
`src/scene/render/**`, `src/art/tokens.js` (mets à jour les jetons), `src/scene/maps/**` (visuel et disposition, sans casser le format JSON ni les événements de map), `src/scene/fighters/loader.ts` (matières et coques des persos seulement), `src/scene/postfx*`. **Pas** la caméra (`src/scene/camera/**`, lot LFIX2 en parallèle), **pas** le HUD ni les règles (lot LSMASH en parallèle).

## Contrôles
- `npm run build` passe.
- Captures avant/après par map dans `captures/lda2/` (lance le match avec `gameHooks.startMatch({ map })`).
- Compte des appels de dessin par map (`renderer.info.render.calls`) dans ton rendu.
- Relis ton résultat contre cette consigne et donne-toi une note sur 10 par map, avec ce qui manque.
