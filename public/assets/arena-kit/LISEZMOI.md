# Kit d'arène façon Smash (lot LKIT) : note d'intégration pour LMAP2

Aperçu 3D : `npm run dev` puis http://localhost:5173/arena-kit.html
(`?map=archipel`, `?map=galion`, `?map=cuisine` : arène assemblée avec 2 persos KayKit pour l'échelle ; `?vue=kit` : toutes les pièces).
Toutes les mesures (dimensions, contour de la surface de marche, collider conseillé, triangles, Ko) sont dans `kit.json`.

## Les 8 règles à connaître
1. **URL** : `/assets/arena-kit/<nom>.glb`. Dans un `MapDef` : `build: { kind: 'model', url: '/assets/arena-kit/plateau_pierre.glb' }`.
2. **Chargement** : GLB compressés meshopt + quantifiés, déjà gérés par `src/scene/maps/loader.ts` (`instantiate(url)` marche tel quel).
3. **Échelle** : 1 unité = 1 mètre. Perso = capsule de 1,8 m. **Ne pas mettre d'échelle** sur les plateaux (liserés et biseaux sont calibrés pour 1).
4. **Orientation** : axe long des plateaux = **X**, l'axe du duel (apparitions conseillées à x = ±4,75, z = 0).
5. **Ancre** : centre du dessus marchable, à **y = 0** (les pierres du liseré dépassent de 5 cm, c'est voulu). Exceptions : couverts (ancre = base au sol), nuages (dessous plat), socles hex (voir Archipel).
6. **Matière** : une seule, `arena_kit` (MeshStandardMaterial blanche, `vertexColors`, rugosité 0,85). Toute la couleur **et** l'occlusion ambiante sont cuites dans les couleurs de sommet. 1 pièce = 1 maillage = **1 appel de dessin**. `toonify` garde les couleurs de sommet, mais **passer un grade vide** (`{}`) : `tokens.maps.*.decor.saturation` (0,5) délaverait le kit, qui est déjà étalonné sur les palettes des maps.
7. **Chute propre** : le dessous (roche, coque, caissons) ne dépasse **jamais** du contour du dessus. Un perso poussé hors du bord tombe sans rien accrocher.
8. **Collider** : jamais de trimesh du maillage entier (le rayon de détection du vide, `EDGE_RAYCAST_DEPTH` = 1,35 m, prendrait la roche pour du sol). Utiliser le contour de `kit.json` :
   ```ts
   // surface.contour = [[x, z], ...] (32 points) ; un prisme convexe de 0,6 m d'épaisseur sous y = 0
   const pts = piece.surface.contour.flatMap(([x, z]) => [x, 0, z, x, -0.6, z]);
   const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!.setTranslation(px, py, pz);
   ```
   Il faut ajouter un type `{ type: 'convex'; points: [number, number][]; depth: number }` à `ColliderSpec` (types.ts + engine.ts). À défaut, un cuboïde de 19 × 15 m laisse du sol invisible dans les coins arrondis (jusqu'à 2,8 m en diagonale sur `plateau_pierre`) ; un cylindre de rayon 7,4 m, lui, coupe les bouts de l'ovale.
   Plateformes : un cuboïde suffit (`collider.conseil` dans `kit.json`), traversable par le dessous (`userData.oneWay`).

## Quelle pièce pour quelle map
Disposition « Battlefield » testée dans l'aperçu : 2 plateformes M à (±4,6 ; 2,4 ; −1,2), 1 plateforme S haute au fond à (0 ; 2,8 ; −4,2).

### Archipel (herbe et pierre)
- **Option A, la plus « Smash »** : `plateau_pierre` à (0, 0, 0). Dessus d'herbe net, **cercle de duel** en dalles au centre (Ø 5,8 m), liseré de pierres claires = bord du vide, dessous en strates avec stalactites. Monobloc : l'événement « l'anneau tombe » ne peut pas l'effriter.
- **Option B, si l'effritement des tuiles hex est gardé** : garder le disque de tuiles KayKit et glisser `socle_hex_<k>` dessous (k = rayon du disque en anneaux : 2, 3 ou 4), centré sur l'île, **à y = −1** (bas des tuiles quand leur dessus est à 0). Le disque devient une île céleste. Quand l'anneau k tombe : passer à `socle_hex_<k-1>` (ou échelle (k−1)/k en X et Z, tween 0,3 s). `bord_pierre` (segment droit de 2 m) peut border les tuiles extérieures.
- Plateformes : `plateforme_pierre_M` ×2 + `plateforme_pierre_S` (ou `_L` si besoin de plus de place).
- Couverts : `muret_ruine` (1,1 m de haut : on voit la tête derrière) au fond d'un côté, `tonneau` (même collider que `barrel_small` de props.glb : peut rester explosif), `caisse`.
- Fond (sans ombres) : `ile_lointaine_A/B` à 30-70 m, échelle 2 à 3 ; `rocher_S/M/L` à 12-25 m ; `nuage_A/B` sous le plateau (y −8 à −14), échelle 3 à 5. Les nuages et collines du pack KayKit Hexagon (`decoration/nature/cloud_big`, `hills_*`) restent utilisables en complément.

### Galion (pont)
- `plateau_pont` à (0, 0, 0) : pont ovale **sans bastingage**, lames le long de X, liseré de poutres blanchies par le sel, coque à clins dessous. Poser le mât et les voiles du Kenney Pirate Kit **au fond** (z ≈ −5), hauts, hors de la ligne de tir. La gîte de 12° : faire pivoter le groupe du pont autour de X, la coque suit (elle est dans le contour).
- Si le bateau Kenney est gardé comme plateau : retirer son bastingage et border le pont avec `bord_bois` (2 m, le vide côté −Z local).
- Plateformes : `radeau_M` ×2 + `radeau_S` (débris de pont qui flottent).
- Couverts : `caisse`, 1 ou 2 `tonneau`.
- Fond : `nuage_A/B` (le brouillard d'orage de LDA2 les assombrit), pas d'îles.

### Cuisine (îlot de cuisine géant)
- `plateau_cuisine` à (0, 0, 0) : carreaux **géants de 1,5 m** (les persos sont minuscules : c'est la cuisine géante), chant de hêtre clair = bord du vide, tiroirs et poignées chromées tout autour, 4,9 m de caissons sous le plan de travail (le sol de la cuisine, zone de chute, est plus bas).
- Le damier sert le gameplay : la bande balayée par l'éponge peut suivre **une rangée de carreaux** (1,5 m de large, lisible sans rien ajouter).
- Plateformes : `planche_M` ×2 + `planche_S` (planches à découper en hêtre, rainure sombre = bord).
- Grille-pain, éponge, bocaux : garder les packs KayKit Restaurant et Furniture.

## Budget mesuré
Plateaux 2 200-2 700 triangles et 34-41 Ko ; plateformes 450-1 000 triangles et 6-17 Ko ; tout le kit (27 pièces) ≈ 21 000 triangles et 360 Ko. Arène complète de l'aperçu (plateau, 3 plateformes, couverts, fond, 2 persos) : 71 à 85 appels de dessin.

## Regénérer ou modifier
`node tools/assets/build-kit.mjs` (Blender 5.0 sans fenêtre, puis optimisation et `kit.json`), ou `--only nom1,nom2`.
Formes, couleurs et dimensions : `tools/blender/arena_kit.py` (palette `PAL` ancrée sur `src/art/tokens.js`).
