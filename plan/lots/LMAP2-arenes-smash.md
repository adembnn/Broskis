# Lot LMAP2 · Level design : 3 arènes ouvertes, épurées, façon Smash
Exécution : **agent Claude (Opus, level design)** · Priorité 1 · Retours d'Adem et Titouan (14h) : « la map n'est pas assez bien designée », « les arènes sont fermées alors qu'on a dit qu'on pouvait tomber », « trop cartoonesque », « il faut épurer », « l'univers de Smash et Brawlhalla ».

## Règles de level design (Smash « Battlefield » transposé en 3D, vu de 3/4)
- **Un plateau principal net**, suspendu au-dessus du vide :
  - forme lisible (ovale ou hexagone large), diamètre de 16 à 20 m ;
  - **bords francs, sans aucun mur, rambarde ni obstacle continu sur le pourtour** : on voit le vide tout autour ;
  - distance entre les apparitions : 9 à 10 m.
- **2 ou 3 plateformes flottantes** traversables par le dessous (on saute à travers, on atterrit dessus), à 2,2-2,8 m de haut, atteignables avec le **double saut** (règles v2 du lot LSMASH). Elles servent à prendre de la hauteur ou à fuir.
- **1 ou 2 couverts** seulement (un mur bas ou un tonneau), jamais au centre de la ligne de tir entre les apparitions.
- **1 danger** annoncé un tour avant, déjà codé dans `src/gameplay/map-events/` : garde-le et rends-le lisible (zone au sol qui clignote).
- **Épuré** : 40 objets de décor jouables au maximum. Le décor d'ambiance est **hors du plateau**, en fond lointain et en silhouettes, sans jamais gêner la lecture ni la caméra. Aucun objet entre le plateau et la caméra de 3/4 par défaut.
- Contraste : plateau clair et lisible ; persos toujours détachés du sol.
- Budget : 150 appels de dessin maximum (instancier les dalles, fusionner le statique).

## Les 3 arènes
- **Archipel qui s'effrite** (KayKit Medieval Hexagon) : plateau d'hexagones herbeux ; l'anneau extérieur tombe tous les 2 tours, ce qui fait rétrécir l'arène ; 2 plateformes de ruines flottantes ; la catapulte **hors du plateau**, en fond, qui tire sur l'arène quand elle est déclenchée. Fond : îles lointaines et mer de nuages.
- **Galion dans la tempête** (Kenney Pirate Kit), le stage « Pirate Ship » de Smash :
  - le **pont** est le plateau : garde les bords ouverts (pas de bastingage continu, 2 ou 3 caisses au plus) ;
  - le mât est central **mais au fond** de la vue de 3/4 ; les voiles sont hautes et ne masquent pas le pont ;
  - le canon se déclenche en tirant dessus ; la vague fait gîter le pont de 12° tous les 3 tours.
  - Fond : mer démontée, autres navires en silhouette.
- **Cuisine géante** (KayKit Restaurant et Furniture Bits), l'esprit du stage « Living Room » :
  - un **plan de travail** comme plateau, bords francs au-dessus du sol lointain de la cuisine, qui est la zone de chute ;
  - le grille-pain est un tremplin ;
  - l'éponge balaie une bande annoncée.
  - Fond : meubles géants flous.

## Tes chemins
`src/scene/maps/**` (format JSON des maps, props, colliders Rapier, points d'apparition, plateformes), `src/gameplay/map-events/**`. **Pas** le rendu global (lumières, ciel, post-traitement : lot LDA2 en parallèle), **pas** la caméra (LFIX2), **pas** les règles (LSMASH).
Les plateformes traversables : collider Rapier « one-way » (on traverse en montant, on se pose en descendant). Si le contrôleur de personnage (`src/gameplay/character.ts`, lot LSMASH) doit en tenir compte, expose un marqueur sur le collider (ex. `userData.oneWay`) et décris-le dans ton rendu pour que LSMASH le branche.

## Contrôles
- `npm run build` passe.
- Pour chaque map, via `gameHooks.startMatch({ map })` :
  - capture vue de 3/4 haute (`captures/lmap2/<map>.png`) et vue du dessus (`captures/lmap2/<map>-dessus.png`) ;
  - compte des appels de dessin ;
  - test qu'un perso poussé hors du plateau **tombe** vraiment, sans mur invisible.
- Juge tes captures avec l'œil d'un level designer de Smash : lisibilité à 3 m d'un projecteur, silhouette du plateau, place du vide. Donne-toi une note sur 10 par map et corrige sous 8.
