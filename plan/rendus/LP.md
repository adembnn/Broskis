# Rendu du Lot LP (Perso depuis une photo)

## Fait
- **`api/scan-fighter.ts`** : Implémenté pour traiter une photo (redimensionnée). Le script exécute en parallèle un appel à Gemini Flash (pour l'extraction des traits, couleurs, accessoires et statistiques) et un appel à Gemini Image (pour la génération du visage cartonné sur fond magenta). Le tout est retourné au format JSON incluant `faceUrl`.
- **`src/ia/fighter/index.ts`** : Création de la fonction `scanFighter(image)`. Elle contacte l'API, map la réponse JSON vers un `FighterDef` et choisit le meilleur corps KayKit de base (`knight`, `barbarian`, `rogue_hooded`, `mage`) en se basant sur les statistiques et les traits. Un personnage prédéfini est utilisé en secours.
- **`src/scene/fighter-custom/index.ts`** : Implémentation de `applyFighterLook(root, look)`. 
  - La recoloration se fait via l'injection du patch shader `onBeforeCompileToon` (repris de la logique `kaykit.js`) sur les matériaux du corps (teintes extraites depuis la tenue et les cheveux).
  - Le visage est converti en sticker 3D par le module LS (`makeSticker`) et rattaché dynamiquement à l'os de la tête (`head`) sous forme de masque.

## Décisions prises seul
- **Sélection du corps** : `loader.ts` par défaut transformait "custom" en "knight". Pour respecter le besoin d'avoir le corps "le plus proche", j'ai déplacé le choix vers `scanFighter` (côté pipeline IA). L'IA attribue le modèle selon le build (fort = barbarian, rapide = rogue, etc.).
- **Recoloration** : J'ai recréé la fonction `applyLook` avec injection de uniforms dans le `MeshToonMaterial` afin de teindre les vêtements sans écraser les textures originales des modèles.

## Frictions
- La gestion parallèle du JSON et de l'image Nano Banana était asynchrone dans des fichiers différents pour les armes. Pour les personnages, les deux ont été combinés et attendus avec `Promise.all` au sein de `api/scan-fighter.ts` afin d'alléger la logique front-end.
- Les compilations m'ont initialement posé un problème de types sur `Shader` (TypeScript n'exportait pas ce namespace dans threejs), ce qui a été résolu en utilisant le type générique approprié ou any temporairement pour le patch.

## Validation
- `npm run build` : Ok.
- Les tests de capture (`tools/capture.mjs`) ont produit les trois images de validation.