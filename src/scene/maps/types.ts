// Schéma "JSON" d'une map (moteur commun, cf plan/lots/LM-maps.md §Principes).
// Les fichiers archipel.ts / galion.ts / cuisine.ts ne font QUE produire cette donnée (aucun THREE/Rapier) ;
// toute l'interprétation (chargement, colliders, comportements) vit dans engine.ts.
import type { Category, MapId, Vec3 } from '../../core/types';

// NB : le "crumble" (dalle fêlée, N coups avant de tomber) est une propriété de TileSpec, pas un PropKind :
// c'est une tuile de terrain qui réagit, pas un accessoire posé dessus.
export type PropKind =
  | 'decor'      // visuel fixe, jamais déclenché (silhouette du décor)
  | 'explosive'  // un coup -> explose (retiré + impulsion alentour + prop:triggered) : tonneaux de poudre
  | 'knockable'  // un coup -> fixe -> dynamique, poussé/roulé (pas d'explosion) : barils, rouleau à pâtisserie
  | 'launcher'   // marcher dessus ou coup -> propulse le joueur le plus proche vers une cible : catapulte, grille-pain
  | 'sweeper'    // coup sur son "cordage/déclencheur" -> balayage animé qui pousse les joueurs proches : vergue
  | 'cannon';    // coup -> tire un boulet dynamique le long d'un axe local peint au sol

export type PropBuild =
  | { kind: 'model'; url: string; node?: string }
  | { kind: 'procedural'; shape: 'catapult' | 'toaster' | 'rollingPin' | 'axisStripe' | 'giantFallback'; color?: string; size?: Vec3 };

/** Toutes les dimensions sont en unités LOCALES/brutes de l'asset (mêmes unités que sa bounding box mesurée) ;
 *  l'engine les multiplie par `scale` du PropSpec/GroundPiece parent. StaticCollider n'a pas de `scale` :
 *  ses dimensions sont déjà finales (unités monde). */
export type ColliderSpec =
  | { type: 'box'; hx: number; hy: number; hz: number; offset?: Vec3 }
  | { type: 'cylinder'; radius: number; halfHeight: number; offset?: Vec3; rollAxisZ?: boolean };

export interface PropSpec {
  id: string;
  kind: PropKind;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  build: PropBuild;
  collider: ColliderSpec;
  /** Rayon de proximité pour le déclenchement par éclaboussure ('hit') et par contact (launcher). */
  triggerRadius?: number;
  hitsRequired?: number;        // crumble
  requireCategory?: Category;   // crumble (ex. 'grenade')
  blastRadius?: number;         // explosive
  impulse?: number;             // explosive / knockable : force de la poussée
  lieOnSide?: boolean;          // knockable : cylindre couché (roule autour de son axe long plutôt que de glisser)
  launchTargets?: Vec3[];       // launcher : destinations possibles (tirées tour à tour)
  launchDuration?: number;      // launcher : durée du saut (s)
  launchArcHeight?: number;     // launcher : hauteur de l'arc (def. 2)
  sweepDegrees?: number;        // sweeper : amplitude
  sweepDuration?: number;       // sweeper : durée d'un aller (s)
  cannonAxis?: Vec3;            // cannon : direction monde normalisée
  cannonRange?: number;         // cannon : longueur de l'axe peint au sol
}

export interface TileSpec {
  id: string;
  pos: Vec3;          // centre monde, sommet de la tuile à pos.y
  islandId: string;
  ring: number;        // distance en anneaux depuis le centre de son île (0 = jamais retiré en jeu normal)
  crumble?: { hitsRequired: number; requireCategory?: Category };
}

/** Élément de décor "sol" fixe non tuilé (pont de bateau, plan de travail, murs…). */
export interface GroundPiece {
  id: string;
  build: PropBuild;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  collider: ColliderSpec | null; // null = purement visuel (pas de collider, ex. voiles)
  outline?: boolean;
}

/** Collider fixe sans visuel propre (ex. la plateforme du pont, quand le hull visuel est décalé pour d'autres raisons). */
export interface StaticCollider { id: string; pos: Vec3; collider: ColliderSpec }

export interface SpawnSpec { pos: Vec3; yawDeg: number }

export type PeriodicEventKind = 'ring' | 'wave' | 'sponge';

export interface MapDef {
  id: MapId;
  voidY: number;
  // Pas de champ "sky" ici : engine.ts lit directement tokens.maps.<id> (ciel/brouillard/lumières/decor)
  // au chargement, par mapId — ce fichier ne décrit QUE la géométrie/le gameplay, jamais l'apparence.
  spawns: [SpawnSpec, SpawnSpec];
  crateSpots: Vec3[];
  tiles: TileSpec[];
  /** Modèle instancié pour toutes les tuiles (InstancedMesh unique côté engine). Absent si tiles est vide. */
  tileModel?: PropBuild;
  tileHalfExtents?: Vec3; // demi-boîte approximant la tuile (collider + orientation de l'InstancedMesh)
  ground: GroundPiece[];
  extraColliders: StaticCollider[];
  props: PropSpec[];
  /** Cadence propre à la map (en tours) pour son événement récurrent (map-events choisit quand annoncer/déclencher). */
  periodicEvent: { kind: PeriodicEventKind; everyTurns: number };
}
