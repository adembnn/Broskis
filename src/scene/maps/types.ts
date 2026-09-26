// Schéma "JSON" d'une map (moteur commun, cf plan/lots/LM-maps.md et LMAP2-arenes-smash.md).
// Les fichiers archipel.ts / galion.ts / cuisine.ts ne font QUE produire cette donnée (aucun THREE/Rapier) ;
// toute l'interprétation (chargement, colliders, comportements) vit dans engine.ts.
// Règles LMAP2 (façon Smash « Battlefield ») : un plateau principal net au-dessus du vide, bords francs,
// 2-3 plateformes traversables, 1-2 couverts, 1 danger annoncé ; le décor d'ambiance est HORS du plateau.
import type { MapId, Vec3 } from '../../core/types';
import type { DetailKind } from './tokens';

/** Hauteur max (m) du dessus d'une plateforme ou d'une marche au-dessus du plateau (lot LMAP3).
 *  Contrat avec le saut (lot LJUMP) : le double saut doit dépasser cette hauteur avec de la marge. */
export const MAX_LEDGE_HEIGHT = 2.0;

/** Revêtement d'une pièce : texture de détail triplanaire, repère monde ou objet, écrêtage en hauteur. */
export interface SurfaceSpec { detail?: DetailKind; space?: 'world' | 'local'; clampY?: number }

export type PropKind =
  | 'decor'      // couvert fixe, jamais déclenché (caisse, bocal)
  | 'explosive'  // un coup -> explose (retiré + poussée alentour + prop:triggered) : tonneaux de poudre
  | 'knockable'  // un coup -> fixe -> dynamique, poussé/roulé (pas d'explosion) : barils, rouleau
  | 'launcher'   // marcher dessus -> propulse le joueur vers une cible : grille-pain
  | 'cannon';    // coup -> tire un boulet le long d'un axe peint au sol

export type PropBuild =
  | { kind: 'model'; url: string; node?: string; hide?: string[]; surface?: SurfaceSpec; /** false : pas de grade (pleine couleur) */ graded?: boolean }
  | { kind: 'procedural'; shape: 'toaster' | 'rollingPin' | 'rock' | 'slab' | 'deck' | 'shipDeck' | 'hull' | 'giantFallback'; color?: string; size?: Vec3; surface?: SurfaceSpec };

/** Dimensions en unités LOCALES de l'asset, multipliées par `scale` du PropSpec. StaticCollider : unités monde. */
export type ColliderSpec =
  | { type: 'box'; hx: number; hy: number; hz: number; offset?: Vec3 }
  | { type: 'cylinder'; radius: number; halfHeight: number; offset?: Vec3; rollAxisZ?: boolean }
  /** Prisme convexe : contour XZ (le même que le visuel), dessus à y = 0, épaisseur `depth` vers le bas. */
  | { type: 'convex'; outline: [number, number][]; depth: number; offset?: Vec3 };

export interface PropSpec {
  id: string;
  kind: PropKind;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  build: PropBuild;
  collider: ColliderSpec;
  /** Rayon de proximité (éclaboussure d'un coup, contact du launcher). */
  triggerRadius?: number;
  blastRadius?: number;         // explosive : rayon de la poussée
  impulse?: number;             // explosive / knockable : vitesse de poussée (m/s)
  lieOnSide?: boolean;          // knockable : cylindre couché (roule)
  launchTargets?: Vec3[];       // launcher
  launchDuration?: number;
  launchArcHeight?: number;
  cannonAxis?: Vec3;            // cannon : direction monde normalisée
  cannonRange?: number;
}

export interface TileSpec {
  id: string;
  pos: Vec3;          // centre monde, sommet de la tuile à pos.y
  ring: number;       // anneau depuis le centre (le plus grand tombe en premier)
}

/** Pièce visuelle posée relativement à un point (plateforme, décor). */
export interface VisualPart { build: PropBuild; offset: Vec3; yaw?: number; scale?: number | Vec3 }

/** Élément de sol fixe non tuilé (pont, plan de travail…). `collider: null` = purement visuel. */
export interface GroundPiece {
  id: string;
  build: PropBuild;
  pos: Vec3;
  yaw?: number;
  scale?: number | Vec3;
  collider: ColliderSpec | null;
  /** Teinte multipliée prise dans la palette de la map (ex. 'matiere' pour assombrir une façade). */
  tint?: 'fond' | 'sol' | 'matiere' | 'accent';
  /** Archipel : socle rocheux qui rétrécit avec les anneaux (échelle X/Z = apothème(anneau) / apothème du modèle). */
  shrinkWithRing?: { base: number; perRing: number; modelApothem: number };
}

/** Collider fixe sans visuel propre (le vrai bord jouable, indépendant des modèles). */
export interface StaticCollider { id: string; pos: Vec3; collider: ColliderSpec }

/** Plateforme traversable par le dessous (« one-way ») : on saute à travers, on atterrit dessus.
 *  Le corps Rapier porte `userData = { kind: 'oneway', oneWay: true, topY, id }` (contrat pour LSMASH). */
export interface OneWaySpec {
  id: string;
  /** Centre du DESSUS (monde). */
  top: Vec3;
  halfX: number;
  halfZ: number;
  thickness: number;
  parts: VisualPart[];
}

/** Décor lointain instancié (silhouettes hors du plateau : îles, nuages, navires, meubles). */
export interface BackdropSpec { build: PropBuild; items: { pos: Vec3; yaw?: number; scale?: number | Vec3 }[]; graded?: boolean }

export interface SpawnSpec { pos: Vec3; yawDeg: number }

export type PeriodicEventKind = 'ring' | 'wave' | 'sponge';

export interface MapDef {
  id: MapId;
  voidY: number;
  /** Centre et rayon du plateau principal (cadrage caméra, zones d'éjection de LSMASH). */
  arena: { center: Vec3; radius: number };
  /** Point de réapparition (au-dessus du centre, cf. règles v2). */
  respawn: Vec3;
  spawns: [SpawnSpec, SpawnSpec];
  crateSpots: Vec3[];
  tiles: TileSpec[];
  /** Modèle instancié pour toutes les tuiles (InstancedMesh unique). */
  tileModel?: PropBuild;
  tileHalfExtents?: Vec3;
  /** 'hex' : collider en prisme hexagonal exact (rayon = tileHalfExtents[2]). */
  tileShape?: 'hex' | 'box';
  /** Revêtement et grade des dalles (LMAP3 : pleine couleur + détail + variation par dalle). */
  tileSurface?: SurfaceSpec;
  tileGrade?: { saturation: number; teinte: string };
  /** Dernier anneau qui peut tomber (les anneaux intérieurs restent : îlot final). */
  minRing?: number;
  ground: GroundPiece[];
  extraColliders: StaticCollider[];
  platforms: OneWaySpec[];
  props: PropSpec[];
  backdrop: BackdropSpec[];
  /** Danger périodique : un préavis (map:warn), puis l'événement `leadTurns` tours plus tard. */
  periodicEvent: { kind: PeriodicEventKind; everyTurns: number; firstTurn: number; leadTurns: number; maxEvents?: number };
  /** Archipel : catapulte de fond (hors plateau) qui tire sur l'anneau condamné, et son boulet. */
  catapult?: { build: PropBuild; pos: Vec3; yaw?: number; scale?: number | Vec3 };
  catapultAmmo?: PropBuild;
  /** Galion : hauteur de la mer, bande du bord qui va gîter (centre, taille x/z). */
  seaY?: number;
  waveBand?: { center: Vec3; size: [number, number] };
  /** Cuisine : bandes balayées par l'éponge (alternent entre les z donnés). */
  spongeBand?: { centerX: number; length: number; width: number; zs: number[] };
}
