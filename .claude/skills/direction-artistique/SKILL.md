---
name: direction-artistique
description: Choisir et figer la direction artistique du jeu (palette, lumière, matières, typo, caméra) avant tout écran, puis la faire respecter via src/art/tokens.js. À utiliser au démarrage et avant toute nouvelle scène ou interface.
---

# Direction artistique

Direction artistique = l'ensemble des choix visuels qui donnent au jeu une identité unique. On la fige tôt pour que tout soit cohérent.

## Méthode (dans l'ordre, sans sauter d'étape)
1. **Contraintes** : projecteur de salle (gros contrastes, texte ≥ 28 px), 60 images/s sur portable moyen, 8 h.
2. **Voler** : 5 références RÉELLES, chacune avec ce qu'on lui prend. Réservoir de jeux à l'identité forte : Inscryption, Hades, Cult of the Lamb, Kentucky Route Zero, Journey, Sayonara Wild Hearts, Tunic, Return of the Obra Dinn, Monument Valley, Townscaper, Mini Motorways. Chercher aussi sur Pinterest, ArtStation, styles.refero.design.
3. **3 directions radicalement différentes** (pas des variations), une page HTML + une capture chacune. Familles à explorer pour sortir du premier réflexe :
   - **Une seule lumière** : tout dans l'ombre sauf une source ; la couleur est réservée à ce qui compte pour jouer.
   - **Matière réelle** : papier, argile, feutre, maquette (profondeur de champ forte = flou de ce qui est loin, effet miniature).
   - **Graphisme radical** : aplats, 2 ou 3 couleurs, contours épais, typographie comme élément de décor.
   - **Contrainte technique assumée** : rendu 1-bit, basse résolution, palette de 4 couleurs.
4. **Le jury simulé et Adem choisissent.** Une seule direction.
5. **Figer** dans `src/art/tokens.js` :
   - palette de 5 max, chacune avec un rôle (fond, matière, lumière, action joueur, danger) ;
   - réglages lumière : exposition, tone mapping (conversion de la lumière calculée en couleurs affichables), intensité de l'environment map ;
   - 2 polices max, avec du caractère (Google Fonts) ;
   - durées d'animation (ex. `snap: 120`, `glisse: 280`, `dramatique: 900` en ms).
6. **Règle d'or** : une seule audace, poussée à fond (« spend your boldness in one place »). Tout le reste sert cette audace.

## Contrôle
- `node tools/capture.mjs` puis regarder les images. Mettre la capture en noir et blanc : si on ne lit plus rien, les valeurs (clair/foncé) sont ratées.
- Plisser les yeux devant la capture : on doit voir 3 masses (sujet, décor, fond), pas une bouillie.
