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
      // LMAP4 : pas d'ombre (les mâts écrêtés dans le shader projetaient encore leur ombre pleine sur le pont),
      // pavillons retirés.
      id: 'plateau_coque', pos: [DECK_SHIFT - 2.2, -g.deckLocalY * g.shipScale, 0], yaw: -Math.PI / 2, scale: g.shipScale, collider: null, tint: 'sol', castShadow: false,
      build: { kind: 'model', url: PIRATE.shipLarge, hide: ['sail-a', 'sail-b', 'flag-c'], surface: { detail: 'bois', clampY: g.deckLocalY - 0.05 } },
    },
    // Mât au fond du pont (la voile basse masquerait le jeu : retirée).
    // LMAP4 : pavillon du mât retiré (tache noire à 13,5 m dans le ciel des deux vues).
    { id: 'mat', build: { kind: 'model', url: PIRATE.mast, hide: ['sail-a', 'flag-c'], graded: false }, pos: [0, 0, -DECK_HALF_Z + 1.1], scale: 2, collider: { type: 'cylinder', radius: 0.22, halfHeight: 2.4, offset: [0, 2.4, 0] } },
  ];
  // Collider = exactement le contour du pont dessiné (prisme convexe) : aucun rebord invisible à la proue.
  const collider: StaticCollider = { id: 'deck', pos: [DECK_SHIFT, 0, 0], collider: { type: 'convex', outline: shipOutline(DECK_LEN, DECK_HALF_Z * 2), depth: 0.6 } };
  return { pieces, collider };
}

// ---------------------------------------------------------------------------
// LMAP4 — Route aérienne au fond du pont : passerelle bâbord (1,7 m), hune autour du mât (2,0 m, au-dessus du
// centre, décalée de l'axe des apparitions), passerelle tribord (1,8 m). Rien au-dessus des apparitions ni dans
// le couloir des caméras d'épaule (|x| > 6, z proche de 0). Radeaux écrasés en hauteur (x0,55) : rien ne pend
// à hauteur de tête.
// ---------------------------------------------------------------------------
const RADEAU = { M: { url: KIT.radeauM, hx: 2.25, hz: 1.15 }, S: { url: KIT.radeauS, hx: 1.55, hz: 0.95 } };
const RADEAU_ECRASE: Vec3 = [1, 0.55, 1];

function passerelle(id: string, taille: keyof typeof RADEAU, x: number, y: number, z: number): OneWaySpec {
  const r = RADEAU[taille];
  return {
    id, top: [x, y, z], halfX: r.hx, halfZ: r.hz, thickness: 0.3,
    parts: [{ build: { kind: 'model', url: r.url, graded: false, surface: { detail: 'bois' } }, offset: [0, 0, 0], scale: RADEAU_ECRASE }],
  };
}

function plateformes(): OneWaySpec[] {
  return [
    passerelle('gangway_port', 'S', -4.3, 1.7, -3.3),
    passerelle('crows_nest', 'M', 0, PLATFORM_Y, -2.2),
    passerelle('gangway_starboard', 'S', 4.3, 1.8, -3.3),
  ];
}

// ---------------------------------------------------------------------------
// LMAP4 — Couverts : 2 tonneaux qui roulent (réactifs) de part et d'autre du centre, pile de caisses et
// caisse seule à l'avant, baril de poudre (explosif, modèle pirate sombre : ne se confond pas avec les
// tonneaux) sur la bande avant que la vague fait gîter. Canon à la poupe (point chaud : il balaie tout le pont,
// mais on le sert dos au vide).
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

function couverts(): PropSpec[] {
  return [
    tonneau('barrel_a', -2.8, 2.4),
    tonneau('barrel_b', 3.0, -1.1),
    {
      id: 'crate_stack', kind: 'decor', pos: [-5.0, 0, 3.0], yaw: 0.15, scale: 1.15,
      build: { kind: 'model', url: KIT.caissesPile, graded: false, surface: { detail: 'bois' } },
      collider: { type: 'box', hx: 1.2, hy: 0.55, hz: 0.75, offset: [0, 0.55, 0.2] },
    },
    {
      id: 'crate_a', kind: 'decor', pos: [1.2, 0, 3.3], yaw: 0.3, scale: 1.15,
      build: { kind: 'model', url: KIT.caisse, graded: false, surface: { detail: 'bois' } },
      collider: { type: 'box', hx: 0.55, hy: 0.55, hz: 0.55, offset: [0, 0.55, 0] },
    },
    {
      // Baril de poudre (pirate) : 1,34 x 1,23 m ; un coup -> explosion qui éjecte vers la mer.
      id: 'powder_keg', kind: 'explosive', pos: [5.0, 0, 3.3], yaw: 0.4,
      build: { kind: 'model', url: PIRATE.barrel, graded: false },
      collider: { type: 'cylinder', radius: 0.6, halfHeight: 0.615, offset: [0, 0.615, 0] },
      triggerRadius: 1.4, blastRadius: 3, impulse: 9,
    },
    {
      id: 'cannon', kind: 'cannon', pos: [-11.2, 0, -1.6], yaw: Math.PI / 2, scale: 1.4,
      build: { kind: 'model', url: PIRATE.cannon, graded: false },
      collider: { type: 'box', hx: 0.7, hy: 0.53, hz: 1.0, offset: [0, 0.53, 0] },
      triggerRadius: 1.8, cannonAxis: [1, 0, 0], cannonRange: 22,
    },
  ];
}

// LMAP4 : habillage du pont (sans collider) : boulets empilés près du canon, bouteilles au pied des caisses,
// coffre à la poupe.
function habillage(): BackdropSpec[] {
  return [
    { build: { kind: 'model', url: PIRATE.cannonBall }, graded: false, items: [
      { pos: [-11.9, 0.27, -3.3], scale: 0.8 }, { pos: [-11.35, 0.27, -3.45], scale: 0.8 }, { pos: [-11.6, 0.27, -2.85], scale: 0.8 }, { pos: [-11.6, 0.72, -3.2], scale: 0.8 },
    ] },
    { build: { kind: 'model', url: PIRATE.bottle }, graded: false, items: [
      { pos: [-6.5, 0, 3.9], scale: 0.9 }, { pos: [-6.2, 0, 4.25], yaw: 1, scale: 0.8 }, { pos: [2.1, 0, 3.9], yaw: 2, scale: 0.9 },
    ] },
    { build: { kind: 'model', url: PIRATE.chest }, graded: false, items: [{ pos: [-11.3, 0.1, 3.1], yaw: 1.9, scale: 0.7 }] },
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
    // LMAP4 : centre avant + 2 points chauds au bord : à côté du canon (poupe, P1) et sur la proue qui
    // s'effile (P2) ; une sous la route aérienne.
    crateSpots: [[0, 0.4, 1.4], [-10.0, 0.4, 1.4], [11.0, 0.4, -0.6], [-1.8, 0.4, -3.9]],
    tiles: [],
    ground: pieces,
    extraColliders: [collider],
    platforms: plateformes(),
    props: couverts(),
    backdrop: [...fond(), ...habillage()],
    periodicEvent: { kind: 'wave', everyTurns: 3, firstTurn: 4, leadTurns: 2 },
    seaY: SEA_Y,
    // Bande avant sur la partie pleine largeur du pont (de la poupe, x = -11,8, au début de la proue, x = 7,5).
    waveBand: { center: [-2.15, 0, DECK_HALF_Z - 1.0], size: [19.3, 2.0] },
  };
}
