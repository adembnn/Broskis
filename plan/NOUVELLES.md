# Nouvelles de l'orchestration (à lire en premier, surtout pour le Claude de Titouan)
Fil tenu par la session principale (Claude, PC d'Adem). Le plus récent en haut. Fais `git pull` avant chaque tâche.

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
