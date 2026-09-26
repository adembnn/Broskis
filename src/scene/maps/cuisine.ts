// Cuisine géante (LMAP2, l'esprit du stage « Living Room » de Smash) : les combattants, minuscules, se
// battent sur un îlot de cuisine ; ses bords francs donnent sur le carrelage, très loin en bas (zone de
// chute). Le grille-pain est un tremplin ; l'éponge balaie une bande annoncée un tour complet avant.
// Données pures : engine.ts interprète.
import { KIT, RESTAURANT } from './assets';
import { MAX_LEDGE_HEIGHT, type BackdropSpec, type GroundPiece, type MapDef, type OneWaySpec, type PropSpec, type StaticCollider } from './types';

// LMAP3 : îlot carrelé du kit (plateau_cuisine, 19 x 14 m) agrandi x1,4 = 26,6 x 19,6 m.
const KIT_SCALE = 1.4;
const TOP_HALF_X = 9.5 * KIT_SCALE;
const TOP_HALF_Z = 7 * KIT_SCALE;
/** Contour exact du dessus (kit.json : rectangle arrondi 9,5 x 7, coins 1,4), en mètres monde. */
const KIT_OUTLINE: [number, number][] = [
  [9.5, 0], [9.5, -3.975], [9.453, -5.958], [7.949, -7], [-7.949, -7], [-9.453, -5.958], [-9.5, -3.975],
  [-9.5, 3.975], [-9.453, 5.958], [-7.949, 7], [7.949, 7], [9.453, 5.958], [9.5, 3.975],
];
const COUNTER_H = 14;      // hauteur de l'îlot : le sol de la cuisine est loin
const PLATFORM_Y = MAX_LEDGE_HEIGHT;
const SPAWN_X = 6.25;      // 12,5 m entre les apparitions

// ---------------------------------------------------------------------------
// Plateau : l'îlot (KayKit Restaurant, agrandi) ; seul le dessus est jouable.
// ---------------------------------------------------------------------------
function plateau(): { pieces: GroundPiece[]; collider: StaticCollider } {
  // kitchencounter_straight_A : x ±1, y [0,1], z [-1, 1.04] (base au sol), agrandi et un peu en retrait
  // sous le billot : le billot déborde comme un vrai plan de travail.
  const bx = TOP_HALF_X - 0.8, bz = (TOP_HALF_Z - 0.8) / 1.02;
  const pieces: GroundPiece[] = [
    // Dessus carrelé + tiroirs tout autour (kit LKIT, modélisé dans Blender), faïence mouchetée.
    { id: 'plateau_ilot_kit', build: { kind: 'model', url: KIT.plateauCuisine, graded: false, surface: { detail: 'faience' } }, pos: [0, 0, 0], scale: KIT_SCALE, collider: null },
    // Le meuble continue jusqu'au sol lointain (placards KayKit).
    { id: 'plateau_ilot', build: { kind: 'model', url: RESTAURANT.counter }, pos: [0, -COUNTER_H - 6, -0.02 * bz], scale: [bx, COUNTER_H, bz], collider: null, tint: 'matiere' },
  ];
  const outline = KIT_OUTLINE.map(([x, z]) => [x * KIT_SCALE, z * KIT_SCALE] as [number, number]);
  return { pieces, collider: { id: 'counter_top', pos: [0, 0, 0], collider: { type: 'convex', outline, depth: 0.6 } } };
}

// ---------------------------------------------------------------------------
// 2 planches à découper flottantes, au fond de la vue.
// ---------------------------------------------------------------------------
function planche(id: string, x: number, z: number): OneWaySpec {
  // planche_L (kit) : planche à découper en hêtre de 24 cm, rainure sombre, dessus à y = 0, 6,2 x 2,8 m.
  return {
    id, top: [x, PLATFORM_Y, z], halfX: 3.05, halfZ: 1.35, thickness: 0.24,
    parts: [{ build: { kind: 'model', url: KIT.plancheL, graded: false, surface: { detail: 'bois' } }, offset: [0, 0, 0] }],
  };
}

function plateformes(): OneWaySpec[] {
  return [planche('board_left', -6.8, -4), planche('board_right', 6.8, -4)];
}

// ---------------------------------------------------------------------------
// Grille-pain tremplin, rouleau (roule quand on le touche), un bocal comme couvert.
// ---------------------------------------------------------------------------
function accessoires(): PropSpec[] {
  return [
    {
      id: 'toaster', kind: 'launcher', pos: [-10, 0, 5.2],
      build: { kind: 'procedural', shape: 'toaster', size: [2.6, 1.9, 1.7] },
      collider: { type: 'box', hx: 1.3, hy: 1.0, hz: 0.9, offset: [0, 0.95, 0] },
      triggerRadius: 1.5, launchTargets: [[6.8, PLATFORM_Y + 0.1, -4], [0, 0.1, 0]], launchDuration: 1.2,
    },
    {
      id: 'rolling_pin', kind: 'knockable', pos: [3.4, 0, 4.4], yaw: 0.35, lieOnSide: true,
      build: { kind: 'procedural', shape: 'rollingPin', size: [0.45, 3.4, 0] },
      collider: { type: 'cylinder', radius: 0.45, halfHeight: 1.7, offset: [0, 0.45, 0], rollAxisZ: true },
      triggerRadius: 2, impulse: 7,
    },
    // Couverts à mi-hauteur : marmite de ragoût géante et flacons ketchup / moutarde (KayKit Restaurant).
    {
      id: 'stew_pot', kind: 'decor', pos: [3.6, 0, -2.8], yaw: 0.4, scale: 2,
      build: { kind: 'model', url: RESTAURANT.stewPot, graded: false, surface: { detail: 'faience' } },
      collider: { type: 'box', hx: 0.7, hy: 0.26, hz: 0.5, offset: [0, 0.26, 0] },
    },
    {
      id: 'ketchup', kind: 'decor', pos: [-3.6, 0, 2.6], scale: 1.8,
      build: { kind: 'model', url: RESTAURANT.ketchup, graded: false },
      collider: { type: 'cylinder', radius: 0.15, halfHeight: 0.39, offset: [0, 0.39, 0] },
    },
    {
      id: 'mustard', kind: 'decor', pos: [-2.9, 0, 3.3], scale: 1.8,
      build: { kind: 'model', url: RESTAURANT.mustard, graded: false },
      collider: { type: 'cylinder', radius: 0.15, halfHeight: 0.39, offset: [0, 0.39, 0] },
    },
  ];
}

// ---------------------------------------------------------------------------
// Fond (LSKY) : le panorama peint (sky.ts) porte le sol, les murs, la fenêtre et les meubles ; les plans de
// travail latéraux (parallaxe) sont dans dressing.ts.
// ---------------------------------------------------------------------------
function fond(): BackdropSpec[] {
  return []; // LSKY : sol, murs et meubles sont peints dans le panorama
}

export function buildCuisineDef(): MapDef {
  const { pieces, collider } = plateau();
  return {
    id: 'cuisine',
    voidY: -5,
    arena: { center: [0, 0, 0], radius: 13 },
    respawn: [0, 0.05, 0],
    spawns: [{ pos: [-SPAWN_X, 0.05, 0], yawDeg: -90 }, { pos: [SPAWN_X, 0.05, 0], yawDeg: 90 }],
    crateSpots: [[0, 0.4, 0], [-5, 0.4, -3.5], [5, 0.4, 3.5]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: accessoires(),
    backdrop: fond(),
    periodicEvent: { kind: 'sponge', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    spongeBand: { centerX: 0, length: TOP_HALF_X * 2, width: 3.2, zs: [3.6, -3.6] },
  };
}
