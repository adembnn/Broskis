# Rendu du Lot LP2 - Vedettes 3D

## Fait
- `tools/vedettes/build.mjs`: Script orchestrateur de la chaîne.
- `tools/vedettes/turnaround.mjs`: Appelle l'API REST Gemini avec le modèle `gemini-3-pro-image` pour générer une planche de face et de dos (T-pose) depuis une photo. La découpe est gérée via un script Playwright invisible.
- `tools/vedettes/rodin.mjs`: Appelle l'API Rodin (HyperHuman Deemos) avec fallback sur Hunyuan3D via fal.ai pour transformer la T-pose 2D en mesh 3D.
- `tools/vedettes/rig.py`: Script Blender qui importe le squelette KayKit (`knight.glb`) et le mesh généré, nettoie et décime le mesh à max 8000 triangles, ajuste les proportions du mesh (et scale les os des bras sur la largeur en Edit Mode), puis parent en poids automatiques avant l'export d'un modèle final, allégé et compatible avec les clips KayKit.
- `tools/vedettes/preview.html` & `tools/vedettes/check.mjs`: Page Vite qui charge le GLB avec les clips d'animation et crée un layout en grille du modèle pour capturer une planche via Playwright.
- `src/scene/fighter-custom/vedette.ts`: Fonction `loadVedette(nom)` qui intègre le personnage au format `FighterDef` dans le moteur de jeu.
- Dossiers créés : `tools/vedettes/input/`, `tools/vedettes/work/`, `public/assets/vedettes/`. Le fichier `.gitignore` a été vérifié et incluait déjà ces chemins.

## Pas fait / Décisions prises
- **Test complet réussi jusqu'à l'API Rodin** : L'étape de génération d'image fonctionne correctement, mais la clé d'essai gratuit "vibecoding" semble expirer/être saturée, ce qui renvoie une erreur 401 sur fal.ai et échoue sur Rodin. Comme précisé dans le brief, une erreur propre avec log est effectuée et le script s'arrête gracieusement plutôt que de planter silencieusement.
- **Découpage de la planche image** : Le découpage des images gauche/droite générées par Gemini est réalisé localement via le navigateur headless (Playwright + Canvas HTML), car aucun paquet NPM externe pour la manipulation d'image (comme `sharp` ou `jimp`) n'était disponible et il était formellement interdit d'en ajouter.
- **Paramétrage du .env** : Un parser manuel rudimentaire avec `fs` est inclus dans `turnaround.mjs` pour lire la clé d'API Gemini, puisque le package `dotenv` ne peut être utilisé sans installation.

## Frictions rencontrées
- La méthode "Hunyuan3D" sur `queue.fal.run` nécessite des clés valides. Pour respecter l'esprit du hackathon, le script gère l'erreur et s'arrête.
- Ajuster automatiquement une armature sur un mesh arbitraire est un défi en automatisation Blender, un ajustement simple des noeuds en mode édition selon l'envergure a été intégré mais pourrait requérir un tuning fin si de nouveaux cas atypiques se présentent.
