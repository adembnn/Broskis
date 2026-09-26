// Galion dans la tempête (LMAP2, l'esprit du stage « Pirate Ship » de Smash) : le PONT est le plateau,
// bords ouverts (aucun bastingage jouable), mâts au centre, voiles ferlées hautes. Danger : la vague fait
// gîter le pont de 12° vers la caméra (bande avant qui clignote un tour complet avant). Le canon, au fond
// du pont, balaie son axe peint quand on lui tire dessus. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { PIRATE } from './assets';
import { LOCAL_TOKENS } from './tokens';
import type { BackdropSpec, GroundPiece, MapDef, OneWaySpec, PropSpec, StaticCollider } from './types';

const DECK_HALF_X = 9;     // 18 m de pont jouable
const DECK_HALF_Z = 3.4;   // 6,8 m de large
const PLATFORM_Y = 2.4;
const SPAWN_X = 5;

// ---------------------------------------------------------------------------
// Plateau : pont en planches (pièce propre, bord franc) posé sur la coque Kenney, qui ne sert que de silhouette.
// ---------------------------------------------------------------------------
function plateau(): { pieces: GroundPiece[]; collider: StaticCollider } {
  const k = LOCAL_TOKENS.galion.shipScale;
  const pieces: GroundPiece[] = [
    { id: 'plateau_pont', build: { kind: 'procedural', shape: 'slab', size: [DECK_HALF_X * 2, 0.5, DECK_HALF_Z * 2] }, pos: [0, 0, 0], collider: null },
    // Coque : axe long tourné sur X, abaissée pour que son bastingage reste sous le pont.
    { id: 'plateau_coque', build: { kind: 'model', url: PIRATE.shipLarge }, pos: [0, -LOCAL_TOKENS.galion.deckLocalY * k, 0], yaw: Math.PI / 2, scale: k, collider: null },
  ];
  const collider: StaticCollider = { id: 'deck', pos: [0, -0.3, 0], collider: { type: 'box', hx: DECK_HALF_X, hy: 0.3, hz: DECK_HALF_Z } };
  return { pieces, collider };
}

// ---------------------------------------------------------------------------
// 2 passerelles de planches suspendues, au fond de la vue (derrière les mâts).
// ---------------------------------------------------------------------------
function passerelle(id: string, x: number): OneWaySpec {
  return {
    id, top: [x, PLATFORM_Y, -1.2], halfX: 1.8, halfZ: 1.0, thickness: 0.35,
    parts: [{ build: { kind: 'model', url: PIRATE.platformPlanks }, offset: [0, -0.43 * 0.9, 0], yaw: Math.PI / 2, scale: [1.05, 0.9, 1.35] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [passerelle('gangway_left', -4.6), passerelle('gangway_right', 4.6)];
}

// ---------------------------------------------------------------------------
// Couverts (2 caisses) + canon au fond du pont.
// ---------------------------------------------------------------------------
function caisse(id: string, x: number, z: number): PropSpec {
  return {
    id, kind: 'decor', pos: [x, 0, z], scale: 1.5,
    build: { kind: 'model', url: PIRATE.crate },
    collider: { type: 'box', hx: 0.54, hy: 0.385, hz: 0.65, offset: [0, 0.385, 0] },
  };
}

function couverts(): PropSpec[] {
  return [
    caisse('crate_a', -1.9, 1.3),
    caisse('crate_b', 1.9, -1.3),
    {
      id: 'cannon', kind: 'cannon', pos: [-8, 0, -2.3], yaw: Math.PI / 2, scale: 1.3,
      build: { kind: 'model', url: PIRATE.cannon },
      collider: { type: 'box', hx: 0.7, hy: 0.53, hz: 1.0, offset: [0, 0.53, 0] },
      triggerRadius: 1.8, cannonAxis: [1, 0, 0], cannonRange: 15,
    },
  ];
}

// ---------------------------------------------------------------------------
// Fond : autres navires en silhouette dans la brume.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  return [
    { build: { kind: 'model', url: PIRATE.shipGhost }, items: [{ pos: [-34, -5, -38], yaw: 0.5, scale: 1.8 }, { pos: [40, -6, -30], yaw: -0.9, scale: 1.5 }] },
    { build: { kind: 'model', url: PIRATE.shipMedium }, items: [{ pos: [8, -6, -58], yaw: 1.4, scale: 2 }] },
    { build: { kind: 'model', url: PIRATE.rocks }, items: [{ pos: [-22, -7, -20], scale: 2.2 }, { pos: [26, -7, -16], yaw: 2, scale: 1.8 }] },
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
    seaY: -5.5,
    waveBand: { center: [0, 0, DECK_HALF_Z - 0.8], size: [DECK_HALF_X * 2, 1.6] },
  };
}
