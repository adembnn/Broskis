# Lot LKIT · Bibliothèque d'outils 3D + kit d'arènes façon Smash, beau et léger
Exécution : **agent Claude (Opus, direction artistique 3D)** · Demande d'Adem (14h35) : « énorme travail de mapmaking », « c'est vraiment une arène Smash Bros / Brawlhalla », « les assets ne sont pas assez polis, esthétiquement c'est pas fou », « crée des assets utilisables qui ne prennent pas beaucoup de ressources », « ce qui te manque, c'est une bibliothèque d'outils 3D : va la chercher et régale-toi ». Adem autorise les téléchargements d'assets et d'outils **gratuits sous licence CC0 ou équivalente**.

## 1. La boîte à outils (30 min maximum)
- **Optimisation GLB** : `npx @gltf-transform/cli` (dedup, weld, simplify, resize des textures, meshopt ou quantize) et/ou `gltfpack`. Via `npx` seulement, **jamais** ajouté au `package.json`. Script `tools/assets/optimise.mjs` qui passe un dossier entier et affiche avant/après : Ko, triangles, textures.
- **Blender 5.0 sans fenêtre** : `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" -b -P script.py`. Le MCP Blender n'est pas branché dans cette session : les scripts Python suffisent.
- **Bibliothèques CC0** à évaluer, puis télécharger si elles apportent un vrai plus. Déjà présents dans `public/assets/packs/` : Kenney Pirate et Platformer, KayKit Hexagon, Restaurant et Furniture. Candidats :
  - **Quaternius** (quaternius.com, poly.pizza) : Stylized Nature MegaKit, Ultimate Platformer, Modular Ruins… ;
  - **Kenney** (kenney.nl) : Nature Kit, Castle Kit… ;
  - **KayKit** (kaylousberg.itch.io) : Forest Nature Pack, Dungeon Remastered… ;
  - **Poly Haven** (polyhaven.com) : ciels HDRI **en 1k seulement**, textures CC0.
  Avant chaque téléchargement, affiche le nom, la source, la licence et la taille. Range dans `public/assets/packs/<nom>/` avec un `LICENCE.txt`, et **ne garde que les fichiers utilisés** (supprime le reste du zip).

## 2. Le kit d'arène « Smash » (le livrable principal)
Fabrique avec Blender (procédural, scripts rejouables dans `tools/blender/`) et/ou à partir des packs CC0 un **kit de pièces polies et légères** pour des arènes façon **Super Smash Bros. Ultimate / Brawlhalla** :
- **Plateau principal** flottant : dessus net et lisible, **biseau** sur les bords, **dessous en roche effilée** façon île céleste (ambiance « Battlefield »), avec 3 variantes de matière (herbe et pierre ; planches de bois de pont ; plan de travail carrelé).
- **Plateformes flottantes** (3 tailles), même langage visuel, plus fines.
- **Bordures et liserés de bord** : un bord légèrement plus clair, pour que le joueur voie où le vide commence.
- **Éléments de fond** légers : îles lointaines en silhouette, nuages en cartes, rochers flottants.
- **Couvert** : mur bas en ruine, caisse, tonneau.
- Style : **stylisé premium** (formes simples mais soignées, biseaux, couleurs par sommet ou petite texture en dégradé, occlusion ambiante cuite dans les couleurs de sommet), cohérent avec les persos KayKit, **pas** de dessin animé plat.
- Budget : moins de 3 000 triangles par pièce de plateau, moins de 150 Ko par GLB, pas de texture au-delà de 512 px, une matière partagée par map si possible.
- Livraison : `public/assets/arena-kit/*.glb` + `public/assets/arena-kit/kit.json` (nom, dimensions en mètres, point d'ancrage, surface de marche, usage) + une **page d'aperçu** `public/arena-kit.html` qui les affiche en 3D, rotation lente, fond neutre.

## 3. Branchement
Le lot **LMAP2** (agent en parallèle, `src/scene/maps/**`) refait la disposition des 3 arènes. Tu ne modifies **pas** `src/scene/maps/**` : tu livres le kit et une note d'intégration (`public/assets/arena-kit/LISEZMOI.md` : quelle pièce pour quelle map, échelle, orientation, collider conseillé). La session principale l'enverra à LMAP2.

## Tes chemins
`tools/assets/**`, `tools/blender/**`, `public/assets/arena-kit/**`, `public/assets/packs/<nouveaux>/**`, `public/arena-kit.html`.

## Contrôles
- `npm run build` passe.
- Capture de la page d'aperçu : `captures/lkit/kit.png`.
- Tableau des pièces dans ton rendu : triangles, Ko.
- Regarde les captures comme un directeur artistique exigeant (skill `.claude/skills/rendu-premium` si présent) : « est-ce que ça ressemble à une arène de Smash Ultimate ? » Note sur 10, et corrige sous 8.
