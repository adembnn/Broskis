// Cuisine géante (LMAP2, l'esprit du stage « Living Room » de Smash) : les combattants, minuscules, se
// battent sur un îlot de cuisine ; ses bords francs donnent sur le carrelage, très loin en bas (zone de
// chute). Le grille-pain est un tremplin ; l'éponge balaie une bande annoncée un tour complet avant.
// Données pures : engine.ts interprète.
import type { Vec3 } from '../../core/types';
import { RESTAURANT } from './assets';
import type { BackdropSpec, GroundPiece, MapDef, OneWaySpec, PropSpec, StaticCollider } from './types';

const TOP_HALF_X = 9;      // plan de travail : 18 m
const TOP_HALF_Z = 5.6;    // 11,2 m de profondeur
const COUNTER_H = 14;      // hauteur de l'îlot : le sol de la cuisine est loin
const PLATFORM_Y = 2.4;
const SPAWN_X = 5;

// ---------------------------------------------------------------------------
// Plateau : l'îlot (KayKit Restaurant, agrandi) ; seul le dessus est jouable.
// ---------------------------------------------------------------------------
function plateau(): { pieces: GroundPiece[]; collider: StaticCollider } {
  // kitchencounter_straight_A : x ±1, y [0,1], z [-1, 1.04] (base au sol), agrandi et un peu en retrait
  // sous le billot : le billot déborde comme un vrai plan de travail.
  const bx = TOP_HALF_X - 0.4, bz = (TOP_HALF_Z - 0.4) / 1.02;
  const pieces: GroundPiece[] = [
    { id: 'plateau_billot', build: { kind: 'procedural', shape: 'deck', size: [TOP_HALF_X * 2, 0.6, TOP_HALF_Z * 2] }, pos: [0, 0, 0], collider: null },
    { id: 'plateau_ilot', build: { kind: 'model', url: RESTAURANT.counter }, pos: [0, -COUNTER_H - 0.6, -0.02 * bz], scale: [bx, COUNTER_H, bz], collider: null, tint: 'matiere' },
  ];
  return { pieces, collider: { id: 'counter_top', pos: [0, -0.5, 0], collider: { type: 'box', hx: TOP_HALF_X, hy: 0.5, hz: TOP_HALF_Z } } };
}

// ---------------------------------------------------------------------------
// 2 planches à découper flottantes, au fond de la vue.
// ---------------------------------------------------------------------------
function planche(id: string, x: number): OneWaySpec {
  // cuttingboard : x ±0.75, y [0, 0.15], z ±0.5.
  return {
    id, top: [x, PLATFORM_Y, -2.4], halfX: 1.9, halfZ: 1.1, thickness: 0.35,
    parts: [{ build: { kind: 'model', url: RESTAURANT.cuttingBoard }, offset: [0, -0.35, 0], scale: [2.55, 2.3, 2.2] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [planche('board_left', -4.2), planche('board_right', 4.2)];
}

// ---------------------------------------------------------------------------
// Grille-pain tremplin, rouleau (roule quand on le touche), un bocal comme couvert.
// ---------------------------------------------------------------------------
function accessoires(): PropSpec[] {
  return [
    {
      id: 'toaster', kind: 'launcher', pos: [-7.2, 0, 3.2],
      build: { kind: 'procedural', shape: 'toaster', size: [2.2, 1.6, 1.4] },
      collider: { type: 'box', hx: 1.1, hy: 0.9, hz: 0.8, offset: [0, 0.8, 0] },
      triggerRadius: 1.3, launchTargets: [[4.2, PLATFORM_Y + 0.1, -2.4], [0, 0.1, 0]], launchDuration: 1.1,
    },
    {
      id: 'rolling_pin', kind: 'knockable', pos: [2.2, 0, 2.6], yaw: 0.35, lieOnSide: true,
      build: { kind: 'procedural', shape: 'rollingPin', size: [0.42, 3.4, 0] },
      collider: { type: 'cylinder', radius: 0.42, halfHeight: 1.7, offset: [0, 0.42, 0], rollAxisZ: true },
      triggerRadius: 2, impulse: 7,
    },
    {
      id: 'jar', kind: 'decor', pos: [-2.2, 0, -1.5], scale: 2.4,
      build: { kind: 'model', url: RESTAURANT.jar },
      collider: { type: 'cylinder', radius: 0.25, halfHeight: 0.375, offset: [0, 0.375, 0] },
    },
  ];
}

// ---------------------------------------------------------------------------
// Fond : meubles géants dans la pénombre (frigo, four, placards) et le carrelage tout en bas.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  const floor: BackdropSpec['items'] = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 3; j++) floor.push({ pos: [i * 16, -COUNTER_H - 2, j * 16] as Vec3, scale: [4, 1, 4] });
  return [
    { build: { kind: 'model', url: RESTAURANT.floor }, items: floor },
    { build: { kind: 'model', url: RESTAURANT.fridge }, items: [{ pos: [-40, -COUNTER_H - 2, -50], yaw: 0.25, scale: 14 }] },
    { build: { kind: 'model', url: RESTAURANT.oven }, items: [{ pos: [2, -COUNTER_H - 2, -58], scale: 14 }, { pos: [30, -COUNTER_H - 2, -58], scale: 14 }] },
    { build: { kind: 'model', url: RESTAURANT.cabinet }, items: [{ pos: [2, -COUNTER_H - 2, -62], scale: 14 }, { pos: [30, -COUNTER_H - 2, -62], scale: 14 }] },
    { build: { kind: 'model', url: RESTAURANT.wallWindow }, items: [{ pos: [-18, -COUNTER_H - 2, -68], scale: 15 }, { pos: [42, -COUNTER_H - 2, -68], scale: 15 }] },
  ];
}

export function buildCuisineDef(): MapDef {
  const { pieces, collider } = plateau();
  return {
    id: 'cuisine',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 9 },
    respawn: [0, 0.05, 0],
    spawns: [{ pos: [-SPAWN_X, 0.05, 0], yawDeg: -90 }, { pos: [SPAWN_X, 0.05, 0], yawDeg: 90 }],
    crateSpots: [[0, 0.4, 0], [-4, 0.4, 2.5], [4, 0.4, -2.5]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: accessoires(),
    backdrop: fond(),
    periodicEvent: { kind: 'sponge', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    spongeBand: { centerX: 0, length: TOP_HALF_X * 2, width: 3, zs: [2.6, -2.6] },
  };
}
