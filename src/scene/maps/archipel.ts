// Archipel qui s'effrite (LMAP2 puis LMAP3, façon Smash « Battlefield ») : un plateau d'hexagones herbeux
// (26 m, 6 anneaux) posé sur un socle rocheux modélisé (kit LKIT), suspendu au dessus d'une mer de nuages,
// bords francs, 2 plateformes de pierre flottantes traversables, 2 tonneaux de poudre + 1 muret en ruine comme
// couverts. Danger : la catapulte, sur son île au fond, pilonne l'anneau extérieur (annoncé un tour
// complet avant par l'anneau qui clignote) -> l'arène rétrécit. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { HEX, KIT } from './assets';
import { axialToWorld, HEX_R, hexDisk } from './hex';
import { PLATEAU } from './tokens';
import { MAX_LEDGE_HEIGHT, type BackdropSpec, type GroundPiece, type MapDef, type OneWaySpec, type PropSpec, type TileSpec } from './types';

/** Géométrie jouable (m). Plateau : disque hexagonal de rayon 6 = 26 m de large (LMAP3 : x1,45). */
const RINGS = 6;
const MIN_RING = 3;               // îlot final : 14 m de large
const PLATFORM_Y = MAX_LEDGE_HEIGHT; // dessus des plateformes de pierre (double saut)
const SPAWN_X = 6.25;             // 12,5 m entre les apparitions
/** Socle rocheux du kit (socle_hex_4) : apothème = SOCLE_BASE + SOCLE_PAR_ANNEAU x anneaux (kit.json). */
const SOCLE_BASE = 0.303;
const SOCLE_PAR_ANNEAU = 1.732;
const SOCLE_MODELE = 7.2315;

// ---------------------------------------------------------------------------
// Plateau principal : dalles (tombent par anneau) + dessous rocheux sous le cœur qui reste.
// ---------------------------------------------------------------------------
function plateau(): { tiles: TileSpec[]; underside: GroundPiece[] } {
  const tiles = hexDisk(RINGS).map(({ q, r, ring }) => {
    const [x, z] = axialToWorld({ q, r });
    return { id: `hex_${q}_${r}`, pos: [x, 0, z] as Vec3, ring };
  });
  // Socle en strates rocheuses sous les dalles (bas des dalles KayKit = -1) ; il se rétracte avec les anneaux.
  const k = (SOCLE_BASE + SOCLE_PAR_ANNEAU * RINGS) / SOCLE_MODELE;
  const underside: GroundPiece[] = [{
    id: 'plateau_socle', pos: [0, -1, 0], scale: [k, 1.25, k], collider: null,
    build: { kind: 'model', url: KIT.socleHex4, graded: false, surface: { detail: 'pierre' } },
    shrinkWithRing: { base: SOCLE_BASE, perRing: SOCLE_PAR_ANNEAU, modelApothem: SOCLE_MODELE },
  }];
  return { tiles, underside };
}

// ---------------------------------------------------------------------------
// 2 ruines flottantes, au fond de la vue 3/4 (jamais entre la caméra et les combattants).
// ---------------------------------------------------------------------------
function ruine(id: string, x: number, z: number): OneWaySpec {
  // plateforme_pierre_L (kit) : dalle d'herbe sur bloc de pierre taillée, dessus à y = 0, 6,2 x 2,8 m.
  return {
    id, top: [x, PLATFORM_Y, z], halfX: 3.05, halfZ: 1.35, thickness: 0.3,
    parts: [{ build: { kind: 'model', url: KIT.plateformePierreL, graded: false, surface: { detail: 'pierre' } }, offset: [0, 0, 0] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [ruine('ruin_left', -6.8, -4.6), ruine('ruin_right', 6.8, -4.6)];
}

// ---------------------------------------------------------------------------
// Couverts : 2 tonneaux de poudre, symétriques par rapport au centre, hors de la ligne de tir directe.
// ---------------------------------------------------------------------------
function tonneau(id: string, x: number, z: number): PropSpec {
  return {
    id, kind: 'explosive', pos: [x, 0, z], scale: 1.1,
    build: { kind: 'model', url: KIT.tonneau, graded: false, surface: { detail: 'bois' } },
    collider: { type: 'cylinder', radius: 0.47, halfHeight: 0.55, offset: [0, 0.55, 0] },
    triggerRadius: 1.4, blastRadius: 3, impulse: 9,
  };
}

function couverts(): PropSpec[] {
  return [
    tonneau('powder_barrel_a', -2.8, 2.4), tonneau('powder_barrel_b', 2.8, -2.4),
    // Muret en ruine au fond (1,1 m : la tête dépasse), à l'écart de la ligne de tir.
    {
      id: 'ruin_wall', kind: 'decor', pos: [0.5, 0, -6.2], yaw: 0.25,
      build: { kind: 'model', url: KIT.muret, graded: false, surface: { detail: 'pierre' } },
      collider: { type: 'box', hx: 1.6, hy: 0.55, hz: 0.31, offset: [0, 0.55, 0] },
    },
  ];
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

// ---------------------------------------------------------------------------
// Cailloux épars (KayKit, 10-30 cm, sans collider) sur les anneaux qui ne tombent jamais : le plateau a une
// matière, pas un carrelage. Jamais sur les apparitions ni au centre.
// ---------------------------------------------------------------------------
function cailloux(): BackdropSpec[] {
  const out: BackdropSpec['items'][] = [[], [], []];
  let s = 23;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90 && out.flat().length < 36; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1.5 + rnd() * (SOCLE_PAR_ANNEAU * MIN_RING);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(Math.abs(x) - SPAWN_X, z) < 1.8) continue;
    out[i % 3]!.push({ pos: [x, 0, z] as Vec3, yaw: rnd() * 6.28, scale: 1 + rnd() * 1.2 });
  }
  return [HEX.pebbleA, HEX.pebbleC, HEX.pebbleE].map((url, i) => ({ build: { kind: 'model', url }, items: out[i]!, graded: false }));
}

export function buildArchipelDef(): MapDef {
  const { tiles, underside } = plateau();
  return {
    id: 'archipel',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 13 },
    respawn: [0, 0.05, 0],
    spawns: [
      { pos: [-SPAWN_X, 0.05, 0], yawDeg: -90 },
      { pos: [SPAWN_X, 0.05, 0], yawDeg: 90 },
    ],
    crateSpots: [[0, 0.4, 0], [-4.5, 0.4, 4], [4.5, 0.4, -4]],
    tiles,
    tileModel: { kind: 'model', url: HEX.grass },
    tileHalfExtents: [1, 0.5, HEX_R],
    tileShape: 'hex',
    tileSurface: { detail: 'herbe' },
    tileGrade: PLATEAU.archipelDalles,
    minRing: MIN_RING,
    ground: underside,
    extraColliders: [],
    platforms: plateformes(),
    props: couverts(),
    backdrop: [...fond(), ...cailloux()],
    periodicEvent: { kind: 'ring', everyTurns: 2, firstTurn: 4, leadTurns: 2, maxEvents: RINGS - MIN_RING },
    catapult: { build: { kind: 'model', url: HEX.catapultTower }, pos: [-15, -1.5, -21], scale: 4.5 },
    catapultAmmo: { kind: 'model', url: HEX.catapultProjectile },
  };
}
