# Lot DA · Direction artistique + tokens
Responsable : Adem (agent `directeur-artistique`, Opus) · Coût : moyen · Dépend de : références de LD si elles existent

## Contexte
Style cartoon de Bagarre de Taverne (`C:\Users\Adem\repos\bagarre-de-taverne\design-system-cartoon.md`) :
- toon en 3 paliers, encre `#2B1D14` à la place du noir ;
- panneaux d'interface à plat, contour de 3 px, ombre dure ;
- Lilita One + Nunito.

Broskis y ajoute un **animateur de ring** et **3 maps** (Archipel, Galion, Cuisine géante). Le décor est désaturé, les combattants saturés ; joueur 1 chaud, joueur 2 froid.

## Tes chemins
`src/art/**`, `art/references/**`. L'agent n'écrit pas : c'est la session principale qui remplit `tokens.js` d'après sa décision.

## Sortie attendue
1. Une direction figée qui reprend les bases de Bagarre, avec **une audace poussée à fond** (skill `direction-artistique`).
2. Pour chaque map : palette (5 couleurs avec leur rôle), lumière (hémisphère teintée + une lumière principale dure), ciel ou fond, brouillard.
3. `src/art/tokens.js` :
   - palette commune ;
   - couleurs joueur 1 et joueur 2 ;
   - rendu : tone mapping AgX, bloom au seuil de 0,85 ;
   - polices auto-hébergées avec `@fontsource` ;
   - durées ;
   - juice (table du skill `game-feel`, plus `action` et `victoire`) ;
   - une section `maps.archipel`, `maps.galion`, `maps.cuisine`.
4. La règle d'interface : bandeau de tour, barres de PV en segments avec barre fantôme, cartes d'armes façon carte à collectionner, sous-titres de l'animateur.

## Contrôles
Test anti-slop en 3 questions. Capture en noir et blanc : on doit lire 3 masses.
