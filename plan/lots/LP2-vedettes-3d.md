# Lot LP2 · Vraie 3D à partir d'une photo (« vedettes »), sans Tripo
Exécution : **Gemini** (PC d'Adem : Blender 5.0 y est installé) · Évaluation : `animateur-exigeant` + `directeur-artistique` · **Feature essentielle selon Adem**

## Principe (ce qui doit marcher à la fin)
Photo d'une personne → **perso 3D cartoon reconnaissable**, au **squelette KayKit « Rig_Medium »** (mêmes noms d'os), donc **toutes les animations du jeu marchent** : les 13 clips des persos + les 139 du pack `public/assets/packs/animations/`. Préparé à l'avance pour la démo (quelques minutes par perso).

## CONFIDENTIALITÉ (dépôt GitHub PUBLIC)
Photos, planches et GLB de vraies personnes **ne sont jamais commités**. Tout va dans des dossiers ignorés par git :
- `tools/vedettes/input/` (photos) ;
- `tools/vedettes/work/` (fichiers intermédiaires) ;
- `public/assets/vedettes/` (GLB final, servi en local par Vite).

Commite seulement le code et un `.gitignore` à jour.

## Tes chemins
`tools/vedettes/**`, `.gitignore` (ajout des 3 dossiers ci-dessus uniquement), `src/scene/fighter-custom/vedette.ts` (nouveau, voir étape 5).

## Chaîne à livrer : `node tools/vedettes/build.mjs <photo> <nom>`
1. **Planche T-pose** (`turnaround.mjs`) : Nano Banana Pro (`gemini-3-pro-image`, API REST `generateContent`, clé `GEMINI_API_KEY` lue dans `.env` par le script).
   - Même personne, style de `plan/STYLE-PERSO.md` (proportions « jeu » : grosse tête, corps trapu, contour `#2B1D14`, aplats), en **T-pose stricte** (bras tendus à l'horizontale, jambes légèrement écartées).
   - Vue de face ET vue de dos, fond gris clair uni.
   - Découpe les 2 vues en 2 images (crop gauche et droite).
2. **Image → 3D** (`rodin.mjs`) : API **Hyper3D Rodin**, avec la **clé d'essai gratuite `vibecoding`** fournie par l'addon Blender MCP d'Adem.
   - Reprends EXACTEMENT les appels de `C:\Users\Adem\repos\ai-gaming-hack\tools\blender_mcp_addon.py` (lignes ~3340-3650 : `create_rodin_job_main_site`, statut, téléchargement), en Node, sans paquet :
     - `POST https://hyperhuman.deemos.com/api/v2/rodin` (multipart : images face et dos, options) ;
     - interrogation de `https://hyperhuman.deemos.com/api/v2/status` ;
     - `https://hyperhuman.deemos.com/api/v2/download`, puis GLB dans `tools/vedettes/work/<nom>/`.
   - Si l'essai gratuit est saturé : secours sur l'autre mode de l'addon (Hunyuan3D, lis comment l'addon l'appelle), sinon arrêt propre avec message.
3. **Rig sur le squelette KayKit** (`rig.py`, lancé par `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" -b -P tools/vedettes/rig.py -- <rodin.glb> <kaykit.glb> <out.glb>`) :
   - importe `public/assets/characters/knight.glb` (armature Rig_Medium, meshopt ; si l'import meshopt échoue dans Blender, utilise le glTF d'un pack KayKit non compressé ou le mannequin `Mannequin_Medium.glb` du pack d'animations, présent dans le zip d'Adem : demande-le si besoin) ;
   - importe le mesh Rodin ; nettoyage (fusion des sommets proches, normales recalculées), décimation vers **8 000 triangles** maximum, texture conservée ;
   - échelle et alignement : hauteur ≈ celle du perso KayKit, pieds à y = 0, face vers +Z comme KayKit ;
   - **ajustement de l'armature** à la silhouette : échelle uniforme sur la hauteur, puis ajustement de l'envergure des bras (os `upperarm/lowerarm/wrist/hand`) sur la largeur du mesh en T-pose ; les **noms d'os ne changent pas** ;
   - parent avec poids automatiques ; les meshes KayKit d'origine sont supprimés, on ne garde qu'armature + nouveau mesh ;
   - export GLB (armature + mesh skinné + texture), **sans animations** (le jeu applique les clips KayKit), moins de 4 Mo.
4. **Contrôle automatique** (`check.mjs`, Playwright + page `tools/vedettes/preview.html` servie par Vite) :
   - charge le GLB, lui applique `idle`, `run`, `throw`, `hit`, `death` (clips de `public/assets/characters/knight.glb`) ;
   - produit une **planche** (8 images par clip, vues de face et de trois-quarts) dans `captures/vedettes/<nom>-planche.png` ;
   - mesure : aucun os sans poids, aucun sommet non assigné, déformation maximale raisonnable, pas de T-pose pendant les clips.
5. **Branchement jeu** (`src/scene/fighter-custom/vedette.ts`) : `loadVedette(nom)` renvoie le perso prêt, compatible avec le contrôleur d'animations du lot LA (mêmes noms d'os). Un `FighterDef` avec `glbUrl: '/assets/vedettes/<nom>.glb'` doit apparaître en jeu à la place d'un KayKit.
6. **Premier essai** : la photo de Titouan. Sa planche trapue (A-pose) validée par Adem est dans `C:\Users\Adem\AppData\Local\Temp\claude\C--Users-Adem-Documents-Hackathon-Voodoo\637070cc-f9cc-4418-8504-22f0f58d4de0\scratchpad\titouan-kaykit.jpg`, et sa photo d'origine dans `C:\Users\Adem\AppData\Local\Temp\claude\C--Users-Adem-Documents-Hackathon-Voodoo-Voodoo-Hack\637070cc-f9cc-4418-8504-22f0f58d4de0\images\2.jpg`. Copie-les dans `tools/vedettes/input/` (ignoré par git) et régénère en T-pose. La photo d'Adem viendra plus tard.

## Journal
Appelle `log()` de `tools/dashboard/log.mjs` à chaque étape (`source: 'gemini'` pour Nano Banana, `source: 'rodin'` pour la 3D, `source: 'blender'` pour le rig ; `kind: 'generation'` ; titre en français). Adem suit sur le tableau de bord.

## Contrôles
- `node tools/vedettes/build.mjs … titouan` va au bout.
- La planche montre un perso reconnaissable qui s'anime sans déchirure.
- `npm run build` passe.
- `git status` ne montre **aucune** photo ni aucun GLB de personne.
