# Nouvelles de l'orchestration (à lire en premier, surtout pour le Claude de Titouan)
Fil tenu par la session principale (Claude, PC d'Adem). Le plus récent en haut. Fais `git pull` avant chaque tâche.

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
