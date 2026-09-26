// Galion dans la tempête (LMAP2, l'esprit du stage « Pirate Ship » de Smash) : le PONT est le plateau,
// bords ouverts (aucun bastingage : la coque Kenney en avait, elle est remplacée par une coque propre),
// un seul mât au fond de la vue 3/4, voile basse retirée. Danger : la vague fait gîter le pont de 12° vers
// la caméra (bande avant qui clignote un tour complet avant). Le canon balaie son axe peint quand on lui
// tire dessus. Tomber à la mer = sortie. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { PIRATE } from './assets';
import type { BackdropSpec, GroundPiece, MapDef, OneWaySpec, PropSpec, StaticCollider } from './types';

const DECK_HALF_X = 9;     // 18 m de pont jouable
const DECK_HALF_Z = 3.6;   // 7,2 m de large
const PLATFORM_Y = 2.4;
const SPAWN_X = 5;
const SEA_Y = -3.2;        // la mer lèche la coque ; RINGOUT (-5) est sous la surface

// ---------------------------------------------------------------------------
// Plateau : pont en planches (bord franc) + coque qui s'enfonce dans la mer.
// ---------------------------------------------------------------------------
function plateau(): { pieces: GroundPiece[]; collider: StaticCollider } {
  const pieces: GroundPiece[] = [
    { id: 'plateau_pont', build: { kind: 'procedural', shape: 'deck', size: [DECK_HALF_X * 2 + 0.4, 0.45, DECK_HALF_Z * 2] }, pos: [0, 0, 0], collider: null },
    { id: 'plateau_coque', build: { kind: 'procedural', shape: 'hull', size: [DECK_HALF_X * 2 + 2.6, 4.6, DECK_HALF_Z * 2 + 0.3] }, pos: [0.9, -0.44, 0], collider: null },
    // Mât central, au fond du pont (la voile basse masquerait le jeu : retirée).
    { id: 'mat', build: { kind: 'model', url: PIRATE.mast, hide: ['sail-a'] }, pos: [0, 0, -DECK_HALF_Z + 0.9], scale: 1.6, collider: { type: 'cylinder', radius: 0.22, halfHeight: 2.4, offset: [0, 2.4, 0] } },
  ];
  const collider: StaticCollider = { id: 'deck', pos: [0, -0.3, 0], collider: { type: 'box', hx: DECK_HALF_X, hy: 0.3, hz: DECK_HALF_Z } };
  return { pieces, collider };
}

// ---------------------------------------------------------------------------
// 2 passerelles de planches suspendues, de part et d'autre du mât (au fond de la vue).
// ---------------------------------------------------------------------------
function passerelle(id: string, x: number): OneWaySpec {
  return {
    id, top: [x, PLATFORM_Y, -1.3], halfX: 1.8, halfZ: 1.0, thickness: 0.35,
    parts: [{ build: { kind: 'model', url: PIRATE.platformPlanks }, offset: [0, -0.43 * 0.9, 0], yaw: Math.PI / 2, scale: [1.05, 0.9, 1.35] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [passerelle('gangway_left', -4.4), passerelle('gangway_right', 4.4)];
}

// ---------------------------------------------------------------------------
// Couverts (2 tonneaux, hors de la ligne de tir directe) + canon à la poupe.
// ---------------------------------------------------------------------------
function tonneau(id: string, x: number, z: number): PropSpec {
  // barrel.glb : rayon 0,67, hauteur 1,23 (base au sol) ; renversé d'un coup, il roule.
  return {
    id, kind: 'knockable', pos: [x, 0, z], scale: 1.05,
    build: { kind: 'model', url: PIRATE.barrel },
    collider: { type: 'cylinder', radius: 0.67, halfHeight: 0.615, offset: [0, 0.615, 0] },
    triggerRadius: 1.2, impulse: 5,
  };
}

function couverts(): PropSpec[] {
  return [
    tonneau('barrel_a', -1.9, 1.5),
    tonneau('barrel_b', 1.9, -1.2),
    {
      id: 'cannon', kind: 'cannon', pos: [-8.1, 0, -1.3], yaw: Math.PI / 2, scale: 1.3,
      build: { kind: 'model', url: PIRATE.cannon },
      collider: { type: 'box', hx: 0.7, hy: 0.53, hz: 1.0, offset: [0, 0.53, 0] },
      triggerRadius: 1.8, cannonAxis: [1, 0, 0], cannonRange: 16,
    },
  ];
}

// ---------------------------------------------------------------------------
// Fond : mer démontée (moteur) + autres navires et récifs en silhouette dans la brume.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  return [
    { build: { kind: 'model', url: PIRATE.shipGhost, hide: ['sail-a', 'sail-b'] }, items: [{ pos: [-38, SEA_Y - 1.5, -42], yaw: 0.5, scale: 1.9 }, { pos: [44, SEA_Y - 1.5, -34], yaw: -0.9, scale: 1.6 }] },
    { build: { kind: 'model', url: PIRATE.shipMedium }, items: [{ pos: [6, SEA_Y - 1.5, -64], yaw: 1.4, scale: 2.2 }] },
    { build: { kind: 'model', url: PIRATE.rocks }, items: [{ pos: [-26, SEA_Y - 1, -22], scale: 2.4 }, { pos: [30, SEA_Y - 1, -18], yaw: 2, scale: 2 }] },
  ];
}

export function buildGalionDef(): MapDef {
  const { pieces, collider } = plateau();
  const spawns: [Vec3, Vec3] = [[-SPAWN_X, 0.05, 0.4], [SPAWN_X, 0.05, 0.4]];
  return {
    id: 'galion',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 9 },
    respawn: [0, 0.05, 0.6],
    spawns: [{ pos: spawns[0], yawDeg: -90 }, { pos: spawns[1], yawDeg: 90 }],
    crateSpots: [[0, 0.4, 1], [-4, 0.4, 1.5], [4, 0.4, -1.5]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: couverts(),
    backdrop: fond(),
    periodicEvent: { kind: 'wave', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    seaY: SEA_Y,
    waveBand: { center: [0, 0, DECK_HALF_Z - 0.8], size: [DECK_HALF_X * 2, 1.6] },
  };
}
