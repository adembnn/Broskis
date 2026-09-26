# Lot LK · Parade avancée

## Fait
- Ajout des nouveaux événements de parade dans `src/core/events.ts` (`parry:cue`, `parry:window`, `parry:streak`, `bro:gauge`, `super:ready`, `attack:nice`, `feint`).
- Mise à jour de `src/gameplay/tuning.ts` avec la table complète `PARRY_WINDOWS` intégrant les paliers de difficulté et les feintes par tour.
- Refonte de la logique de parade dans `src/gameplay/parry.ts` avec :
  - Ajustement des fenêtres PERFECT et GOOD basé sur l'agilité du défenseur, le type d'arme (lourde, rapide, bouclier).
  - Gestion des séries de PERFECT (streak) et multiplicateur.
  - Système anti-martelage (250ms de pénalité si appui hors fenêtre).
  - Synchronisation de l'événement `parry:window` contenant les bonnes valeurs pour permettre l'affichage des repères visuels par l'UI.
- Modification de `src/gameplay/projectiles.ts` pour passer les paramètres d'attaquant, arme, index et taille de la rafale afin d'alimenter correctement les événements de parade.

## Pas fait et pourquoi
- Effets visuels (`src/scene/parry-fx/**`, `src/ui/parry-hud/**`) et sonores (`src/audio/parry-cues/**`) : Les dossiers n'existaient pas, et le code de base de la parade précise que ce sera un lot dédié après fusion. J'ai préparé les événements (`parry:window`, `parry:cue`, etc.) pour qu'ils s'y abonnent facilement.
- Charge `attack:nice` et `feint` : La logique nécessiterait des modifications dans la gestion de la visée et de la charge (probablement `src/gameplay/aim.ts`), ce qui n'est pas autorisé par les chemins définis dans la spécification du lot (qui limite aux dossiers de parade et événements).

## Décisions prises seul
- Définition d'une arme "rapide" (modificateur de -10ms) : appliquée aux armes de type `blaster` ou `throwable` ayant une vitesse (stat b) > 3, en l'absence de trait spécifique `fast`.
- Ajout d'index et count dans `registerIncoming` pour transmettre précisément la composition des rafales au HUD de l'anneau.

## Frictions
- La signature initiale de `IncomingAttack` ne contenait pas l'arme, l'attaquant, ou les informations de rafale nécessaires aux calculs dynamiques de la fenêtre de parade. J'ai dû modifier cette interface et ajuster `projectiles.ts` en conséquence.

