# Lot LGRIP · Chaque objet est VRAIMENT tenu en main
Exécution : **agent Claude (Opus)** · Retour d'Adem (17h40) : « il faut vraiment faire attention à la manière dont la chaise, les objets, sont tenus dans la main : c'est ultra important que tout soit bien tenu ». Sur la capture actuelle, la chaise flotte à côté du perso, sans contact avec la main.

## Principe : une prise selon la taille et la forme (données `weapon.physics` : `sizeM`, `shape`, `massKg`)
| Objet | Prise | Pose du perso |
|---|---|---|
| **Petit** (< 0,25 m : canette, feutre, roi, montre, téléphone) | dans le poing, **le point de prise (bas ou milieu de l'objet) dans la paume** (os `handslotr`) | bras semi-levé |
| **Moyen** (0,25 à 0,6 m : mocassin, lampe, tasse géante…) | à une main, par une partie saisissable (anse, pied, tige) si la forme en a une, sinon par le bord | bras armé |
| **Grand / lourd** (> 0,6 m ou > 4 kg : chaise, tabouret) | **À DEUX MAINS au-dessus de la tête** (façon Donkey Kong qui porte un tonneau) ; les deux mains touchent l'objet | bras levés : pose de port, et marche plus lourde si possible |
| **Long** (`shape: long` : feutre, batte…) | tenu par un bout, l'autre bout pointé vers l'avant | — |
| **Bouclier** | tenu devant le torse jusqu'à la pose | — |

- Le point de prise est calculé à partir de la silhouette : bas de l'objet ou point le plus étroit pour les longs. Aucun objet ne traverse le corps ni la tête.
- **Au lancer**, l'objet part DE LA MAIN, voire des deux mains au-dessus de la tête pour les grands, pas du centre du perso. La position de départ du projectile doit coïncider avec la main (`anim:release` donne `handPos`) : vérifie-le côté gameplay (`src/gameplay/projectiles.ts`, origine du tir) et corrige la jointure.
- Pendant la course, l'objet suit la main sans glisser.

## Tes chemins
- `src/scene/weapons/hand.ts` (objet en main) ;
- la pose des bras dans `src/scene/animation/**` (couche du haut du corps de LATK2 : ajoute une pose « port à deux mains ») ;
- l'origine du tir dans `src/gameplay/projectiles.ts` (petite correction de jointure).
Coordination : LANIM3 (Gemini) retouche les animations du bouclier et de la garde dans `src/scene/animation/**`, et LFACE ancre la tête sur le cou (`src/scene/fighter-custom/`). Fais `git merge main` souvent et de petits commits.

## Contrôles
Captures dans la vue du lanceur ET de côté, en jeu, avec le vrai pipeline (au moins la chaise, la canette et le feutre d'Adem, via `gameHooks.scanObjectFromUrl` et les photos de `C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\tools\scan-bench\photos\objets\`, lues à ce chemin, jamais copiées) :
- en main à l'arrêt, en main en courant ;
- au moment du lâcher, puis en vol.
La main doit toucher l'objet sur chaque image. Envoie les captures à la session principale.
