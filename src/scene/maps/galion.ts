// Galion dans la tempête (LMAP2, l'esprit du stage « Pirate Ship » de Smash) : le PONT est le plateau,
// bords ouverts (aucun bastingage : la coque Kenney en avait, elle est remplacée par une coque propre),
// un seul mât au fond de la vue 3/4, voile basse retirée. Danger : la vague fait gîter le pont de 12° vers
// la caméra (bande avant qui clignote un tour complet avant). Le canon balaie son axe peint quand on lui
// tire dessus. Tomber à la mer = sortie. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { KIT, PIRATE } from './assets';
import { shipOutline } from './outline';
import { LOCAL_TOKENS } from './tokens';
import { MAX_LEDGE_HEIGHT, type BackdropSpec, type GroundPiece, type MapDef, type OneWaySpec, type PropSpec, type StaticCollider } from './types';

// LMAP3 : pont de 28 x 10 m posé sur la vraie coque Kenney (ship-pirate-large, x2,14), mâts écrêtés sous le pont.
const DECK_LEN = 28;       // de la poupe (x = -13,2) à la pointe de la proue (x = +14,8)
const DECK_SHIFT = 0.8;    // décalage du pont vers la proue (la partie pleine largeur reste centrée)
const DECK_HALF_Z = 5.0;   // 10 m de large
const PLATFORM_Y = MAX_LEDGE_HEIGHT;
const SPAWN_X = 6.25;      // 12,5 m entre les apparitions
const SEA_Y = -3.2;        // la mer lèche la coque ; RINGOUT (-5) est sous la surface

// ---------------------------------------------------------------------------
// Plateau : pont en planches (bord franc) + coque qui s'enfonce dans la mer.
// ---------------------------------------------------------------------------
function plateau(): { pieces: GroundPiece[]; collider: StaticCollider } {
  const g = LOCAL_TOKENS.galion;
  const pieces: GroundPiece[] = [
    { id: 'plateau_pont', build: { kind: 'procedural', shape: 'shipDeck', size: [DECK_LEN, 0.45, DECK_HALF_Z * 2], surface: { detail: 'bois' } }, pos: [DECK_SHIFT, 0, 0], collider: null },
    // Vraie coque modélisée (Kenney), proue vers +X ; tout ce qui dépasse le bastingage (mâts, pavillons) est
    // aplati sous le pont : on garde la silhouette du navire sans rien au milieu de l'arène.
    {
      id: 'plateau_coque', pos: [DECK_SHIFT - 2.2, -g.deckLocalY * g.shipScale, 0], yaw: -Math.PI / 2, scale: g.shipScale, collider: null, tint: 'sol',
      build: { kind: 'model', url: PIRATE.shipLarge, hide: ['sail-a', 'sail-b'], surface: { detail: 'bois', clampY: g.deckLocalY - 0.05 } },
    },
    // Mât au fond du pont (la voile basse masquerait le jeu : retirée).
    { id: 'mat', build: { kind: 'model', url: PIRATE.mast, hide: ['sail-a'], graded: false }, pos: [0, 0, -DECK_HALF_Z + 1.1], scale: 2, collider: { type: 'cylinder', radius: 0.22, halfHeight: 2.4, offset: [0, 2.4, 0] } },
  ];
  // Collider = exactement le contour du pont dessiné (prisme convexe) : aucun rebord invisible à la proue.
  const collider: StaticCollider = { id: 'deck', pos: [DECK_SHIFT, 0, 0], collider: { type: 'convex', outline: shipOutline(DECK_LEN, DECK_HALF_Z * 2), depth: 0.6 } };
  return { pieces, collider };
}

// ---------------------------------------------------------------------------
// 2 passerelles de planches suspendues, de part et d'autre du mât (au fond de la vue).
// ---------------------------------------------------------------------------
function passerelle(id: string, x: number, z: number): OneWaySpec {
  // radeau_L (kit) : débris de pont cerclés de cordes, dessus à y = 0, 6,2 x 2,8 m.
  return {
    id, top: [x, PLATFORM_Y, z], halfX: 3.05, halfZ: 1.35, thickness: 0.3,
    parts: [{ build: { kind: 'model', url: KIT.radeauL, graded: false, surface: { detail: 'bois' } }, offset: [0, 0, 0] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [passerelle('gangway_left', -7, -2.4), passerelle('gangway_right', 7, -2.4)];
}

// ---------------------------------------------------------------------------
// Couverts (2 tonneaux, hors de la ligne de tir directe) + canon à la poupe.
// ---------------------------------------------------------------------------
function tonneau(id: string, x: number, z: number): PropSpec {
  // tonneau (kit) : rayon 0,47, hauteur 1,1 (base au sol) ; x1,15 = 1,27 m ; renversé d'un coup, il roule.
  return {
    id, kind: 'knockable', pos: [x, 0, z], scale: 1.15,
    build: { kind: 'model', url: KIT.tonneau, graded: false, surface: { detail: 'bois' } },
    collider: { type: 'cylinder', radius: 0.47, halfHeight: 0.55, offset: [0, 0.55, 0] },
    triggerRadius: 1.2, impulse: 5,
  };
}

function caisse(id: string, x: number, z: number, yaw: number): PropSpec {
  // caisse (kit) : 1,1 m, cadre clair ; couvert fixe à mi-hauteur.
  return {
    id, kind: 'decor', pos: [x, 0, z], yaw, scale: 1.15,
    build: { kind: 'model', url: KIT.caisse, graded: false, surface: { detail: 'bois' } },
    collider: { type: 'box', hx: 0.55, hy: 0.55, hz: 0.55, offset: [0, 0.55, 0] },
  };
}

function couverts(): PropSpec[] {
  return [
    tonneau('barrel_a', -2.8, 2.3),
    tonneau('barrel_b', 2.8, -2.1),
    caisse('crate_a', -8.2, 2.9, 0.3),
    caisse('crate_b', 8.4, -2.6, -0.2),
    {
      id: 'cannon', kind: 'cannon', pos: [-11.2, 0, -1.6], yaw: Math.PI / 2, scale: 1.4,
      build: { kind: 'model', url: PIRATE.cannon, graded: false },
      collider: { type: 'box', hx: 0.7, hy: 0.53, hz: 1.0, offset: [0, 0.53, 0] },
      triggerRadius: 1.8, cannonAxis: [1, 0, 0], cannonRange: 22,
    },
  ];
}

// ---------------------------------------------------------------------------
// Fond (LSKY) : le panorama peint (sky.ts) porte la tempête, la flotte et le phare ; la houle 3D du moteur
// (buildSea) donne la parallaxe.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  return []; // LSKY : flotte, récifs et phare sont peints (les modèles 3D lointains faisaient « primitives »)
}

export function buildGalionDef(): MapDef {
  const { pieces, collider } = plateau();
  const spawns: [Vec3, Vec3] = [[-SPAWN_X, 0.05, 0], [SPAWN_X, 0.05, 0]];
  return {
    id: 'galion',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 13 },
    respawn: [0, 0.05, 0.6],
    spawns: [{ pos: spawns[0], yawDeg: -90 }, { pos: spawns[1], yawDeg: 90 }],
    crateSpots: [[0, 0.4, 1], [-5, 0.4, -1.5], [5, 0.4, 2]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: couverts(),
    backdrop: fond(),
    periodicEvent: { kind: 'wave', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    seaY: SEA_Y,
    // Bande avant sur la partie pleine largeur du pont (de la poupe, x = -11,8, au début de la proue, x = 7,5).
    waveBand: { center: [-2.15, 0, DECK_HALF_Z - 1.0], size: [19.3, 2.0] },
  };
}
