# Lot LS · Sticker 3D (image → découpe carton en 3D)
Responsable : **Titouan** · Coût : faible · Dépend de : rien (**peut démarrer tout de suite**)

## Contexte
Quand on scanne un objet, Nano Banana le redessine en arme cartoon sur un fond uni **magenta `#FF00FF`**. Ce lot transforme cette image en objet 3D épais, comme un sticker découpé dans du carton, à tenir en main ou à poser en mur (bouclier).

## Tes chemins
`src/scene/sticker/**` (rien d'autre)

## Sortie attendue
- `src/scene/sticker/index.ts` exporte :
  - `makeSticker(src: string | HTMLImageElement, opts?: { depth?: number; border?: number; height?: number }) → Promise<THREE.Group>` ;
  - `chromaKey(img) → HTMLCanvasElement` : retire le magenta, avec une tolérance et une correction du liseré de couleur (despill) ;
  - `makeFallbackSticker(category, palette) → THREE.Group` : forme simple par catégorie si l'image échoue.
- **Étapes de `makeSticker`** :
  1. détourage ;
  2. masque alpha ;
  3. contour en *marching squares* ;
  4. simplification (Ramer-Douglas-Peucker) ;
  5. `THREE.Shape` puis `ExtrudeGeometry` (épaisseur ≈ 0,06, petit biseau) ;
  6. face avant texturée (UV calées sur la boîte du contour) ;
  7. tranche couleur carton ;
  8. bord blanc de 2 à 3 % autour, comme un vrai sticker.
- **Matériau toon** : reprendre `createToonMaterial` et `addOutline` de `C:\Users\Adem\repos\bagarre-de-taverne\toon-kit.js`.
- **Page de test** : `src/scene/sticker/preview.html`, ouverte avec `npm run dev` à `http://localhost:5173/src/scene/sticker/preview.html`.
  - Elle charge 3 images de test (dessine-les toi-même sur fond `#FF00FF`, ou demande-les à Adem) ;
  - elle les fait tourner en 3D.
- **Performance** : moins de 50 ms par sticker, au plus environ 400 sommets par contour.

## Contrôles
`npm run build` passe. La page de test montre 3 stickers propres, sans liseré magenta.

## Commit
`git add src/scene/sticker/...` puis `git commit -m "Sticker 3D : ..." -- <tes fichiers>`, `git pull --no-rebase`, `git push`. Mets `plan/SUIVI.md` à jour.

## Rendu (4 points)
Fait (chemins, hash) · Pas fait et pourquoi · Décisions prises seul · Frictions.
