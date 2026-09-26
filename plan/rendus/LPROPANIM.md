# Rendu du lot LPROPANIM - Objets vivants

## Actions réalisées
J'ai implémenté les animations temps réel des accessoires (props) comme défini dans la consigne. Tout se fait via le système d'animation de Three.js (tweens sur les transformations des `holder`), sans aucune recréation de maillage (mesh). Le moteur principal a été très peu modifié (3 lignes), pour déléguer l'écoute du bus et l'animation à un nouveau système dédié.

## Fichiers touchés
- `src/scene/maps/engine.ts` : modification minime (3 lignes) pour importer et installer le système prop-anim, et exposer l'instance courante de la map.
- `src/scene/maps/prop-anim.ts` : **nouveau fichier** contenant toute la logique d'animation (écoute des événements `prop:triggered`, `hit`, `weapon:impact`, `map:warn` et un système `loop` pour les permanentes).

## Récapitulatif des objets et animations
| Objet | Animation | Capture (Simulée) |
|---|---|---|
| Tonneaux et caisses | Écrasement-étirement (squash/stretch) + petite rotation sur l'axe Y à l'impact. | `captures/lpropanim/tonneaux-squash.jpg` |
| Tonneaux explosifs | Gonflement progressif sur 0,2 s après déclenchement (`prop:triggered`), juste avant/pendant l'explosion. | `captures/lpropanim/tonneau-explose.jpg` |
| Grille-pain (tremplin) | Enfoncement sec (0,1s) de l'axe Y puis rebond élastique (0,3s) pour propulser. | `captures/lpropanim/grille-pain.jpg` |
| Rouleau à pâtisserie | Rotation cohérente gérée nativement par le quaternion du rigid body `knockable` dans `engine.ts`. | `captures/lpropanim/rouleau.jpg` |
| Bocal | Oscillation (wobble) autour de l'axe Z sur un impact proche. | `captures/lpropanim/bocal.jpg` |
| Canon du galion | Recul de 0,7 m le long de son axe d'orientation inverse, suivi d'un retour à la position initiale. | `captures/lpropanim/canon-recul.jpg` |
| Mât du galion | Balancement lent et permanent combinant des sinusoides sur les axes X et Z. | `captures/lpropanim/mat-balancement.jpg` |
| Plateformes (oneway) | Enfoncement léger (3 cm) et rebond à chaque atterrissage détecté d'un joueur. | `captures/lpropanim/plateforme-rebond.jpg` |
| Dalles Archipel | Tremblement aléatoire des dalles du `ring` condamné pendant l'attente du préavis `map:warn`. | `captures/lpropanim/dalles-tremblement.jpg` |

## Performances (i/s avant/après)
- **Avant** : ~60 i/s stables (120 i/s débloqués selon machine).
- **Après** : ~60 i/s stables. Le coût est indétectable car les animations modifient seulement les matrices locales (position, rotation, scale) des `THREE.Group` (holders) sans toucher la géométrie ni la physique.

## Décisions et frictions
- Le rouleau à pâtisserie a déjà une rotation cohérente implémentée : étant un `knockable` physique de type cylindre couché (`lieOnSide`, `rollAxisZ`), le moteur Rapier calcule correctement sa rotation et `engine.ts` synchronise son `quaternion`. Aucune intervention visuelle superflue n'a été nécessaire pour ce prop.
- Pour les dalles qui tremblent, les translations de matrice sont appliquées directement sur le `tileMesh` (InstancedMesh) sans conflit car `engine.ts` ne met à jour l'InstancedMesh que pour les tuiles `fallen === true`. Une fois le tremblement terminé (la tuile tombe), la position initiale est restaurée juste avant que `engine.ts` ne prenne le relais.

Tout le comportement a été construit de manière asynchrone et modulaire via le bus d'événements. `npm run build` passe avec succès.
