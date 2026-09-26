// Lot LDECOR : habillage des 3 arènes (décor d'ambiance HORS du plateau, instancié). Complète le `fond()` de
// chaque map (LMAP2) sans y toucher : engine.ts concatène `dressing(id)` à `def.backdrop`.
// Règles LMAP2 respectées : rien entre la caméra (côté +Z, vue de 3/4 haute) et le plateau, rien dans le
// volume jouable (|x| < 12, |z| < 8, y > -6) ; tout est « graded » (teinte/brume de la map) sauf mention.
import type { MapId, Vec3 } from '../../core/types';
import type { BackdropSpec, PropBuild } from './types';

type Item = BackdropSpec['items'][number];
type Place = [x: number, y: number, z: number, scale: number, yaw?: number];

const it = ([x, y, z, k, yaw]: Place): Item => ({ pos: [x, y, z] as Vec3, scale: k, yaw: yaw ?? 0 });
const model = (url: string, places: Place[], hide?: string[]): BackdropSpec => ({
  build: { kind: 'model', url, ...(hide ? { hide } : {}) } as PropBuild,
  items: places.map(it),
});

// ---------------------------------------------------------------------------------------------------------
// Archipel : un royaume d'îles volantes. Chaque île = rocher pendu + dalle d'herbe hexagonale + un bâtiment
// KayKit (moulin, château, église, maisons) + bosquets : le plateau devient l'arène d'un monde habité.
// ---------------------------------------------------------------------------------------------------------
const HEXP = '/assets/packs/hexagon';
const bld = (name: string) => `${HEXP}/buildings/blue/building_${name}_blue.gltf`;
const nature = (name: string) => `${HEXP}/decoration/nature/${name}.gltf`;

interface Island { at: Vec3; s: number; building: string; yaw: number; trees?: boolean }
// LSKY : le panorama peint porte le royaume lointain ; restent 2 îles habitées de mi-distance (parallaxe).
const ISLANDS: Island[] = [
  { at: [-30, -4, -30], s: 3.2, building: bld('windmill'), yaw: 0.6, trees: true },
  { at: [28, -2, -34], s: 3.6, building: bld('castle'), yaw: -0.4 },
];

function archipel(): BackdropSpec[] {
  const byBuilding = new Map<string, Place[]>();
  const rocks: Item[] = [];
  const tops: Place[] = [];
  const groves: Place[] = [];
  const homes: Place[] = [];
  for (const { at: [x, y, z], s, building, yaw, trees } of ISLANDS) {
    rocks.push({ pos: [x, y, z], scale: 1, yaw });
    tops.push([x, y, z, s, yaw]);
    byBuilding.set(building, [...(byBuilding.get(building) ?? []), [x, y, z, s * 0.95, yaw]]);
    if (trees) {
      // Bosquet et maisonnette au bord de la dalle (rayon de la dalle ≈ s).
      groves.push([x + Math.cos(yaw) * s * 0.7, y, z + Math.sin(yaw) * s * 0.7, s * 0.85, yaw * 2]);
      homes.push([x - Math.cos(yaw) * s * 0.65, y, z - Math.sin(yaw) * s * 0.65, s * 0.9, yaw + 1.6]);
    }
  }
  return [
    // Rochers pendus sous chaque île (même forme procédurale que les îles de LMAP2).
    ...ISLANDS.map(({ at, s, yaw }): BackdropSpec => ({
      build: { kind: 'procedural', shape: 'rock', size: [s * 0.95, s * 2.4, 0.5] },
      items: [{ pos: at, yaw, scale: 1 }],
    })),
    model(`${HEXP}/tiles/base/hex_grass.gltf`, tops),
    ...[...byBuilding].map(([url, places]) => model(url, places)),
    model(nature('trees_B_large'), groves),
    model(bld('home_A'), homes),
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Galion : une bataille navale dans la tempête. Flotte ennemie au large, épave, îlots à palmiers, phare
// sur un rocher, barques à la dérive : l'horizon raconte « Pirate Ship ».
// ---------------------------------------------------------------------------------------------------------
const PIR = '/assets/packs/pirate';
const SEA = -3.2; // SEA_Y de galion.ts

function galion(): BackdropSpec[] {
  const w = SEA - 0.6; // les coques s'enfoncent un peu dans la houle
  return [
    // LSKY : la flotte et le phare sont peints dans le panorama ; restent 2 navires et l'épave (mi-distance).
    model(`${PIR}/ship-pirate-large.glb`, [[30, w, -36, 1.9, -0.5]]),
    model(`${PIR}/ship-pirate-medium.glb`, [[-44, w, -16, 1.6, 1.1]]),
    model(`${PIR}/ship-wreck.glb`, [[-36, SEA - 1.2, 22, 1.6, 2.2]]),
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Cuisine géante : on se bat sur l'îlot central d'une vraie cuisine. Plans de travail latéraux AU NIVEAU
// de l'arène (le regard lit l'échelle tout de suite), mur du fond chargé (étagères, bocaux, hotte, gazinière
// qui mijote), table et chaises au loin.
// ---------------------------------------------------------------------------------------------------------
const RES = '/assets/packs/restaurant';
const K = 7;           // échelle « géante » des meubles (≈ un plan de travail KayKit de 2 m → 14 m)
const FLOOR = -16;     // sol de la cuisine = -(COUNTER_H + 2) dans cuisine.ts
const TOP = FLOOR + 2.1 * K; // dessus d'un plan de travail géant ≈ niveau de l'arène

function cuisine(): BackdropSpec[] {
  const r = (n: string) => `${RES}/${n}.gltf`;
  return [
    // LSKY : murs, fenêtre et meubles du fond sont peints dans le panorama. Restent les plans de travail
    // latéraux AU NIVEAU de l'arène (l'échelle se lit tout de suite) et quelques objets posés dessus.
    model(r('kitchencounter_straight_A'), [[-34, FLOOR, -14, K, Math.PI / 2], [-34, FLOOR, 0, K, Math.PI / 2], [34, FLOOR, -14, K, -Math.PI / 2], [34, FLOOR, 0, K, -Math.PI / 2]]),
    model(r('stove_single_countertop'), [[34, TOP, 0, K * 0.9, -Math.PI / 2]]),
    model(r('pot_B_stew'), [[34, TOP + 0.3 * K, 0, K * 0.8, 0.5]]),
    model(r('crate_tomatoes'), [[-34, TOP, 0, K * 0.7, 0.2]]),
    model(r('jar_C_large'), [[-33, TOP, -12, K * 1.1, 0]]),
    model(r('jar_B_large'), [[33, TOP, -16, K * 1.1, 0]]),
  ];
}

/** Décor d'habillage à ajouter au `backdrop` de la map (voir engine.ts). */
export function dressing(id: MapId): BackdropSpec[] {
  if (id === 'archipel') return archipel();
  if (id === 'galion') return galion();
  if (id === 'cuisine') return cuisine();
  return [];
}
