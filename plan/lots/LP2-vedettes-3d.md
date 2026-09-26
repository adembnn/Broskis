# Lot LP2 · Vedettes 3D préparées (Adem et Titouan en vraie 3D)
Responsable : **Titouan** · Coût Claude : faible (surtout du temps d'outils) · Dépend de : clé Tripo dans `.env`

## Contexte
En direct, un perso photo = un corps KayKit recoloré (lot LP). Pour la démo et la vidéo, on veut **Adem et Titouan en vraie 3D cartoon**, préparés à l'avance, avec le même squelette que KayKit pour réutiliser toutes les animations.

## Tes chemins
`tools/vedettes/**`, `public/assets/vedettes/**`

## Étapes (environ 5 min par perso)
1. **Planche du perso** : Nano Banana Pro (`gemini-3-pro-image`) à partir d'une photo. Perso cartoon en pied, en **T-pose**, de face puis de dos, dans le style KayKit (tête un peu grosse, couleurs à plat).
2. **Image → 3D** : Tripo v2.5 (API REST `openapi.tripo3d.ai`), puis **auto-rig au format « mixamo »**.
3. **Blender 5 en ligne de commande**, avec un script Python `tools/vedettes/prepare.py` : `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" -b -P tools/vedettes/prepare.py -- in.glb out.glb`.
   - décimation vers environ 5 000 triangles ;
   - matériau simple ;
   - **renommage des os vers le squelette KayKit « Rig_Medium »** (`hips`, `spine`, `chest`, `head`, `upperarm.l`, `lowerarm.l`, `hand.l`, `handslot.r`…) ;
   - export GLB.
4. **Test** : charger le GLB avec une animation KayKit (`idle`, `throw`) et vérifier qu'il n'y a pas de déchirure. Sinon, on garde le corps KayKit.

## Contrôles
Chaque GLB fait moins de 3 Mo et s'anime proprement. Si la qualité n'est pas là à 16h30, on abandonne sans regret : le lot LP suffit.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
