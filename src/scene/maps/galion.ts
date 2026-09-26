// Galion dans la tempête : Kenney Pirate Kit sur un océan stylisé.
// Données pures (aucun THREE/Rapier ici) : engine.ts interprète ce MapDef.
// Hypothèse assumée (pas de bounding box fiable pour "le pont" seul dans ship-pirate-large.glb, qui n'a
// qu'un seul mesh pour toute la coque) : le pont principal est estimé à ~1.8 unité au-dessus de la quille
// (repère local du modèle, bounding box totale de la coque = y:[0, 9.96], x:±2.4, z:±6.55). Ajuster
// `LOCAL_TOKENS.galion.deckLocalY` si la capture d'écran montre un décalage — à vérifier en priorité.
import type { Vec3 } from '../../core/types';
import { PIRATE } from './assets';
import { LOCAL_TOKENS } from './tokens';
import type { MapDef, PropSpec } from './types';

export function buildGalionDef(): MapDef {
  const tk = LOCAL_TOKENS.galion;
  const scale = tk.shipScale;
  const deckWorldY = 0; // convention commune aux 3 maps : la surface où l'on marche est à y=0
  const hullPosY = deckWorldY - tk.deckLocalY * scale; // décale la coque pour amener le pont estimé à y=0

  // Pont : boîte fixe (déjà en unités monde, en retrait des bastingages visuels — le bord net = la limite de jeu).
  const deckHalf: Vec3 = [2.3 * scale, 0.3, 6.2 * scale];

  const props: PropSpec[] = [
    // Canon (bounding brute mesurée : hx0.7 hy1.055 hz0.99, base au sol) : un coup dessus tire un boulet
    // le long de l'axe peint sur le pont.
    {
      // yaw = -90° : la bounding box brute (mesh du tube, asymétrique) pointe par défaut vers +Z ; on la
      // tourne pour l'aligner sur cannonAxis (-X). À confirmer à l'écran (pas de capture possible ici) :
      // si le canon semble viser à l'envers, passer yaw à +Math.PI/2.
      id: 'cannon_port',
      kind: 'cannon',
      pos: [-1.9 * scale, 0, -3.2 * scale],
      yaw: -Math.PI / 2,
      scale,
      build: { kind: 'model', url: PIRATE.cannon },
      collider: { type: 'box', hx: 0.7, hy: 0.53, hz: 1.0, offset: [0, 0.53, 0] },
      triggerRadius: 1.6 * scale,
      cannonAxis: [-1, 0, 0],
      cannonRange: 16,
    },
    // Barils (bounding brute pirate/barrel.glb : radius ~0.67, hauteur ~1.23, base au sol) : bousculés,
    // pas d'explosion, quand on tire dessus.
    {
      id: 'barrel_1',
      kind: 'knockable',
      pos: [1.3 * scale, 0, -4.6 * scale],
      scale,
      build: { kind: 'model', url: PIRATE.barrel },
      collider: { type: 'cylinder', radius: 0.67, halfHeight: 0.61, offset: [0, 0.61, 0] },
      triggerRadius: 1.3 * scale,
      impulse: 6,
    },
    {
      id: 'barrel_2',
      kind: 'knockable',
      pos: [1.7 * scale, 0, -3.6 * scale],
      scale,
      build: { kind: 'model', url: PIRATE.barrel },
      collider: { type: 'cylinder', radius: 0.67, halfHeight: 0.61, offset: [0, 0.61, 0] },
      triggerRadius: 1.3 * scale,
      impulse: 6,
    },
    // Vergue (mât + cordage, mast-ropes.glb, bounding brute ~7.86 de haut) : toucher le cordage balaie le pont.
    {
      id: 'yard',
      kind: 'sweeper',
      pos: [0, 0, 0.6 * scale],
      scale,
      build: { kind: 'model', url: PIRATE.mastRopes },
      collider: { type: 'cylinder', radius: 0.35, halfHeight: 4, offset: [0, 4, 0] },
      triggerRadius: 1.8 * scale,
      sweepDegrees: 140,
      sweepDuration: 1.1,
    },
  ];

  return {
    id: 'galion',
    voidY: -5,
    spawns: [
      { pos: [0, 0.05, -5.4 * scale], yawDeg: 180 },
      { pos: [0, 0.05, 5.4 * scale], yawDeg: 0 },
    ],
    crateSpots: [
      [0, 0.4, 0],
      [-1.4 * scale, 0.4, 2.4 * scale],
    ],
    tiles: [],
    ground: [
      { id: 'hull', build: { kind: 'model', url: PIRATE.shipLarge }, pos: [0, hullPosY, 0], scale, collider: null },
    ],
    extraColliders: [
      { id: 'deck', pos: [0, -deckHalf[1], 0], collider: { type: 'box', hx: deckHalf[0], hy: deckHalf[1], hz: deckHalf[2] } },
    ],
    props,
    periodicEvent: { kind: 'wave', everyTurns: 3 },
  };
}
