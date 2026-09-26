# DA — objets scannés : le « vinyle gonflé »

Revue du banc de scan n° 2 (26/09, 16h37, 10 photos d'Adem, moyenne 6,85/10, 5 injouables).
Direction figée : « Vinyle » (`src/art/tokens.js` : encre + vinyle = « en jeu »). Ce document ne la change pas, il l'applique aux armes.

**Constat en une phrase : de face, les stickers sont déjà bons (reconnaissables, propres, 0 % de rose). Tout ce qui est
« bizarre » naît au passage en 3D (épaisseur, transparence, tranche) et à la taille, plus 4 conventions de couleur
absentes de la consigne.**

---

## 1. Ce qui est bizarre, et pourquoi

### Les 5 causes communes (elles expliquent 90 % des défauts)

| Défaut vu | Cause dans le code | Effet |
|---|---|---|
| **Doublement** : deux tasses, deux chaises, deux montres en vue de 3/4 et même à côté du perso (img03, img11, img57) | `weapons/visual.ts` l. 70-76 : épaisseur = profondeur réelle, multipliée de ×0,5 à ×8 ; face texturée `transparent: true` + `DoubleSide` (`sticker/index.ts` l. 452-453) | on voit la face arrière à travers une tranche à moitié transparente : un fantôme de l'objet décalé derrière lui |
| **Tranche noire striée** (profils img04, img10, img22, img28…) | la tranche recevait la texture (groupe de matériau 0) avec des UV projetées : le trait brun du contour, étiré sur toute la profondeur | un bloc brun « baveux ». Corrigé dans le worktree du banc (couleur unie), à garder |
| **Brique** : l'objet devient un prisme (épaisseur mesurée 20 à 66 % de sa plus grande dimension) | extruder (étirer en profondeur) une silhouette sur la profondeur réelle : l'anse d'une tasse devient aussi épaisse que son corps | l'objet 3D ne ressemble plus à l'objet réel ; de profil, c'est un pavé |
| **Trous bouchés** (tabouret, pendule) | `keepLargestComponentAndFillHoles` bouche tout espace fermé (l'entretoise en X ferme l'espace entre les pieds) | « un bloc avec un tabouret dessus » (juge). En cours de correction dans le worktree (trous gardés au-delà de 0,4 % de l'aire) |
| **Échelle** : 0,35 m minimum pour tout ce qui est petit | `WEAPON_FX.physique.tailleMin: 0.35` | 22 px à l'écran au départ du tir en demi-vue 1080p ; le roi d'échecs (9 cm) a la même taille que le mocassin (30 cm) : l'échelle relative, donc la vraisemblance, disparaît |

### Objet par objet

| Objet | Bizarre | Correction (section) |
|---|---|---|
| Tasse en verre | 2 tasses en 3/4 ; de profil un pavé brun plus large que la tasse ; en vol une tache grise de 25 px (img06) | 3D cible (§2), taille 0,74 m (§4) |
| Chaise de bureau | 2 chaises côte à côte à côté du perso (img11) ; l'étoile à roulettes devient une plaque | §2 ; trous gardés, marge vinyle qui ne comble que les interstices étroits |
| Feutre Velleda | l'étiquette est devenue un panneau de science-fiction (hublot orange, grille noire) : **détail inventé** | consigne (§3) : étiquette = un seul aplat, rien d'inventé |
| Téléphone | dessiné en 3/4 puis extrudé = parallélogramme épais ; écran noir plein = trou dans l'image ; en vol, un bâtonnet noir de 20 px (img24) | vue de face stricte ; écran ardoise + reflet diagonal (§3) ; marge vinyle (§2) |
| Mocassin | **halo violet** autour de la chaussure, pas de marge blanche (img26) ; noir sur sol sombre, illisible en vol | noir = anthracite + reflet gris, jamais violet (§3) ; marge vinyle faite par le code (§2) |
| Tabouret rotin | 2 tabourets en 3/4 ; bloc brun entre les pieds ; bois naturel devenu **jaune d'or saturé** | trous gardés ; teinte réelle, couleurs à peine avivées (§3) |
| Pendule de Newton | **cadre chromé devenu bleu marine, socle noir devenu bleu** ; fils de 1 px perdus ; cadre arrière visible = effet « boîte » | chrome = gris clair + bande blanche ; parties fines ≥ 1/25 de la hauteur ; vue de face stricte (§3) |
| Lampe champignon | fidèle en 2D (bon jaune laqué) mais 0,35 m = invisible en vol (img48) ; pavé de profil | §2 et §4 (0,90 m) |
| Roi d'échecs | fidèle, mais même taille que le mocassin et invisible en vol (img54) ; bords baveux | §4 (0,68 m, loi logarithmique) |
| Montre | 2 montres en 3/4 ; bracelet dessiné en anneau vu de 3/4 | vue de face : cadran face à nous, bracelet ouvert haut/bas (§3) |

---

## 2. Traitement 3D cible : « vinyle gonflé »

L'objet est un **autocollant en vinyle bombé** (comme les *puffy stickers*) : l'art de Nano Banana sur les deux faces,
bombé au centre, une marge vinyle blanche qui fait le tour et une tranche vinyle, un trait d'encre autour. C'est
cohérent avec les persos (même règle « encre + vinyle = en jeu ») et avec les icônes du HUD (le même sticker, en volume).

Coupe, de l'extérieur vers l'intérieur : **encre 3D → marge vinyle (code) → trait brun dessiné → art bombé.**

Toutes les valeurs sont en fraction de la plus grande dimension de l'objet (hauteur 1 dans `makeSticker`).

| Paramètre | Actuel | **Cible** |
|---|---|---|
| Épaisseur pilotée par la physique (`n.scale.z *= depth`) | ×0,5 à ×8 | **supprimée** (facteur 1 pour tous) : la physique décide du poids, du rebond et de la taille, jamais de l'épaisseur |
| Tranche plate (bande verticale entre les deux faces) | 0,06 + biseaux 0,024 | **0,05** |
| Bombé par face (hauteur du « coussin » au centre) | 0 | **0,05** forme `flat` · **0,08** `long` · **0,10** `round`, `box`, `irregular` |
| Distance au bord où le bombé atteint son maximum | 0,12 (gonflage.ts) | 0,12, **plafonnée localement** (ligne suivante) |
| Plafond local (anti-ailerons) | aucun | bombé ≤ **0,9 × demi-largeur locale** ; demi-largeur locale = maximum de la carte de distance dans un rayon de 0,06 (filtre max d'environ 5 cases sur la grille de 72). Sans ça, une anse de 4 % de large devient un aileron de 18 % d'épaisseur |
| Épaisseur totale au cœur | 20-66 % (prisme) | **15 %** plat · **21 %** long · **25 %** volume |
| Marge vinyle (bord blanc) | dessinée par Nano Banana, 0 à 4 %, absente sur le mocassin | **3,5 %**, ajoutée par le code : dilatation du masque alpha remplie de `VINYLE`, puis l'art par-dessus. Si l'image a déjà sa marge blanche (au moins 60 % des pixels à 2-4 px à l'intérieur du contour ont une luminance > 0,9 et une saturation < 0,12), ne rien ajouter |
| Couleur de la tranche | carton, puis couleur dominante assombrie (worktree) | **`VINYLE` #F0E9DC** (luminance linéaire 0,82, sous le seuil de bloom 0,85). Changer `rendu.sticker.tranche: CARTON` en `VINYLE` : un objet gonflé est en vinyle, pas en kraft |
| Dos | art en miroir | art en miroir (indispensable : la vue du lanceur voit le dos de l'objet qui s'éloigne) ; voir l'idée finale |
| Matériau des faces | toon 3 paliers, transparent, `DoubleSide` | **`MeshStandardMaterial`** comme les persos (`fighters/loader.ts`), `metalness: 0`, **opaque** (`transparent: false`, `alphaTest: 0.5` = pixel gardé ou jeté, jamais à moitié, `side: FrontSide`) : fini le doublement |
| Rugosité (0 = miroir, 1 = mat) selon la matière donnée par Gemini | 0,9 partout (tranche) | verre **0,18** · céramique **0,30** · métal **0,32** · plastique **0,45** · caoutchouc **0,60** · nourriture **0,65** · bois **0,70** · pierre **0,85** · papier **0,90** · tissu **0,92**. La tasse en verre accroche un reflet sur son bombé, le roi en bois non : de la fidélité gratuite |
| Tranche et marge | — | `VINYLE`, rugosité **0,5**, `metalness: 0` |
| Trait d'encre (coque inversée : copie un peu gonflée de l'objet, dessinée en encre derrière lui) | 0,012 × taille de l'objet (≈ 0,9 cm pour la tasse) | **0,03 unité monde fixe** (token `contour.epaisseur.sticker`), non multipliée par la taille : ≈ 1,9 px à 17 m, 3,5 px à 9 m en demi-vue 1080p. Couleur `ENCRE` #2B1D14 |
| Ombre | tache d'encre au sol (existe) | l'objet ne projette **aucune** ombre réelle ; tache `ENCRE`, diamètre **0,9 × largeur de l'objet**, opacité **0,35** au sol, **0,15** à 4 m de haut |
| Trous | bouchés | gardés si > 0,4 % de l'aire (worktree) ; la marge de 3,5 % comble d'elle-même les interstices de moins de 7 % (fils du pendule, rayons de l'étoile), comme un vrai autocollant découpé |

Test noir et blanc : quel que soit l'objet, l'anneau encre (L* ≈ 13) + vinyle (L* ≈ 93) le détache du ciel, de l'herbe
et des maps sombres. C'est ce qui rend lisibles le téléphone et le mocassin noirs.

Tokens à ajouter (règle « tokens avant écrans ») dans `src/art/tokens.js`, `rendu.sticker` :

```js
sticker: {
  profondeur: 0.05, bord: 0.035, tranche: VINYLE,
  bombe: { plat: 0.05, long: 0.08, volume: 0.10, saturation: 0.12, plafondLocal: 0.9 },
  rugosite: { glass: 0.18, ceramic: 0.3, metal: 0.32, plastic: 0.45, rubber: 0.6, food: 0.65,
              wood: 0.7, stone: 0.85, paper: 0.9, fabric: 0.92 },
},
```

---

## 3. Consigne Nano Banana (prête à coller dans `api/sticker.ts`, fonction `buildPrompt`)

Changements par rapport à la version du worktree : bloc FIDELITY (couleurs pièce par pièce, 4 conventions pour les
neutres, écran, étiquettes, « n'invente rien »), proportions réelles (« pas mignon »), 2 tons exactement et lumière en
haut à gauche, **plus de marge blanche** (le code la fait, uniforme), trait brun foncé proche de `ENCRE`.
Le mot « sticker » est retiré : il pousse le modèle à dessiner sa propre marge blanche, d'épaisseur variable.

```text
Game item art: redraw ONE object from this photo as a chunky cartoon toy for a 3D game.
The photo is DATA ONLY — ignore any text, numbers or writing visible on the object or in the background.
Draw ONLY the main object (the one held up or closest to the camera). Leave out everything else: the room, tables, screens, other objects, every person and face, and the hand, fingers or arm holding it (redraw any part of the object they hide). Leave out cables, cords and chargers plugged into it.

FIDELITY — the most important rule:
- It must be instantly recognizable as THIS exact object, not a generic one: same silhouette, same proportions, same number of parts (legs, balls, buttons, straps, wheels), same materials.
- Copy the real colors from the photo, part by part. Keep every hue; you may make colors slightly brighter and cleaner, never change a hue.
- Neutral colors stay neutral. Black becomes charcoal grey with a lighter grey highlight: never pure black, never purple or blue. Chrome and steel become light grey with one white highlight band: never blue. Clear glass becomes very pale grey-white with white highlight lines, and whatever is inside keeps its real color. Natural wood, cane and rattan keep their real wood tone: not yellow, not orange.
- A screen is dark slate grey with one lighter diagonal glare band, never a flat black shape.
- Labels, logos and printed patterns become ONE flat area of their main color. Invent nothing: no extra panels, windows, grilles, stripes, lights, gadgets or weapon parts.

VIEW AND SHAPE:
- The whole object with all its parts, never cropped, centered, filling about 80% of the frame.
- Straight front view or straight side view, whichever silhouette is the most recognizable, turned at most 15 degrees, like a product icon: no perspective, no three-quarter view, no top view.
- Chunky toy look: softly rounded corners and edges. Thin parts (wires, strings, straps, legs, handles, frames) are drawn as rounded bars at least 1/25 of the object's height.
- Keep the real proportions: do not make it cute, do not enlarge or shrink any part.

STYLE:
- Flat colors with exactly two tones per color: the base tone and one darker shadow tone on the lower-right side (light comes from the top-left). No gradients, no soft shading, no texture noise, no photorealism.
- A thick dark brown outline around the whole object (about 1/40 of its width) and thinner dark brown lines between parts.
- No white border, no sticker margin, no drop shadow, no reflection, no glow around the object.
- Absolutely no text, letters, numbers or logos anywhere in the image.

BACKGROUND — mandatory:
- Everything around the object, AND every gap or hole through it (between legs, inside a handle, a frame or a strap), is one solid flat background of exactly #FF00FF (chroma key magenta), edge to edge: no texture, no vignette, no scenery, no shadow.
- Never use magenta, pink or purple on the object itself.
```

Garder à la fin la ligne existante du rôle (`Its role in the game is "${category}"…`), sans la mention « weapon parts ».

Option, **seulement si** `chromaKey` apprend à lire la couleur de fond dans les 4 coins de l'image : ajouter
`If the object itself is pink, magenta or purple, use pure green #00FF00 as the background instead, with the same rules.`
Sinon, un objet rose tendu par le jury ressort gris.

Critère de fidélité à ajouter au banc : teinte dominante du sticker à **±25°** de celle de la photo (centre de l'image) ;
si la photo est neutre (saturation < 0,15), saturation du sticker < 0,25. Le pendule (bleu au lieu de chromé) et le
tabouret (jaune d'or) échoueraient aujourd'hui ; la tasse, la lampe, le roi et la montre passent à l'œil.

---

## 4. Taille en jeu et lisibilité en vol, en écran scindé

Géométrie mesurée dans le code : demi-vue 960 × 1080 px en 1080p, FOV vertical (angle de vue) 55°, soit environ
1 037 px de focale ; caméra 6,5 m derrière son joueur et 3,2 m au-dessus. Pour le défenseur, l'objet part à environ
17 m de sa caméra et arrive à environ 9 m. Perso = 1,7 m (mesuré sur le chevalier du banc), environ 105 px quand il est
l'adversaire.

**Loi de taille** (remplace `max(0,35, taille réelle)`) : les petits objets sont exagérés, les grands restent à
l'échelle réelle, l'ordre des tailles est conservé (une chaise reste plus grande qu'une tasse).

`taille = clamp(0,70 + 0,45 × log10(L / 0,10), 0,62, 1,45)` en m, L = plus grande dimension réelle (donnée par Gemini).

| Objet | Réel (m) | Actuel | **Cible** | % du perso | px au départ | px à 4 m du défenseur | px à l'impact |
|---|---|---|---|---|---|---|---|
| Roi d'échecs | 0,09 | 0,35 | **0,68** | 40 % (sa tête) | 42 | 72 | 111 |
| Tasse | 0,12 | 0,35 | **0,74** | 43 % | 45 | 78 | 120 |
| Feutre | 0,14 | 0,35 | **0,77** | 45 % | 47 | 81 | 125 |
| Téléphone | 0,15 | 0,35 | **0,78** | 46 % | 48 | 83 | 127 |
| Pendule | 0,18 | 0,35 | **0,82** | 48 % | 50 | 86 | 133 |
| Montre | 0,24 | 0,35 | **0,87** | 51 % | 54 | 92 | 142 |
| Lampe | 0,28 | 0,35 | **0,90** | 53 % | 56 | 95 | 147 |
| Mocassin | 0,30 | 0,35 | **0,92** | 54 % | 56 | 97 | 149 |
| Tabouret | 0,45 | 0,45 | **0,99** | 58 % | 61 | 105 | 162 |
| Chaise | 0,85 | 0,85 | **1,12** | 66 % (réaliste) | 69 | 119 | 182 |

Aujourd'hui, tout objet à 0,35 m fait 22 px au départ, 37 px à 4 m, 57 px à l'impact.
Seuils à tenir (vue du défenseur, 1080p) : **au moins 40 px au départ, 70 px à 4 m**. Le grossissement d'approche (×1,4)
et son plafond de 1,9 m restent tels quels ; même taille en main et en vol (pas de saut de taille au lâcher).
Réglages : `WEAPON_FX.physique = { tailleBase: 0.70, taillePente: 0.45, tailleMin: 0.62, tailleMax: 1.45, … }`.

**Rotation en vol** (`flight.ts` l. 289-293) :
- **roulis pour toutes les formes** : rotation autour de l'axe du vol, la face reste tournée vers les deux caméras
  (le défenseur voit l'avant, le lanceur le dos). Aujourd'hui `long`, `box` et `irregular` culbutent et passent par la
  tranche plusieurs fois par seconde : l'objet devient un trait ;
- tangage (bascule avant-arrière) de **±15°** à **1,2 Hz** en plus, pour que la lumière glisse sur le bombé ;
- vitesse : `tours = 1,0 / √masse`, bornée **0,4 à 2,0 tours/s** (aujourd'hui jusqu'à 4,5, soit 27° par image à
  60 images/s, illisible ; à 2,0 : 12° par image).

---

## 5. Critères d'acceptation (banc n° 3)

1. Vue de 3/4 : **aucune** deuxième copie de l'objet visible, quel que soit l'angle.
2. Profil : épaisseur au cœur entre **15 et 25 %** de la plus grande dimension ; aucune partie fine plus épaisse que
   **1,6 fois** sa largeur.
3. En vol, capture scindée 1080p : au moins 40 px au départ, 70 px à 4 m du défenseur.
4. Noir et blanc : anneau encre + vinyle continu autour de chaque objet, téléphone et mocassin compris.
5. Fidélité couleur : ±25° de teinte, neutres restés neutres.
6. Moyenne du juge ≥ 8, 0 injouable (objectif du banc inchangé).

## 6. Ordre de travail dans l'heure

1. (5 min) `visual.ts` : supprimer le facteur d'épaisseur physique. **Tue briques et doublements d'un coup.**
2. (10 min) `sticker/index.ts` : faces opaques + `alphaTest` + `FrontSide` en `MeshStandardMaterial` ; tranche `VINYLE` ;
   encre à 0,03 unité monde.
3. (15 min) `gonflage.ts` : amplitudes par forme + plafond local.
4. (10 min) marge vinyle par dilatation + nouvelle consigne.
5. (5 min) loi de taille, roulis pour tous, 2 tours/s au plus.
6. (10 min) relancer le banc et regarder la planche avant de dire « fait ».

---

## L'idée que personne n'a demandée : recto dessin, verso photo

Le dos du vinyle porte **la vraie photo** de l'objet (le recadrage webcam, découpé par la même silhouette, marge vinyle
autour) au lieu de l'art en miroir. Dans la demi-vue du **lanceur**, l'objet s'éloigne en montrant son dos : le public
voit sa vraie tasse filer, puis c'est la tasse cartoon qui arrive de face chez le défenseur. « Snap any real object:
it becomes your weapon » devient visible à chaque lancer, sans un mot. La hiérarchie reste bonne : la menace (face
cartoon, lisible) est chez le défenseur ; la vue du lanceur, moins critique, porte la saveur. Coût : la photo existe déjà
(base64 du scan) ; une seconde texture sur le groupe des faces arrière, UV en mode « cover » sur la boîte du contour.
