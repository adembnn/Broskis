// Archipel qui s'effrite : îles hexagonales (KayKit Medieval Hexagon) au-dessus du vide.
// Données pures (aucun THREE/Rapier ici) : engine.ts interprète ce MapDef.
import type { Vec3 } from '../../core/types';
import { HEX, PROPS } from './assets';
import { axialToWorld, HEX_R, hexDisk } from './hex';
import type { MapDef, PropSpec, TileSpec } from './types';

interface Island { id: string; center: Vec3; radius: number }

const ISLANDS: Island[] = [
  { id: 'islandA', center: [-9, 0, 0], radius: 2 }, // spawn J1
  { id: 'islandB', center: [9, 0, 0], radius: 2 },  // spawn J2
  { id: 'islandC', center: [0, 0, 0], radius: 1 },  // île centrale, Caisse Snap, catapulte
];

function islandTiles(island: Island): TileSpec[] {
  return hexDisk(island.radius).map(({ q, r, ring }) => {
    const [wx, wz] = axialToWorld({ q, r });
    return {
      id: `${island.id}_${q}_${r}`,
      pos: [island.center[0] + wx, 0, island.center[2] + wz] as Vec3,
      islandId: island.id,
      ring,
    };
  });
}

export function buildArchipelDef(): MapDef {
  const tiles = ISLANDS.flatMap(islandTiles);

  // Dalles fêlées : 2 tuiles de l'anneau extérieur de chaque grande île (visibles, marquées dès le départ).
  for (const islandId of ['islandA', 'islandB']) {
    const outer = tiles.filter((t) => t.islandId === islandId && t.ring === 2);
    [outer[0], outer[Math.min(3, outer.length - 1)]].forEach((t) => {
      if (t) t.crumble = { hitsRequired: 2, requireCategory: 'grenade' };
    });
  }

  const islandA = ISLANDS[0]!.center;
  const islandB = ISLANDS[1]!.center;
  const islandC = ISLANDS[2]!.center;

  const props: PropSpec[] = [
    // Catapulte au centre de l'île du milieu : marcher dessus bondit vers une île voisine (alterne A/B).
    {
      id: 'catapult',
      kind: 'launcher',
      pos: islandC,
      build: { kind: 'procedural', shape: 'catapult' },
      collider: { type: 'box', hx: 0.9, hy: 0.5, hz: 0.9, offset: [0, 0.5, 0] },
      triggerRadius: 1.1,
      launchTargets: [
        [islandA[0], 0.05, islandA[2]],
        [islandB[0], 0.05, islandB[2]],
      ],
      launchDuration: 0.7,
    },
    // Tonneaux de poudre : explosent au premier tir, zone de dégâts (le gameplay applique via prop:triggered).
    {
      id: 'powder_barrel_a',
      kind: 'explosive',
      pos: [islandA[0] + 2.4, 0, islandA[2] - 1.6],
      build: { kind: 'model', url: PROPS, node: 'barrel_small' },
      collider: { type: 'cylinder', radius: 0.47, halfHeight: 0.55, offset: [0, 0.55, 0] },
      triggerRadius: 1.4,
      blastRadius: 2.6,
      impulse: 9,
    },
    {
      id: 'powder_barrel_b',
      kind: 'explosive',
      pos: [islandB[0] - 2.4, 0, islandB[2] + 1.6],
      build: { kind: 'model', url: PROPS, node: 'barrel_small' },
      collider: { type: 'cylinder', radius: 0.47, halfHeight: 0.55, offset: [0, 0.55, 0] },
      triggerRadius: 1.4,
      blastRadius: 2.6,
      impulse: 9,
    },
  ];

  return {
    id: 'archipel',
    voidY: -5,
    spawns: [
      { pos: [islandA[0], 0.05, islandA[2]], yawDeg: -90 },
      { pos: [islandB[0], 0.05, islandB[2]], yawDeg: 90 },
    ],
    crateSpots: [islandC, islandA, islandB].map((c) => [c[0], 0.4, c[2]] as Vec3),
    tiles,
    tileModel: { kind: 'model', url: HEX.grass },
    tileHalfExtents: [1, 0.5, HEX_R],
    ground: [],
    extraColliders: [],
    props,
    periodicEvent: { kind: 'ring', everyTurns: 2 },
  };
}
