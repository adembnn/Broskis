// Archipel qui s'effrite (LMAP2 puis LMAP3, façon Smash « Battlefield ») : un plateau d'hexagones herbeux
// (26 m, 6 anneaux) posé sur un socle rocheux modélisé (kit LKIT), suspendu au dessus d'une mer de nuages,
// bords francs, 2 plateformes de pierre flottantes traversables, 2 tonneaux de poudre + 1 muret en ruine comme
// couverts. Danger : la catapulte, sur son île au fond, pilonne l'anneau extérieur (annoncé un tour
// complet avant par l'anneau qui clignote) -> l'arène rétrécit. Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { HEX, KIT, PIRATE } from './assets';
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
// LMAP4 — Route aérienne en 3 marches au fond de la vue (façon Battlefield) : ruine ouest (1,7 m), balcon
// central (2,0 m, surplombe le centre sans couvrir l'axe des apparitions), ruine est (1,8 m). Écarts de 0,5 m :
// on traverse l'arène par le haut d'un saut à l'autre. Les blocs de pierre sont écrasés en hauteur (x0,4) :
// rien ne pend à hauteur de tête sous une plateforme.
// ---------------------------------------------------------------------------
const PIERRE = { L: { url: KIT.plateformePierreL, hx: 3.05, hz: 1.35 }, M: { url: KIT.plateformePierreM, hx: 2.25, hz: 1.15 }, S: { url: KIT.plateformePierreS, hx: 1.55, hz: 0.95 } };
const PIERRE_ECRASEE: Vec3 = [1, 0.4, 1];

function ruine(id: string, taille: keyof typeof PIERRE, x: number, y: number, z: number): OneWaySpec {
  const p = PIERRE[taille];
  return {
    id, top: [x, y, z], halfX: p.hx, halfZ: p.hz, thickness: 0.3,
    parts: [{ build: { kind: 'model', url: p.url, graded: false, surface: { detail: 'pierre' } }, offset: [0, 0, 0], scale: PIERRE_ECRASEE }],
  };
}

function plateformes(): OneWaySpec[] {
  return [
    ruine('ruin_west', 'S', -4.4, 1.7, -4.3),
    ruine('ruin_balcony', 'M', 0, PLATFORM_Y, -2.5),
    ruine('ruin_east', 'S', 4.5, 1.8, -4.6),
  ];
}

// ---------------------------------------------------------------------------
// LMAP4 — Couverts (1,2-1,5 m) en symétrie de rotation autour du centre, tous sur les anneaux qui ne tombent
// jamais (<= 3), aucun sur l'axe des apparitions (z = 0) : 2 tonneaux de poudre (réactifs), muret en ruine
// devant, rocher à droite, muret bas à gauche.
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
    tonneau('powder_barrel_a', -2.7, 2.5), tonneau('powder_barrel_b', 3.2, -1.4),
    {
      id: 'ruin_wall', kind: 'decor', pos: [-0.5, 0, 4.0], yaw: 0.12, scale: 1.25,
      build: { kind: 'model', url: KIT.muret, graded: false, surface: { detail: 'pierre' } },
      collider: { type: 'box', hx: 1.6, hy: 0.55, hz: 0.31, offset: [0, 0.55, 0] },
    },
    {
      id: 'cover_rock', kind: 'decor', pos: [4.1, 0, 2.1], yaw: -0.6,
      build: { kind: 'model', url: KIT.rocherCouvert, graded: false, surface: { detail: 'pierre' } },
      collider: { type: 'box', hx: 1.05, hy: 0.68, hz: 0.72, offset: [0, 0.68, 0] },
    },
    {
      id: 'low_wall', kind: 'decor', pos: [-3.8, 0, -1.9], yaw: 0.25,
      build: { kind: 'model', url: KIT.muretBas, graded: false, surface: { detail: 'pierre' } },
      collider: { type: 'box', hx: 1.56, hy: 0.65, hz: 0.41, offset: [0, 0.65, 0] },
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
// LMAP4 : touffes d'herbe et gravats au pied des ruines et des couverts (sans collider, anneaux <= 3) : le
// plateau raconte une place forte en ruine, pas un carrelage vert.
function habillage(): BackdropSpec[] {
  const herbes: [number, number, number][] = [[-1.6, 4.5, 0.7], [0.8, 3.7, 0.55], [4.9, 1.2, 0.6], [3.3, 2.9, 0.5], [-4.8, -1.5, 0.6], [-2.9, -2.4, 0.5], [-3.3, 2.0, 0.45], [2.5, -1.9, 0.5], [1.1, -4.6, 0.6]];
  const gravats: [number, number, number][] = [[0.9, 4.4, 1.6], [-1.9, 3.7, 1.3], [4.9, 2.9, 1.4], [-4.9, -2.3, 1.2]];
  return [
    { build: { kind: 'model', url: PIRATE.grassPlant }, items: herbes.map(([x, z, k], i) => ({ pos: [x, 0, z] as Vec3, yaw: i * 1.7, scale: k })) },
    { build: { kind: 'model', url: HEX.rubble }, items: gravats.map(([x, z, k], i) => ({ pos: [x, 0, z] as Vec3, yaw: i * 2.1, scale: k })) },
  ];
}

function cailloux(): BackdropSpec[] {
  const out: BackdropSpec['items'][] = [[], [], []];
  let s = 23;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90 && out.flat().length < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 1.5 + rnd() * (SOCLE_PAR_ANNEAU * MIN_RING);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(Math.abs(x) - SPAWN_X, z) < 1.8) continue;
    if (Math.hypot(x - 3.2, z + 1.4) < 0.8 || Math.hypot(x + 2.7, z - 2.5) < 0.8) continue; // pas dans les tonneaux
    out[i % 3]!.push({ pos: [x, 0, z] as Vec3, yaw: rnd() * 6.28, scale: 0.8 + rnd() * 0.9 });
  }
  return [HEX.pebbleA, HEX.pebbleC, HEX.pebbleE].map((url, i) => ({ build: { kind: 'model', url }, items: out[i]! }));
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
    // LMAP4 : centre disputé + 2 caisses au bord de l'îlot final (anneau 3), l'une à côté du tonneau de poudre
    // ouest (on risque l'explosion pour la prendre), l'autre sous la route aérienne est.
    crateSpots: [[0, 0.4, 0.6], [-3.6, 0.4, 4.4], [2.2, 0.4, -4.9]],
    tiles,
    tileModel: { kind: 'model', url: HEX.grass },
    tileHalfExtents: [1, 0.5, HEX_R],
    tileShape: 'hex',
    tileSurface: { detail: 'herbe', side: 'pierre' },
    tileGrade: PLATEAU.archipelDalles,
    minRing: MIN_RING,
    ground: underside,
    extraColliders: [],
    platforms: plateformes(),
    props: couverts(),
    backdrop: [...fond(), ...cailloux(), ...habillage()],
    periodicEvent: { kind: 'ring', everyTurns: 2, firstTurn: 4, leadTurns: 2, maxEvents: RINGS - MIN_RING },
    catapult: { build: { kind: 'model', url: HEX.catapultTower }, pos: [-15, -1.5, -21], scale: 4.5 },
    catapultAmmo: { kind: 'model', url: HEX.catapultProjectile },
  };
}
