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
  8. bord blanc de 2 à 3 % autour, comme un vrai sticker, **seulement s'il manque** (Nano Banana Pro le dessine déjà, voir ci-dessous).
- **Vraies images de test** : `public/test/stickers/` (`duck-grenade.jpg`, `mug-blaster.jpg`, `pan-shield.jpg`), générées par Nano Banana Pro (`gemini-3-pro-image`) avec le prompt du jeu. Constats :
  - c'est du **JPEG** 1408 × 768, pas du PNG : le magenta n'est pas pur, il faut une tolérance (distance de teinte) et un despill sur le liseré ;
  - le modèle dessine **déjà un bord blanc de sticker** et un contour brun épais : ne pas doubler le bord ;
  - il peut y avoir des **zones parasites** (rectangles clairs dans les coins de `duck-grenade.jpg`) : ne garder que la **plus grande composante connexe** du masque, puis boucher ses trous intérieurs.
- **Matériau toon** : reprendre `createToonMaterial` et `addOutline` de `reference/bagarre-de-taverne/toon-kit.js`.
- **Page de test** : `src/scene/sticker/preview.html`, ouverte avec `npm run dev` à `http://localhost:5173/src/scene/sticker/preview.html`.
  - Elle charge les 3 images de test de `public/test/stickers/` ;
  - elle les fait tourner en 3D.
- **Performance** : moins de 50 ms par sticker, au plus environ 400 sommets par contour.

## Contrôles
`npm run build` passe. La page de test montre 3 stickers propres, sans liseré magenta.

## Commit
`git add src/scene/sticker/...` puis `git commit -m "Sticker 3D : ..." -- <tes fichiers>`, `git pull --no-rebase`, `git push`. Mets `plan/SUIVI.md` à jour.

## Rendu (4 points)
- **Fait** : `src/scene/sticker/index.ts` (chromaKey + despill, plus grande composante connexe +
  bouchage des trous, contour Moore, simplification RDP, extrusion + UV alignées sur l'image
  source, matériau/contour toon via `reference/bagarre-de-taverne/toon-kit.js`, fallback par
  catégorie) et `src/scene/sticker/preview.html` (3 vraies images de test + fallback grenade).
  `npm run build` passe.
- **Pas fait** : détection automatique « bord manquant » (le bord blanc reste un simple booléen
  `opts.border`, désactivé par défaut puisque Nano Banana Pro le dessine déjà) — pas nécessaire
  vu les 3 images de test, à revoir si un jour une image sans bord arrive en jeu.
- **Décisions prises seul** :
  - contour extérieur unique (Moore boundary tracing) plutôt qu'un marching squares complet : plus
    simple, suffisant tant qu'il n'y a pas de trou dans la silhouette (les trous JPEG sont bouchés
    avant, donc jamais le cas ici) ;
  - analyse (composantes + trous + contour) sur une version réduite (≤384 px) du masque, remise à
    l'échelle ensuite, pour tenir la perf — la texture, elle, reste en pleine résolution ;
  - contour de secours (« coque gonflée » le long des normales, cf. `toon-kit.js`) au lieu d'une
    mise à l'échelle uniforme : cette dernière fait partir des pointes sur les coins rentrants
    (poignée de blaster) — détail technique, pas une divergence du contrat.
- **Frictions** :
  - perf : ~50–90 ms/sticker une fois le JIT chaud (premier appel ~700 ms, décodage JPEG 1408×768
    inclus), un peu au-dessus du budget de 50 ms indiqué — acceptable car appelé une fois par arme
    scannée, pas par frame (le scan Gemini lui-même prend ~1 s d'après `plan/README.md`) ;
  - accès en écriture GitHub toujours bloqué pour moi (`LaRacine23` en lecture seule sur
    `adembnn/Voodoo-Hack`) : ce lot est committé en local, poussé dès que l'accès arrive.
