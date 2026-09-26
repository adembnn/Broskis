# Rendu LKIT · Bibliothèque d'outils 3D + kit d'arène façon Smash

Branche : `worktree-agent-a8b3d3a16c6c6de72` · agent Claude (Opus, direction artistique 3D) · 26/09, 14h35 → 15h40.
Kit minimal commité à 14h52, kit complet à 15h03, adaptation au pivot temps réel (15h25) à 15h28, retouches jusqu'à 15h35.

## 1. La boîte à outils
| Outil | Rôle | Comment l'appeler |
|---|---|---|
| **Blender 5.0.1 sans fenêtre** | Modélise tout le kit en procédural : contours, biseaux, strates, liserés, couleurs par sommet, **occlusion ambiante cuite** (lancer de 12 à 28 rayons par sommet sur un arbre de recherche BVH). Rejouable, aucune retouche à la main. | `tools/blender/arena_kit.py` (lancé par `build-kit.mjs`) |
| **glTF-Transform 4.5** (npx) | Compression **meshopt** + quantification des sommets, dédoublonnage, soudure ; textures limitées à 512 px ; pas de simplification (elle abîmerait les facettes voulues). Divise la taille par 4 à 5 (plateau : 181 → 45 Ko). | `node tools/assets/optimise.mjs <entrée> <sortie> [--stats f.json]` (avant/après : Ko, triangles, textures) |
| **gltfpack 1.3** (npx) | Testé et disponible (`npx -y gltfpack`), non utilisé : glTF-Transform suffit. | — |
| Statistiques GLB | Ko, triangles, sommets, appels de dessin, textures et leur taille max, sans dépendance. | `node tools/assets/glb-stats.mjs f.glb` |
| Chaîne complète | Blender → optimisation → `kit.json`, en une commande (≈ 2 min), ou pièce par pièce. | `node tools/assets/build-kit.mjs [--only a,b]` |
| Capture | Lance **son propre** Vite sur un port libre 5300-5399, capture l'aperçu, arrête ce serveur-là seulement. | `node tools/assets/capture-kit.mjs [--vues arene-archipel,arene-galion-basse,kit]` |

Rien n'a été ajouté au `package.json` ; les outils npx restent dans le cache npm, hors du dépôt.

## 2. Sources téléchargées : aucune (évaluation)
- **KayKit Medieval Hexagon** (déjà dans `public/assets/packs/hexagon/`) contient nuages, collines, montagnes et arbres : le décor de nature est couvert.
- **Quaternius Stylized Nature / Kenney Nature Kit** (CC0) : doublon de ce qu'on a, et le style à aplats de Kenney aurait juré avec les persos KayKit.
- **Poly Haven** (ciels HDRI 1k, CC0) : le kit n'a pas de texture (tout est en couleurs par sommet) et l'éclairage d'environnement appartient au lot LDA2, à qui la consigne interdit les nouveaux téléchargements.
- Conclusion : 0 octet téléchargé dans le dépôt. Le vrai manque était un **outil pour fabriquer nos propres pièces** cohérentes et légères : c'est la chaîne Blender + glTF-Transform ci-dessus.

## 3. Le kit (34 pièces, `public/assets/arena-kit/`)
Une seule matière (`arena_kit` : blanche, couleurs par sommet, rugosité 0,85), zéro texture, 1 appel de dessin par pièce. Ancre = centre du dessus marchable à y = 0. Le dessous ne dépasse jamais du contour du dessus (on tombe sans accrocher). Budget respecté partout : pièces de plateau < 3 000 triangles, toutes < 150 Ko.

| Pièce | Rôle | Map | Taille X × Y × Z (m) | Triangles | Ko |
|---|---|---|---|---:|---:|
| `plateau_pierre` | plateau | archipel | 26.1 × 8.1 × 21.1 | 2819 | 45.2 |
| `plateau_pont` | plateau | galion | 27.1 × 5.3 × 20.1 | 2754 | 39.7 |
| `plateau_cuisine` | plateau | cuisine | 26.0 × 4.9 × 21.0 | 2709 | 35.3 |
| `plateforme_pierre_S` | plateforme | archipel | 3.3 × 1.0 × 2.1 | 774 | 14.1 |
| `plateforme_pierre_M` | plateforme | archipel | 4.7 × 1.1 × 2.5 | 918 | 16 |
| `plateforme_pierre_L` | plateforme | archipel | 6.3 × 1.2 × 2.9 | 1008 | 17.4 |
| `radeau_S` | plateforme | galion | 3.3 × 0.8 × 2.1 | 671 | 12.2 |
| `radeau_M` | plateforme | galion | 4.7 × 0.8 × 2.5 | 709 | 12.2 |
| `radeau_L` | plateforme | galion | 6.3 × 0.8 × 2.9 | 809 | 13.4 |
| `planche_S` | plateforme | cuisine | 3.2 × 0.2 × 2.0 | 448 | 6.5 |
| `planche_M` | plateforme | cuisine | 4.6 × 0.2 × 2.4 | 448 | 6.5 |
| `planche_L` | plateforme | cuisine | 6.2 × 0.2 × 2.8 | 448 | 6.1 |
| `socle_hex_2` | socle | archipel | 8.4 × 4.4 × 7.5 | 1144 | 20.7 |
| `socle_hex_3` | socle | archipel | 12.4 × 5.5 × 11.0 | 1290 | 22.8 |
| `socle_hex_4` | socle | archipel | 16.4 × 6.6 × 14.5 | 1394 | 23.9 |
| `socle_hex_5` | socle | archipel | 20.4 × 7.7 × 17.9 | 1498 | 24.8 |
| `socle_hex_6` | socle | archipel | 24.4 × 8.8 × 21.4 | 1602 | 26.5 |
| `bord_pierre` | bord | toutes | 2.0 × 0.4 × 0.8 | 36 | 2.9 |
| `bord_bois` | bord | galion | 2.0 × 0.3 × 0.5 | 18 | 2.5 |
| `muret_bas` | couvert (torse, 1,3 m) | archipel | 3.0 × 1.4 × 0.8 | 198 | 5.7 |
| `rocher_couvert` | couvert (torse, 1,5 m) | archipel | 2.3 × 1.5 × 1.7 | 80 | 4.6 |
| `muret_ruine` | couvert bas | archipel | 3.7 × 1.2 × 1.9 | 216 | 6.2 |
| `caisses_pile` | couvert (torse) | galion | 2.4 × 1.1 × 2.2 | 678 | 13.1 |
| `caisse` | couvert | toutes | 1.1 × 1.1 × 1.1 | 234 | 5.8 |
| `tonneau` | couvert | toutes | 1.0 × 1.1 × 1.0 | 210 | 4.7 |
| `tasse` | couvert (torse, 1,3 m) | cuisine | 2.0 × 1.3 × 1.6 | 460 | 6.9 |
| `sucre` | couvert (torse, 1,2 m) | cuisine | 1.2 × 1.2 × 1.2 | 18 | 2.5 |
| `ile_lointaine_A` | fond | archipel | 6.4 × 6.9 × 4.8 | 562 | 11.7 |
| `ile_lointaine_B` | fond | archipel | 4.4 × 5.6 × 3.6 | 504 | 10.7 |
| `rocher_S` | fond | archipel | 1.8 × 1.5 × 1.4 | 216 | 5.7 |
| `rocher_M` | fond | archipel | 3.0 × 2.5 × 2.4 | 288 | 6.8 |
| `rocher_L` | fond | archipel | 4.6 × 3.9 × 3.7 | 288 | 6.8 |
| `nuage_A` | fond | archipel | 5.9 × 1.5 × 2.7 | 400 | 11.4 |
| `nuage_B` | fond | archipel | 4.5 × 1.3 × 2.0 | 320 | 9.3 |
| **Total (34 pièces)** | | | | **26 169** | **460,6** |

Métadonnées par pièce dans `kit.json` : dimensions, ancre, **contour de la surface de marche** (32 points, pour un collider convexe exact), collider conseillé, usage.
Aperçu : `/arena-kit.html?map=archipel|galion|cuisine[&cam=basse]` et `?vue=kit`. Une arène complète de l'aperçu (plateau, 3 plateformes, 3-4 couverts, fond, 2 persos KayKit) fait 75 à 89 appels de dessin ombres comprises, dont environ 30 pour les pièces du kit.

## 4. Choix de direction artistique (les détails qu'on n'aurait pas eus par défaut)
- **Liseré = bord du vide** : pierres claires chanfreinées, poutres blanchies par le sel, chant de hêtre ; le chanfrein est éclairci pour accrocher la lumière. On voit où le sol s'arrête, même en petit dans l'écran scindé.
- **Strates en bols empilés** sous l'archipel : chaque couche s'effile puis la suivante repart avec une lèvre claire, plus 3 stalactites ; roche « peinte » facette par facette.
- **Un repère central par map**, visible depuis la caméra de jeu : cercle de duel en dalles (archipel, le « ring » de l'animateur), rose des vents délavée (galion), damier géant (cuisine, dont les rangées de 1,5 m peuvent guider la bande de l'éponge).
- **Fiction d'échelle** de la cuisine : carreaux de 1,5 m, tasse à café et sucre géants comme couverts, planches à découper comme plateformes.
- Préceinte peinte vert-de-mer sur la coque (couleur `accent` du galion dans les tokens), une pierre sur dix moussue.

## 5. Note de directeur artistique (« est-ce que ça ressemble à une arène de Smash Ultimate ? »)
Captures (locales, `captures/` n'est pas versionné) : `captures/lkit/kit.png`, `arene-archipel.png`, `arene-archipel-basse.png`, `arene-galion.png`, `arene-galion-basse.png`, `arene-cuisine.png`, `arene-cuisine-basse.png`, et **vue de jeu** à la 3e personne dans une moitié d'écran scindé (800 × 900) : `arene-archipel-joueur.png`, `arene-galion-joueur.png`, `arene-cuisine-joueur.png` (`node tools/assets/capture-kit.mjs --taille 800x900 --vues arene-archipel-joueur`). Depuis la caméra de jeu, le liseré du bord lointain reste une ligne claire lisible et les couverts ont la bonne échelle (hauteur de torse).

| Map | Note | Ce qui marche | Ce qui manque encore |
|---|---:|---|---|
| Archipel | **8/10** | Silhouette « Battlefield » immédiate, strates lisibles, liseré net, fond cohérent (îles et rochers dans le même langage) | Pas de végétation au bord du plateau ; lumière de l'aperçu seulement (le vrai rendu dépend de LDA2) |
| Galion | **8/10** (7 avant la rose des vents) | Pont ouvert lisible, bord blanchi, coque de navire vue de côté, rose des vents au centre | Sans le mât Kenney au fond, vu de loin cela reste un « plateau en bois » |
| Cuisine | **7,5/10** | Idée d'échelle forte, damier très lisible, tasse et sucre charmants | Caissons unis sous le plan de travail (peu vus en jeu), pas d'auréole de café sur les carreaux (prévue dans les tokens, à dessiner par le moteur) |
| Kit global | **8/10** | Une matière, zéro texture, 1 appel de dessin par pièce, 460 Ko pour 34 pièces | Aucune pièce animée (nuages et rochers : flottement à faire côté moteur) |

## 6. Note d'intégration pour LMAP2 (détail complet : `public/assets/arena-kit/LISEZMOI.md`)
1. Brancher par l'URL : `build: { kind: 'model', url: '/assets/arena-kit/plateau_pierre.glb' }` ; `instantiate()` de `src/scene/maps/loader.ts` gère déjà meshopt. **Grade vide** (`{}`) : le kit est déjà étalonné, la désaturation de `tokens.maps.*.decor` le délaverait.
2. Échelle 1, axe long = X (axe du duel), dessus à y = 0, apparitions à x = ±7. Plateaux : pierre 26 × 21 m, pont 27 × 20 m, cuisine 26 × 21 m.
3. **Collider du plateau** : prisme convexe construit sur `surface.contour` de `kit.json` (à ajouter comme type `convex` dans `ColliderSpec`). Jamais de trimesh du maillage entier (la détection du vide prendrait la roche pour du sol). Plateformes : cuboïde de `collider.conseil`, traversable par le dessous.
4. Par map :
   - Archipel : `plateau_pierre` (ou tuiles hex KayKit + `socle_hex_<k>` à y = −1 si l'effritement est gardé), `plateforme_pierre_M` ×2 + `_S`, couverts `muret_bas` + `rocher_couvert`, fond `ile_lointaine_A/B`, `rocher_S/M/L`, `nuage_A/B` ;
   - Galion : `plateau_pont` + mât Kenney au fond, `radeau_M` ×2 + `_S`, couverts `caisses_pile` ×2 + `tonneau` ;
   - Cuisine : `plateau_cuisine`, `planche_M` ×2 + `_S`, couverts `tasse` + `sucre`.
5. Disposition testée : plateformes M à (±6,4 ; 2,4 ; −2,6), S à (0 ; 2,8 ; −6,6) ; couverts à (−3,6 ; 0 ; 3,4) tourné de 83° et (3,9 ; 0 ; −3,3), jamais sur la ligne de tir.
6. Écran scindé : ombres portées seulement pour plateau, plateformes et couverts ; si la caméra rend transparent le décor qui masque, **cloner la matière de chaque couvert** (les clones d'un même GLB la partagent).

## 7. Contrôles
- `npm run build` : passe (tsc + vite build).
- Aucun fichier de `src/**` modifié ; chemins touchés : `tools/assets/**`, `tools/blender/**`, `public/assets/arena-kit/**`, `public/arena-kit.html`, ce rendu.
- Serveurs lancés : uniquement mes propres Vite de capture (port 5300, PID relevé puis arrêté à chaque capture) ; aucun autre processus touché.
