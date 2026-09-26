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
