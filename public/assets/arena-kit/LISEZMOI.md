# Kit d'arène façon Smash (lot LKIT) : note d'intégration pour LMAP2

Version temps réel (pivot de 15h25) : plateaux de 26 à 27 m, couverts à hauteur de torse, pièces très légères pour l'écran scindé.
Aperçu 3D : `npm run dev` puis http://localhost:5173/arena-kit.html
(`?map=archipel`, `?map=galion`, `?map=cuisine` : arène assemblée avec 2 persos KayKit pour l'échelle ; ajouter `&cam=basse` pour une vue de côté ; `?vue=kit` : les 34 pièces).
Toutes les mesures (dimensions, contour de la surface de marche, collider conseillé, triangles, Ko) sont dans `kit.json`.

## Les 9 règles à connaître
1. **URL** : `/assets/arena-kit/<nom>.glb`. Dans un `MapDef` : `build: { kind: 'model', url: '/assets/arena-kit/plateau_pierre.glb' }`.
2. **Chargement** : GLB compressés meshopt + quantifiés, déjà gérés par `src/scene/maps/loader.ts` (`instantiate(url)` marche tel quel).
3. **Échelle** : 1 unité = 1 mètre. Perso = capsule de 1,8 m. **Ne pas mettre d'échelle** sur les plateaux (liserés, biseaux et carreaux sont calibrés pour 1).
4. **Orientation** : axe long des plateaux = **X**. Apparitions conseillées à x = ±7, z = 0.
5. **Ancre** : centre du dessus marchable, à **y = 0** (les pierres du liseré dépassent de 5 cm, c'est voulu). Exceptions : couverts (ancre = base au sol), nuages (dessous plat), socles hex (voir Archipel).
6. **Matière** : une seule, `arena_kit` (MeshStandardMaterial blanche, `vertexColors`, rugosité 0,85). Toute la couleur **et** l'occlusion ambiante sont cuites dans les couleurs de sommet. 1 pièce = 1 maillage = **1 appel de dessin par vue**. `toonify` garde les couleurs de sommet, mais **passer un grade vide** (`{}`) : `tokens.maps.*.decor.saturation` (0,5) délaverait le kit, qui est déjà étalonné sur les palettes des maps.
7. **Chute propre** : le dessous (roche, coque, caissons) ne dépasse **jamais** du contour du dessus. Un perso éjecté tombe sans rien accrocher.
8. **Collider du plateau** : jamais de trimesh du maillage entier (le rayon de détection du vide, `EDGE_RAYCAST_DEPTH` = 1,35 m, prendrait la roche pour du sol). Utiliser le contour de `kit.json` :
   ```ts
   // surface.contour = [[x, z], ...] (32 points) ; un prisme convexe de 0,6 m d'épaisseur sous y = 0
   const pts = piece.surface.contour.flatMap(([x, z]) => [x, 0, z, x, -0.6, z]);
   const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!.setTranslation(px, py, pz);
   ```
   Il faut ajouter un type `{ type: 'convex'; points: [number, number][]; depth: number }` à `ColliderSpec` (types.ts + engine.ts). À défaut, un cuboïde de 26 × 21 m laisse du sol invisible dans les coins arrondis (jusqu'à 3,9 m en diagonale sur `plateau_pierre`). Plateformes : un cuboïde suffit (`collider.conseil`), traversable par le dessous (`userData.oneWay`).
9. **Écran scindé** : ombres portées seulement pour le plateau, les plateformes et les couverts ; aucune pour le fond. Si la caméra rend transparent le décor qui masque un perso, **cloner la matière de chaque couvert** (`mesh.material = mesh.material.clone()`) : les clones d'un même GLB partagent leur matière, sinon tous les murets deviennent transparents en même temps.

## Quelle pièce pour quelle map
Disposition « Battlefield » testée dans l'aperçu : 2 plateformes M à (±6,4 ; 2,4 ; −2,6), 1 plateforme S haute au fond à (0 ; 2,8 ; −6,6). Couverts de part et d'autre de la ligne de tir, jamais dessus : à (−3,6 ; 0 ; 3,4) tourné de 83° et à (3,9 ; 0 ; −3,3).

### Archipel (herbe et pierre)
- **Option A, la plus « Smash »** : `plateau_pierre` (26 × 21 m) à (0, 0, 0). Dessus d'herbe net, **cercle de duel** en dalles au centre (Ø 7,3 m), liseré de pierres claires = bord du vide, dessous en strates avec lèvres claires et 3 stalactites. Monobloc : il ne s'effrite pas (le danger passe alors par la catapulte).
- **Option B, si l'effritement des tuiles hex est gardé** : garder le disque de tuiles KayKit et glisser `socle_hex_<k>` dessous (k = rayon du disque en anneaux, de 2 à 6 ; k = 6 donne ≈ 24 m), centré sur l'île, **à y = −1** (bas des tuiles quand leur dessus est à 0). Quand l'anneau k tombe : passer à `socle_hex_<k-1>` (ou échelle (k−1)/k en X et Z, tween 0,3 s). `bord_pierre` (segment droit de 2 m) peut border les tuiles extérieures.
- Plateformes : `plateforme_pierre_M` ×2 + `plateforme_pierre_S` (ou `_L`).
- Couverts à hauteur de torse : `muret_bas` (3 m, 1,3 m de haut), `rocher_couvert` (1,5 m, coiffe d'herbe) ; décor de fond de plateau : `muret_ruine` ; `tonneau` (même collider que `barrel_small` de props.glb : peut rester explosif).
- Fond (sans ombres) : `ile_lointaine_A/B` à 30-70 m, échelle 2 à 3 ; `rocher_S/M/L` à 12-25 m ; `nuage_A/B` sous le plateau (y −8 à −14), échelle 3 à 5. Les nuages et collines du pack KayKit Hexagon (`decoration/nature/cloud_big`, `hills_*`) restent utilisables en complément.

### Galion (pont)
- `plateau_pont` (27 × 20 m) à (0, 0, 0) : pont ovale **sans bastingage**, lames le long de X, liseré de poutres blanchies par le sel, préceinte peinte vert-de-mer, coque à clins dessous. Poser le mât et les voiles du Kenney Pirate Kit **au fond** (z ≈ −7), hauts, hors de la ligne de tir. La gîte : faire pivoter le groupe du pont autour de X, la coque suit (elle est dans le contour).
- Si le bateau Kenney est gardé comme plateau : retirer son bastingage et border le pont avec `bord_bois` (2 m, le vide côté −Z local).
- Plateformes : `radeau_M` ×2 + `radeau_S` (débris de pont qui flottent).
- Couverts : `caisses_pile` ×2 (2 caisses + 1 tonneau, 1 seul appel de dessin), `tonneau`, `caisse`.
- Fond : `nuage_A/B` (le brouillard d'orage les assombrit), pas d'îles.

### Cuisine (îlot de cuisine géant)
- `plateau_cuisine` (26 × 21 m) à (0, 0, 0) : carreaux **géants de 1,5 m** (les persos sont minuscules : c'est la cuisine géante), chant de hêtre clair = bord du vide, tiroirs à poignées chromées tout autour, 4,9 m de caissons sous le plan de travail (le sol de la cuisine, zone de chute, est plus bas).
- Le damier sert le gameplay : la bande balayée par l'éponge peut suivre **une rangée de carreaux** (1,5 m de large, lisible sans rien ajouter).
- Plateformes : `planche_M` ×2 + `planche_S` (planches à découper en hêtre, rainure sombre = bord).
- Couverts à hauteur de torse : `tasse` (tasse à café géante de 1,3 m, bande terre cuite, café dedans), `sucre` (morceau de sucre de 1,2 m). Grille-pain, éponge, bocaux : garder les packs KayKit Restaurant et Furniture.

## Budget mesuré
Plateaux 2 670-2 820 triangles et 35-45 Ko ; plateformes 450-1 000 triangles et 6-17 Ko ; couverts 18-680 triangles et 2,5-13 Ko ; tout le kit (34 pièces) ≈ 26 000 triangles et 460 Ko, aucune texture. Arène complète de l'aperçu (plateau, 3 plateformes, 3-4 couverts, fond, 2 persos KayKit), ombres comprises : 75 à 89 appels de dessin pour une vue ; les pièces du kit n'en font qu'environ 30 (1 par pièce, plus 1 par pièce qui porte une ombre), le reste vient des 2 persos KayKit et de leurs ombres.

## Regénérer ou modifier
`node tools/assets/build-kit.mjs` (Blender 5.0 sans fenêtre, puis optimisation et `kit.json`), ou `--only nom1,nom2`.
Formes, couleurs et dimensions : `tools/blender/arena_kit.py` (palette `PAL` ancrée sur `src/art/tokens.js`).
