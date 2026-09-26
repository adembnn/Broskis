# Lot LP2b · Débloquer l'étape « image → 3D » avec les démos gratuites Hugging Face, puis aller au bout
Exécution : **Gemini** · **Feature essentielle selon Adem** · Dépend de : LP2 (fusionné)

## Constat
La chaîne `tools/vedettes/` (LP2) marche jusqu'à la planche T-pose (Nano Banana Pro). **L'étape 3D est bloquée** : la clé d'essai Rodin `vibecoding` renvoie 401, et fal.ai demande une clé payante.

Démos **gratuites** vérifiées « RUNNING » à 13h55 (ZeroGPU A10G) :
- **`tencent/Hunyuan3D-2.1`** : en priorité, mesh + texture, bon sur les persos ;
- **`tencent/Hunyuan3D-2`** : secours ;
- **`trellis-community/TRELLIS`** : 2e secours, GLB texturé.

## Tes chemins
`tools/vedettes/**` (ajoute `hf3d.mjs`, branche-le dans `build.mjs` avant Rodin), `src/scene/fighter-custom/vedette.ts` si besoin. **Confidentialité** : photos, planches et GLB de personnes restent dans `tools/vedettes/input|work/` et `public/assets/vedettes/`, ignorés par git. Ne commite jamais une image ou un modèle de personne.

## À livrer
1. **`tools/vedettes/hf3d.mjs`** : Node, sans paquet ; appel HTTP de l'API Gradio d'un Space.
   - `GET https://<owner>-<space>.hf.space/gradio_api/info` (ou `/config`) pour trouver le bon point d'entrée (génération de forme + texture depuis une image) et ses paramètres ;
   - upload : `POST /gradio_api/upload` (multipart), qui renvoie le chemin serveur du fichier ;
   - appel : `POST /gradio_api/call/<api_name>` avec `{ data: [...] }`, qui renvoie un `event_id` ; puis lecture du flux SSE `GET /gradio_api/call/<api_name>/<event_id>` jusqu'à `complete` ;
   - téléchargement du GLB (URL `.../gradio_api/file=...`) dans `tools/vedettes/work/<nom>/hf.glb` ;
   - essai dans l'ordre : Hunyuan3D-2.1, puis Hunyuan3D-2, puis TRELLIS. Si `HF_TOKEN` existe dans `.env` (lu par le script), l'envoyer en `Authorization: Bearer` pour plus de quota GPU ; sinon en anonyme.
   - Image d'entrée : la **vue de face** de la planche T-pose (`front.png`), sur fond uni. Si le Space accepte plusieurs vues, ajoute la vue de dos.
2. **Aller au bout sur Titouan**, avec les fichiers déjà dans `tools/vedettes/input/` et `work/` de ta copie (et dans le dépôt principal d'Adem si besoin : `C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\.claude\worktrees\gem-LP2\tools\vedettes\work\`) :
   - GLB 3D ;
   - `rig.py` (Blender : `"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" -b -P …`), qui produit le GLB skinné sur le squelette KayKit ;
   - `check.mjs`, qui produit la **planche d'animation** `captures/vedettes/titouan-planche.png` (idle, run, throw, hit, death).
   - Corrige `rig.py` jusqu'à ce que le perso s'anime sans déchirure visible : poids automatiques, alignement, échelle, bras en T-pose.
3. **Copie les résultats dans le dépôt principal d'Adem**, dans des dossiers ignorés par git, pour qu'il les voie :
   - `C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\public\assets\vedettes\titouan.glb` ;
   - `C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\captures\vedettes\titouan-planche.png`.
4. **Journal** : `log()` de `tools/dashboard/log.mjs` à chaque étape (`source: 'huggingface'` pour la 3D, `source: 'blender'` pour le rig).

## Si tout échoue (quota GPU)
Arrête-toi proprement et écris dans ton rendu ce qu'il faut exactement pour débloquer : un jeton Hugging Face gratuit (`HF_TOKEN`), ou une clé fal.ai ou Rodin, avec la page d'inscription.

## Contrôles
`npm run build` ; la planche d'animation existe et montre un perso reconnaissable, animé, sans déchirure.
