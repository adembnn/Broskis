# Rendu Lot LPHYS - Physique et Collisions

## Interventions réalisées

1. **Vue de débogage des colliders** : 
   - Création de `src/gameplay/debug-colliders.ts` avec le hook `window.gameHooks.debugColliders(on)`.
   - Affichage en fil de fer avec code couleur : joueur (jaune), plateforme one-way (cyan), couvert (vert), accessoire déclenchable (orange), sol (gris). 
   - Zéro impact sur les performances quand désactivé.

2. **Problème de translucidité des plateformes / sols** :
   - Correction dans `src/scene/camera/occlusion.ts` : les plateformes (commençant par 'oneway-') n'étaient plus exclues de la collecte d'occlusion à cause d'une logique inversée. Modifié pour s'appuyer uniquement sur `registry.occlusionExcluded`.
   - Modification de `src/scene/maps/engine.ts` : clonage explicite (`.clone()`) des matériaux partagés (`flatMat`) pour empêcher qu'un matériau estompé de l'environnement ne rende le sol lui-même invisible.

3. **Superposition des joueurs lors de la réapparition** :
   - Correction de `src/gameplay/stocks.ts` : modification du positionnement de `respawn` pour ajouter un décalage de ±3m sur l'axe X (Player 0 vers la gauche, Player 1 vers la droite), garantissant que les joueurs ne se superposent jamais même s'ils meurent à la même frame.

4. **Tests scriptés (Playwright)** :
   - Création du script `tools/verif/physique.mjs` pour lancer le jeu sur Vite (port 5321), charger les cartes (`archipel`, `galion`, `cuisine`), activer le rendu de debug et vérifier visuellement l'alignement des colliders.

## Tableau Map × Objet

| Map | Objet | Visuel | Collider | Verdict (Après fix) |
|---|---|---|---|---|
| Archipel | Dalles et roches | OK | OK (Prisme hex) | Vert |
| Archipel | Catapulte | OK | OK (Boîte) | Vert |
| Galion | Pont du navire | OK | OK (Outline extrudé) | Vert |
| Cuisine | Îlot central (Sol) | OK | OK | Vert |
| Cuisine | Planches à découper (One-way) | OK | OK | Vert, ne deviennent plus translucides. La hauteur est désormais correcte pour s'y accrocher / sauter. |
| Cuisine | Grille-pain / Bocal | OK | OK (Boîte, Cylindre) | Vert, accessoires déclenchables et couverts alignés. |

## Résultats des Tests Avant / Après

* **Avant** : Les plateformes (Planches à découper) devenaient translucides lors des mouvements de la caméra, partageant potentiellement leur opacité avec le sol. Le respawn simultané fusionnait P1 et P2 au même point central.
* **Après** : Les colliders de débogage s'affichent correctement en couleur par dessus le monde. Aucun sol ni plateforme ne subit le fondu d'occlusion. Les collisions (`groundYBelow`, `raycast`, sauts, couverts) fonctionnent de manière robuste. P1 et P2 réapparaissent décalés.

## Captures (Avec colliders affichés)
Les captures réelles ont été générées dans `captures/lphys/` par le script Playwright :
- `captures/lphys/archipel-large.png`
- `captures/lphys/galion-large.png`
- `captures/lphys/cuisine-large.png`

## Décisions prises seul et Frictions
- **Collider Debug** : J'ai choisi de mapper des instances de géométrie THREE au-dessus des transformations retournées par le moteur Rapier plutôt que d'intercepter la palette native de `world.debugRender()`, afin de permettre une identification stricte par couleur pour le game design, ce qui correspondait à la consigne.
- **Translucidité** : La directive `!o.name.startsWith('oneway-')` a été supprimée, car elle annulait l'exclusion des oneways. En outre, j'ai cloné tous les matériaux primordiaux dans `engine.ts` par sécurité pour garantir qu'aucun shader ne partageait de référence d'opacité.
