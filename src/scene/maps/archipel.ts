// Archipel qui s'effrite (LMAP2, façon Smash « Battlefield ») : un plateau d'hexagones herbeux suspendu au
// dessus d'une mer de nuages, bords francs, 2 ruines flottantes traversables, 2 tonneaux de poudre comme
// seuls couverts. Danger : la catapulte, sur son île au fond, pilonne l'anneau extérieur (annoncé un tour
// complet avant par l'anneau qui clignote) -> l'arène rétrécit. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { HEX, PROPS } from './assets';
import { axialToWorld, HEX_R, hexDisk } from './hex';
import type { BackdropSpec, MapDef, OneWaySpec, PropSpec, TileSpec, VisualPart } from './types';

/** Géométrie jouable (m). Plateau : disque hexagonal de rayon 4 = 18 m de large. */
const RINGS = 4;
const PLATFORM_Y = 2.3;       // dessus des ruines flottantes (double saut, règles v2)
const SPAWN_X = 5;            // 10 m entre les apparitions

// ---------------------------------------------------------------------------
// Plateau principal : dalles (tombent par anneau) + dessous rocheux sous le cœur qui reste.
// ---------------------------------------------------------------------------
function plateau(): { tiles: TileSpec[]; underside: VisualPart[] } {
  const tiles = hexDisk(RINGS).map(({ q, r, ring }) => {
    const [x, z] = axialToWorld({ q, r });
    return { id: `hex_${q}_${r}`, pos: [x, 0, z] as Vec3, ring };
  });
  const underside: VisualPart[] = [
    { build: { kind: 'procedural', shape: 'rock', size: [3.3, 8, 0.4] }, offset: [0, -1, 0] },
  ];
  return { tiles, underside };
}

// ---------------------------------------------------------------------------
// 2 ruines flottantes, au fond de la vue 3/4 (jamais entre la caméra et les combattants).
// ---------------------------------------------------------------------------
function ruine(id: string, x: number, z: number): OneWaySpec {
  return {
    id, top: [x, PLATFORM_Y, z], halfX: 2, halfZ: 1, thickness: 0.4,
    parts: [
      { build: { kind: 'model', url: HEX.grass }, offset: [-1, 0, 0], scale: [1, 0.4, 1] },
      { build: { kind: 'model', url: HEX.grass }, offset: [1, 0, 0], scale: [1, 0.4, 1] },
    ],
  };
}

function plateformes(): OneWaySpec[] {
  return [ruine('ruin_left', -3.6, -3.2), ruine('ruin_right', 3.6, -3.2)];
}

// ---------------------------------------------------------------------------
// Couverts : 2 tonneaux de poudre, symétriques par rapport au centre, hors de la ligne de tir directe.
// ---------------------------------------------------------------------------
function tonneau(id: string, x: number, z: number): PropSpec {
  return {
    id, kind: 'explosive', pos: [x, 0, z],
    build: { kind: 'model', url: PROPS, node: 'barrel_small' },
    collider: { type: 'cylinder', radius: 0.47, halfHeight: 0.55, offset: [0, 0.55, 0] },
    triggerRadius: 1.4, blastRadius: 3, impulse: 9,
  };
}

function couverts(): PropSpec[] {
  return [tonneau('powder_barrel_a', -1.8, 1.4), tonneau('powder_barrel_b', 1.8, -1.4)];
}

// ---------------------------------------------------------------------------
// Fond (LSKY) : le panorama peint (sky.ts) porte la mer de nuages et les îles lointaines. Ici, seulement
// l'île de la catapulte (gameplay) ; la parallaxe de mi-distance (2 îles habitées) est dans dressing.ts.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  return [
    // Île de la catapulte (au fond à gauche) : son rocher.
    { build: { kind: 'procedural', shape: 'rock', size: [3.2, 7, 0.4] }, items: [{ pos: [-15, -1.5, -21], scale: 1 }] },
    { build: { kind: 'model', url: HEX.grass }, items: [{ pos: [-15, -1.5, -21], scale: [1.7, 0.8, 1.7] }] },
  ];
}

export function buildArchipelDef(): MapDef {
  const { tiles, underside } = plateau();
  return {
    id: 'archipel',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 9 },
    respawn: [0, 0.05, 0],
    spawns: [
      { pos: [-SPAWN_X, 0.05, 0], yawDeg: -90 },
      { pos: [SPAWN_X, 0.05, 0], yawDeg: 90 },
    ],
    crateSpots: [[0, 0.4, 0], [-3, 0.4, 2.5], [3, 0.4, -2.5]],
    tiles,
    tileModel: { kind: 'model', url: HEX.grass },
    tileHalfExtents: [1, 0.5, HEX_R],
    tileShape: 'hex',
    minRing: 2,
    ground: underside.map((p, i) => ({ id: `plateau_roche_${i}`, build: p.build, pos: p.offset, scale: p.scale, collider: null })),
    extraColliders: [],
    platforms: plateformes(),
    props: couverts(),
    backdrop: fond(),
    periodicEvent: { kind: 'ring', everyTurns: 2, firstTurn: 4, leadTurns: 2, maxEvents: RINGS - 1 },
    catapult: { build: { kind: 'model', url: HEX.catapultTower }, pos: [-15, -1.5, -21], scale: 4.5 },
    catapultAmmo: { kind: 'model', url: HEX.catapultProjectile },
  };
}
