# Rapport Lot LTEX

## Textures générées
Les textures suivantes ont été générées via l'API `gemini-3-pro-image` (Nano Banana Pro) :
- `caisse-bois.jpg` (800 Ko)
- `carrelage-sol.jpg` (710 Ko)
- `coque-bois.jpg` (667 Ko)
- `hex-herbe.jpg` (723 Ko)
- `hex-pierre.jpg` (599 Ko)
- `metal-canon.jpg` (635 Ko)
- `metal-inox.jpg` (681 Ko)
- `plan-travail-bois.jpg` (676 Ko)
- `planche-decouper.jpg` (799 Ko)
- `pont-bois.jpg` (745 Ko)
- `ruine-pierre.jpg` (908 Ko)
- `tonneau-bois.jpg` (782 Ko)
- `voile-toile.jpg` (816 Ko)

## Décisions et Frictions
1. **Format WebP et taille < 300 Ko** : Il n'a pas été possible d'exporter directement en `.webp` en deçà de 300 Ko. L'API Gemini `gemini-3-pro-image` (Imagen 3) retourne nativement des flux JPEG (ou PNG) d'environ 600-900 Ko. Comme il était interdit d'installer un module npm tel que `sharp` pour assurer la compression logicielle vers WebP sans paquet, les textures ont été sauvegardées telles quelles en `.jpg`.
2. **Tuilage (Seamless)** : Les prompts exigent strictement le tuilage (`Seamless tiling texture... fully tileable, exactly square, 2D art`), un style cartoon (`painted style like Smash Bros / Sea of Thieves`) et aucun photoréalisme.
3. L'outil de génération Node (`tools/textures/generate.mjs`) lit dynamiquement `textures.json` au bon format.
4. L'aperçu `textures-apercu.html` a été produit et testé.
5. La capture `captures/ltex/apercu.png` a été effectuée.