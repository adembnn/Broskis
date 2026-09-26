# Nouvelles de l'orchestration (à lire en premier, surtout pour le Claude de Titouan)
Fil tenu par la session principale (Claude, PC d'Adem). Le plus récent en haut. Fais `git pull` avant chaque tâche.

## 18h25 · FIN DU CHANTIER (Adem, 18h12) : `main` = version de rendu
- **Plus aucun nouveau chantier.** Tous les agents de la session principale sont arrêtés, leurs résultats vérifiés sont fusionnés et poussés.
- **Ajouté depuis 18h00** :
  - écran d'attente de la tête (LWAIT) : étapes en direct, surnom qui s'écrit en flux, perso 3D qui se construit dans l'encart ; « Ready to fight! » bloqué tant que la tête n'est pas affichée ; en cas d'échec, « Retry » ou « Use a default head » au choix du joueur ;
  - écran d'attente de l'objet (LWAIT-OBJ) : la carte d'arme se remplit en direct (physique, stats), le sticker se révèle, l'objet 3D se gonfle et tourne ; « Confirm » bloqué jusqu'à l'objet 3D (chaise : prête en 13,8 s) ; en cas d'échec, « Retry » ou « Use a default weapon ».
- **Pas fusionné, volontairement** (rien de risqué avant la démo) :
  - LGRIP : branche `lgrip-brouillon`, chaise à deux mains derrière la tête ; en vol, elle chevauche la tête du lanceur ;
  - dernier ancrage de la tête LFACE (3d6ed2e) : vue du dessus « champignon », non vérifié ;
  - relief LVOL (fait baisser la note du banc) ;
  - animations LANIM3 et labo LAB (Gemini) : non vérifiés.
- **Pour la démo** :
  - joue sur l'**Archipel** : sur le galion, le perso se bloque par endroits sur le pont (bug connu, RTFIX) ;
  - Chrome sur la carte NVIDIA : `npm run demo` puis `npm run demo:chrome`.
- **Après la démo** : ramasse-miettes (`src/gameplay/character.ts:115` et `src/scene/weapons/flight.ts:133`, voir `plan/rendus/LPERF.md`).

## 18h00 · main `5247890` validé par Adem sur captures : à tester chez vous
- **Gel de 18h levé par Adem** (17h35) : on continue de livrer jusqu'à la démo.
- **Tester** : `git pull`, puis `npm ci` (seulement si `package-lock.json` a changé), puis `npm run demo` (build + serveur sur http://localhost:4173). Sur un PC portable, lance Chrome sur la carte NVIDIA : `npm run demo:chrome`. Il faut le `.env` avec les clés (jamais commité).
- **Déjà dans main** :
  - photo → arme : l'objet est visible en main et en vol dans la vue du lanceur (LE2E), et sa physique compte (mesuré en jeu : chaise 32 % de dégâts et 7,2 s de recharge, canette 12 % et 3,6 s) ;
  - photo → tête : face ET dos, environ 3,5 s, tête ×1,9, sans couvre-chef (LFACE) ;
  - plus de perso qui marche dans le vide, flotte après une téléportation ou s'enfonce dans le pont du galion (RTFIX) ;
  - la carte des commandes (H) ne fait plus d'à-coup en combat (LPERF).
- **En cours sur le PC d'Adem** (ne pas prendre) :

  | Lot | Sujet |
  |---|---|
  | LWAIT | écran d'attente du « snap » de la tête, étapes en direct ; on ne le quitte pas tant que la tête n'est pas affichée |
  | LWAIT-OBJ | la même chose pour le scan d'objet (dessin qui apparaît en direct) |
  | LGRIP | objet vraiment tenu : petit dans le poing, chaise à deux mains au-dessus de la tête, lancer depuis la main |
  | LFACE | tête ancrée sur le cou, sans trou |
  | LVOL | relief réel des objets (carte de profondeur), gardé seulement si la note du banc monte |
  | LANIM3 (Gemini) | bouclier, garde, parade, lancer |
  | RTFIX, LPERF | bugs de combat, ramasse-miettes |

## 16h35 · Bug repéré par Titouan (pas dans mon périmètre, je ne le corrige pas) — pour RTVIEW
- **`src/scene/camera/occlusion.ts`** spamme une erreur à CHAQUE image, dès l'écran-titre (423 lignes
  de console en quelques secondes de test) : `TypeError: Cannot read properties of null (reading
  'matrixWorld')` dans `raycastHits` → `Raycaster.intersectObjects` → `Sprite.raycast`, avec
  l'avertissement Three.js `"Raycaster.camera" needs to be set in order to raycast against sprites`.
- **Cause probable** : `raycastHits` (ligne ~32) fait `raycaster.set(camera.position, dir)` puis
  `raycaster.intersectObjects(decor, true)`, mais ne règle jamais `raycaster.camera` — nécessaire
  dès que la liste `decor` (= `scene.children` moins `registry.occlusionExcluded`) contient un
  `THREE.Sprite`. Plusieurs créateurs de sprites ne s'excluent pas de l'occlusion (contrairement à
  `src/scene/fx/impact.ts:104` qui appelle bien `excludeFromOcclusion(...)`) : voir
  `src/scene/weapons/blast.ts:218`, `flight.ts:159` et `:175`, `hand.ts:63`.
- **Piste de correction** (à faire côté RTVIEW, pas moi) : soit régler `raycaster.camera = camera`
  avant `intersectObjects` dans `occlusion.ts` (défensif, corrige tous les cas), soit appeler
  `excludeFromOcclusion(...)` sur ces sprites d'armes à la création (plus propre, évite aussi de les
  faire disparaître en fondu par erreur). Idéalement les deux.
- Pas urgent pour le gameplay (le jeu tourne quand même), mais ça pollue la console pendant la démo
  live et coûte un peu de perf à chaque image (raycast qui échoue en boucle).

## 16h10 · Jury sur ses propres ordinateurs, hébergement itch.io (plus tard)
- Les jurés testent sur LEURS ordinateurs : perf adaptative en cours (LPERF, paliers de qualité + résolution dynamique, ≥ 50 i/s en écran scindé sur une puce Intel), et **mode vs AI temps réel** (RTBOT) pour un juré seul.
- Hébergement : **itch.io** (décision d'Adem), pas encore lancé. Hébergement statique : les appels IA auront besoin d'un petit serveur séparé ou d'une clé restreinte au domaine, et la page est limitée à 1 000 fichiers. Emballage à préparer plus tard.

## 15h45 · À la session « Map design et assets 3D » (et toute autre session Claude d'Adem)
- Lis `plan/PIVOT-TEMPS-REEL.md` : temps réel, 1v1, écran scindé. Arènes : 22 à 28 m, bords ouverts, plateformes flottantes, couverts à hauteur de torse, 120 appels de dessin par vue.
- Deux agents de la session principale travaillent déjà sur les maps : **LMAP2** (`src/scene/maps/**`, `src/gameplay/map-events/**`) et **LKIT** (`public/assets/arena-kit/**`, `tools/blender/**`, `tools/assets/**`). Pour éviter les conflits, ne modifie pas ces chemins. Dépose tes assets dans `public/assets/<ton-dossier>/` avec un `LISEZMOI.md` (échelle, usage), et écris ce que tu fais dans ce fichier : la session principale les fera intégrer.

## 15h35 · PIVOT TEMPS RÉEL + photo → jeu en priorité
- **Le jeu n'est plus au tour par tour.** Il devient un combat en **temps réel, 1 contre 1, troisième personne, écran scindé** à 2 sur le même PC (P1 à gauche, P2 à droite), avec une visée verrouillée sur l'adversaire, sans souris. Tout est dans `plan/PIVOT-TEMPS-REEL.md`.
- **Touches par défaut** (réglables dans Settings) :
  - P1 : ZQSD, ESPACE saut ×2, F tir (maintenir = charger), G blocage / parade, 1-2-3 armes ;
  - P2 : flèches, MAJ DROITE, L, K, 8-9-0.
- **Priorité d'Adem** : le parcours « je me prends en photo, j'arrive dans le jeu » (lot LFACE) et « je prends un objet en photo, il devient mon arme » (lot LSCAN). Avec 2 amis qui se voient se battre en écran scindé, chacun avec son visage et sa voix clonée (LW2).
- **Lots en cours sur le PC d'Adem** (ne pas les prendre) :

  | Lot | Sujet | Chemins |
  |---|---|---|
  | RTCORE (ex-LSMASH) | cœur temps réel | `src/gameplay/**` |
  | RTVIEW | écran scindé + caméras | `src/core/ctx.ts`, `src/scene/camera/**`, `src/scene/render/**` |
  | LUX | HUD scindé, Settings / Controls, guidage | `src/ui/**` |
  | LATK1 | objets en main, en vol, à l'impact | `src/scene/weapons/**` |
  | LATK2 | animations | `src/scene/fighters/**`, `src/scene/animation/**` |
  | LMAP2 | arènes | `src/scene/maps/**` |
  | LKIT | kit 3D | `public/assets/arena-kit/**` |
  | LPERF | performance | — |
  | LLOAD | chargements | `src/core/preload.ts`, `src/ui/loading/**` |
  | LFACE | photo → combattant | `api/scan-fighter.ts`, `src/ia/fighter/**`, `src/scene/fighter-custom/**` |
  | LSCAN | photo → arme | `api/scan-object.ts`, `api/sticker.ts`, `src/ia/**`, `src/scene/sticker/**` |

- **Pour Titouan** : merci pour LVOX, le Scandex et la banque de voix, tout est fusionné. Adem veut te décharger : ne prends pas de nouveau lot de code sans le demander à Adem. Si tu as du temps : mets à jour `demo/SCRIPT.md` pour le temps réel (2 amis, photos, écran scindé, objets scannés), puis la vidéo et la bande-annonce après 18h.
- Voix : l'animateur reste Gemini Fenrir ; les combattants sont passés en **Gradium** (LBK2 / LBK3). L'effet stade est réservé à l'animateur.
