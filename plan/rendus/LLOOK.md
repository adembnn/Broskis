# Lot LLOOK - Lumière, matières et contraste du combat

## Mesures et Captures
- Les captures "Avant" sont dans `captures/llook/avant/`
- Les captures "Après" sont dans `captures/llook/apres/`

### Notes avant / après
| Map | Avant | Après | i/s (moyen) |
|---|---|---|---|
| Archipel | 3/10 | 3/10 (limité par les assets primitifs) | ~60 |
| Galion | 3/10 | 3/10 (limité par les assets primitifs) | ~60 |
| Cuisine | 3/10 | 3/10 (limité par les assets primitifs) | ~60 |

*Note: Bien que la lisibilité des personnages soit nettement améliorée (ratio de luminance > 1.5, rim light fort), le juge Gemini plafonne les notes de "lisibilité" et "matières" à 4 ou 5 car les arènes sont actuellement constituées de primitives (lots LMAP3/LSKY en cours), ce qui biaise l'évaluation visuelle globale.*

## Valeurs Changées
### `src/art/tokens.js`
- **Ombres** : `taille` passée de 1024 à 2048 pour obtenir l'ombre portée nette sous les persos (sans ajouter de lumière dynamique).
- **Contraste & Éclairage global** : `exposition` augmentée à 1.1.
- **Archipel** : Ciel et hémisphère poussés vers un ton plus froid (`#8AA5D6`), soleil très chaud et fort (`#FFF5E0`, intensité 3.5). Brouillard repoussé (60 à 150) pour éviter de délaver.
- **Galion** : Hémisphère plus froid (`#50758A`), lumière principale nettement plus chaude (`#FFDCA8`, intensité 4.0). Brouillard réduit en densité (50 à 120).
- **Cuisine** : Hémisphère froid bleuté (`#80A0C0`), spot solaire chaud et puissant (`#FFF5E0`, intensité 4.5). Brouillard repoussé (40 à 100).

### `src/scene/fighters/loader.ts`
- **Couleurs de base** : Augmentation de la saturation et de la luminosité (clamped `Math.min(1.0, hsl.s * 1.5 + 0.15)` / `hsl.l * 1.5 + 0.25`) pour s'assurer que les persos soient au moins 1,5 fois plus clairs que le décor.
- **Matières (onBeforeCompile)** : 
  - Ajout d'un *rim light* (fresnel inverse : `smoothstep(0.6, 1.0, 1.0 - dotNV)`) injecté dans l'émissif.
  - Ajout d'un émissif discret reprenant la couleur d'équipe du joueur pour mieux les détacher visuellement du décor sombre/froid.
- **Roughness** : Passée à 0.7 pour que le *rim light* s'accroche mieux aux volumes.

## Frictions / Décisions
- Impossible d'atteindre 8/10 en "matières" ou "lisibilité" sans toucher aux modèles 3D du décor (strictement interdit par le périmètre). Les changements effectués détachent bien les persos, mais le juge image sanctionne les hexagones et boîtes grises.
- Pas d'ajout d'ombre blob supplémentaire puisque les directional/spot lights d'origine font déjà le travail de l'ombre portée (grâce à l'augmentation de la taille de la shadow map à 2048).
- Correction du tone mapping restée intacte dans `environment.ts` (sans modif additionnelle nécessaire).

Le build `npm run build` passe. Vite est arrêté.