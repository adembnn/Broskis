// Cuisine géante (LMAP2, l'esprit du stage « Living Room » de Smash) : les combattants, minuscules, se
// battent sur un îlot de cuisine ; ses bords francs donnent sur le carrelage, très loin en bas (zone de
// chute). Le grille-pain est un tremplin ; l'éponge balaie une bande annoncée un tour complet avant.
// Données pures : engine.ts interprète.
import { KIT, RESTAURANT } from './assets';
import type { Vec3 } from '../../core/types';
import { MAX_LEDGE_HEIGHT, type BackdropSpec, type GroundPiece, type MapDef, type OneWaySpec, type PropSpec, type StaticCollider } from './types';

// LMAP4 : le kit a été régénéré à 26 x 21 m (kit.json : rectangle arrondi 13 x 10,5, coins 1,4) ; l'ancien
// x1,4 donnait un dessus VISIBLE de 36 x 29 m pour un collider de 26,6 x 19,6 m : on tombait au milieu des
// carreaux. Échelle 1 et contour recalculé avec de vrais arrondis de 1,4 m : collider = visuel au centimètre.
const KIT_SCALE = 1;
const TOP_HALF_X = 13 * KIT_SCALE;
const TOP_HALF_Z = 10.5 * KIT_SCALE;
const CORNER_R = 1.4 * KIT_SCALE;
/** Contour exact du dessus (rectangle arrondi), 6 segments par coin, en mètres monde. */
const KIT_OUTLINE: [number, number][] = (() => {
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
  for (const [sx, sz, a0] of corners) {
    const cx = sx * (TOP_HALF_X - CORNER_R), cz = sz * (TOP_HALF_Z - CORNER_R);
    for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); out.push([cx + Math.cos(a) * CORNER_R, cz + Math.sin(a) * CORNER_R]); }
  }
  return out;
})();
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
  return { pieces, collider: { id: 'counter_top', pos: [0, 0, 0], collider: { type: 'convex', outline: KIT_OUTLINE, depth: 0.6 } } };
}

// ---------------------------------------------------------------------------
// LMAP4 — Arche de planches à découper au-dessus de la bande AVANT (celle que l'éponge balaie) : planche
// gauche (1,7 m), planche centrale (2,0 m, juste devant l'axe des apparitions, fine : 24 cm, elle ne cache
// personne), planche droite (1,8 m). Route aérienne d'un bord à l'autre, et refuge quand l'éponge passe.
// ---------------------------------------------------------------------------
const PLANCHE = { M: { url: KIT.plancheM, hx: 2.25, hz: 1.15 }, S: { url: KIT.plancheS, hx: 1.55, hz: 0.95 } };

function planche(id: string, taille: keyof typeof PLANCHE, x: number, y: number, z: number, yaw = 0): OneWaySpec {
  const p = PLANCHE[taille];
  return {
    id, top: [x, y, z], halfX: p.hx, halfZ: p.hz, thickness: 0.24,
    parts: [{ build: { kind: 'model', url: p.url, graded: false, surface: { detail: 'bois' } }, offset: [0, 0, 0], yaw }],
  };
}

const BOARD_RIGHT: Vec3 = [4.6, 1.8, 3.4];

function plateformes(): OneWaySpec[] {
  return [
    planche('board_left', 'S', -4.6, 1.7, 3.4),
    planche('board_centre', 'M', 0, PLATFORM_Y, 1.5),
    planche('board_right', 'S', BOARD_RIGHT[0], BOARD_RIGHT[1], BOARD_RIGHT[2]),
  ];
}

// ---------------------------------------------------------------------------
// LMAP4 — Couverts à hauteur de poitrine (1,2-1,4 m), en symétrie de rotation : tasse géante (arrière
// gauche) / marmite (arrière droite), flacons ketchup-moutarde (avant gauche) / sucre (avant droite) ;
// rouleau à pâtisserie (réactif : roule) au fond ; grille-pain tremplin au bord avant gauche (point chaud).
// ---------------------------------------------------------------------------
function accessoires(): PropSpec[] {
  return [
    {
      id: 'toaster', kind: 'launcher', pos: [-10, 0, 5.2],
      build: { kind: 'procedural', shape: 'toaster', size: [2.6, 1.9, 1.7] },
      collider: { type: 'box', hx: 1.3, hy: 1.0, hz: 0.9, offset: [0, 0.95, 0] },
      triggerRadius: 1.5, launchTargets: [[BOARD_RIGHT[0], BOARD_RIGHT[1] + 0.1, BOARD_RIGHT[2]], [0, 0.1, 0]], launchDuration: 1.2,
    },
    {
      id: 'rolling_pin', kind: 'knockable', pos: [0.8, 0, -5.6], yaw: 0.1, lieOnSide: true,
      build: { kind: 'procedural', shape: 'rollingPin', size: [0.45, 3.4, 0] },
      collider: { type: 'cylinder', radius: 0.45, halfHeight: 1.7, offset: [0, 0.45, 0], rollAxisZ: true },
      triggerRadius: 2, impulse: 7,
    },
    {
      // Marmite de ragoût : 0,52 m x2,5 = 1,3 m (juge-maps : il manquait un couvert à hauteur de poitrine).
      id: 'stew_pot', kind: 'decor', pos: [3.6, 0, -2.4], yaw: 0.4, scale: 2.5,
      build: { kind: 'model', url: RESTAURANT.stewPot, graded: false, surface: { detail: 'faience' } },
      collider: { type: 'box', hx: 0.7, hy: 0.26, hz: 0.5, offset: [0, 0.26, 0] },
    },
    {
      id: 'giant_mug', kind: 'decor', pos: [-3.6, 0, -2.1], yaw: 0.5,
      build: { kind: 'model', url: KIT.tasse, graded: false },
      collider: { type: 'cylinder', radius: 0.8, halfHeight: 0.65, offset: [0, 0.65, 0] },
    },
    {
      id: 'ketchup', kind: 'decor', pos: [-2.2, 0, 5.0], scale: 1.7,
      build: { kind: 'model', url: RESTAURANT.ketchup, graded: false },
      collider: { type: 'cylinder', radius: 0.15, halfHeight: 0.39, offset: [0, 0.39, 0] },
    },
    {
      id: 'mustard', kind: 'decor', pos: [-1.55, 0, 5.5], scale: 1.7,
      build: { kind: 'model', url: RESTAURANT.mustard, graded: false },
      collider: { type: 'cylinder', radius: 0.15, halfHeight: 0.39, offset: [0, 0.39, 0] },
    },
    {
      id: 'sugar_cube', kind: 'decor', pos: [2.3, 0, 5.4], yaw: 0.5,
      build: { kind: 'model', url: KIT.sucre, graded: false },
      collider: { type: 'box', hx: 0.6, hy: 0.6, hz: 0.6, offset: [0, 0.6, 0] },
    },
  ];
}

// LMAP4 : miettes et vaisselle posées à plat (sans collider, < 0,5 m) : assiette, rondelles de tomate,
// morceaux de carotte, dés de fromage — le plan de travail sert, on y cuisine.
function habillage(): BackdropSpec[] {
  const items = (l: [number, number, number, number?][]) => l.map(([x, z, k, yaw]) => ({ pos: [x, 0, z] as Vec3, scale: k, yaw: yaw ?? x * 0.7 }));
  return [
    { build: { kind: 'model', url: RESTAURANT.plate }, graded: false, items: items([[7.6, 6.6, 2.2]]) },
    { build: { kind: 'model', url: RESTAURANT.tomatoSlice }, graded: false, items: items([[-7.5, -5.5, 1.6], [6.2, -6.8, 1.4], [-5.0, 7.6, 1.5], [7.9, 6.4, 1.2]]) },
    { build: { kind: 'model', url: RESTAURANT.carrotPieces }, graded: false, items: items([[8.6, 2.4, 1.2], [-8.8, -2.8, 1.2], [2.9, 7.9, 1.1]]) },
    { build: { kind: 'model', url: RESTAURANT.cheeseChopped }, graded: false, items: items([[-6.8, -7.4, 1], [9.4, -4.4, 0.9]]) },
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
    // LMAP4 : centre (sous la planche centrale) + 2 coins au bord : près du grille-pain (avant gauche) et
    // à l'opposé (arrière droit) : pour la caisse, on s'expose au vide.
    crateSpots: [[0, 0.4, -1.0], [-11.0, 0.4, 7.8], [11.0, 0.4, -7.8]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: accessoires(),
    backdrop: [...fond(), ...habillage()],
    periodicEvent: { kind: 'sponge', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    spongeBand: { centerX: 0, length: TOP_HALF_X * 2, width: 3.2, zs: [3.6, -3.6] },
  };
}
