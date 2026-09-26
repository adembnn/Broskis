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
const bldG = (name: string) => `${HEXP}/buildings/green/building_${name}_green.gltf`;
const nature = (name: string) => `${HEXP}/decoration/nature/${name}.gltf`;

interface Island { at: Vec3; s: number; building: string; yaw: number; trees?: boolean }
const ISLANDS: Island[] = [
  { at: [-27, -4, -27], s: 3.2, building: bld('windmill'), yaw: 0.6, trees: true },
  { at: [25, -1.5, -30], s: 3.6, building: bld('castle'), yaw: -0.4 },
  { at: [-6, 3, -48], s: 3.4, building: bld('church'), yaw: 0.2, trees: true },
  { at: [42, -7, -8], s: 2.8, building: bld('tower_A'), yaw: 1.2, trees: true },
  { at: [-44, -9, 2], s: 2.6, building: bldG('home_B'), yaw: 2.4, trees: true },
  { at: [12, -11, -38], s: 2.4, building: bld('market'), yaw: 0.9 },
  { at: [-36, 6, -58], s: 3, building: bld('tavern'), yaw: -0.7, trees: true },
  { at: [50, 2, -40], s: 2.6, building: bldG('home_B'), yaw: 0.3, trees: true },
  // Côté caméra (+Z) : seulement loin sur les côtés et sous le plateau, jamais dans la vue de 3/4 haute.
  { at: [36, -8, 20], s: 3, building: bld('windmill'), yaw: -2.2, trees: true },
  { at: [-38, -5, 24], s: 3.2, building: bld('church'), yaw: 2.8, trees: true },
  { at: [26, -14, 34], s: 2.4, building: bld('tower_A'), yaw: 0.4 },
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
    // Cascades de petits rochers flottants entre les îles : profondeur et échelle.
    { build: { kind: 'procedural', shape: 'rock', size: [1.2, 2.2, 0.5] }, items: [
      [-17, -7, -20, 1], [16, -9, -18, 0.8], [33, -4, -20, 0.7], [-34, -2, -40, 0.9], [4, -1, -30, 0.6],
      [-50, -3, -22, 0.9], [56, -12, -24, 1.1], [28, 5, -52, 0.8],
    ].map((p) => it(p as Place)) },
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
    // Flotte : 3 navires qui croisent derrière, proue vers l'arène (on les voit de 3/4).
    model(`${PIR}/ship-pirate-large.glb`, [[-21, w, -17, 1.6, 0.5], [30, w, -36, 1.9, -0.5], [40, w, 22, 1.8, -2.4]]),
    // Navire fantôme tout proche, dans le dos du mât : silhouette lisible même dans la brume (16-55 m).
    model(`${PIR}/ship-ghost.glb`, [[20, w - 0.4, -19, 1.5, -0.4]]),
    model(`${PIR}/ship-pirate-medium.glb`, [[4, w, -52, 2, 1.5], [-44, w, -16, 1.6, 1.1], [-42, w, 28, 1.7, 2.6]]),
    model(`${PIR}/ship-large.glb`, [[48, w, -8, 1.5, -1.3]]),
    // Épave échouée sur un récif, à gauche.
    model(`${PIR}/ship-wreck.glb`, [[-36, SEA - 1.2, -14, 1.6, 2.2]]),
    model(`${PIR}/rocks-b.glb`, [[-32, SEA - 1, -8, 2.2, 0.4], [26, SEA - 1, -16, 1.8, 1.9], [-12, SEA - 1.2, -34, 1.6, 0.9]]),
    // Îlot à palmiers (droite) et phare sur son rocher (fond gauche).
    model(`${PIR}/patch-sand.glb`, [[32, SEA - 0.1, -30, 1.5, 0.6]]),
    model(`${PIR}/rocks-sand-a.glb`, [[35, SEA - 0.6, -32, 1.2, 2.1]]),
    model(`${PIR}/palm-detailed-bend.glb`, [[30, SEA, -28, 1.8, 0.4], [35, SEA, -27, 1.5, 2.2]]),
    model(`${PIR}/palm-straight.glb`, [[33, SEA, -33, 1.7, 1]]),
    model(`${PIR}/rocks-c.glb`, [[-22, SEA - 1, -58, 3, 0.2]]),
    model(`${PIR}/tower-complete-large.glb`, [[-22, SEA + 2.5, -58, 1.6, 0.8]]),
    // Barques à la dérive, flottant près du galion (de côté, hors ligne de caméra).
    model(`${PIR}/rocks-sand-b.glb`, [[-30, SEA - 0.7, 18, 1.4, 0.5], [28, SEA - 0.7, 12, 1.2, 2]]),
    model(`${PIR}/palm-detailed-straight.glb`, [[-30, SEA, 17, 1.7, 0.2], [28, SEA, 11, 1.5, 1.4]]),
    model(`${PIR}/boat-row-large.glb`, [[-17, SEA - 0.2, -7, 1.3, 0.9], [18, SEA - 0.2, -10, 1.2, -1.2]]),
    model(`${PIR}/barrel.glb`, [[-14, SEA - 0.2, -13, 1.2, 0.3], [15, SEA - 0.1, -4, 1.1, 1], [21, SEA - 0.2, -13, 1, 2]]),
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Cuisine géante : on se bat sur l'îlot central d'une vraie cuisine. Plans de travail latéraux AU NIVEAU
// de l'arène (le regard lit l'échelle tout de suite), mur du fond chargé (étagères, bocaux, hotte, gazinière
// qui mijote), table et chaises au loin.
// ---------------------------------------------------------------------------------------------------------
const RES = '/assets/packs/restaurant';
const FUR = '/assets/packs/furniture';
const K = 7;           // échelle « géante » des meubles (≈ un plan de travail KayKit de 2 m → 14 m)
const FLOOR = -16;     // sol de la cuisine = -(COUNTER_H + 2) dans cuisine.ts
const TOP = FLOOR + 2.1 * K; // dessus d'un plan de travail géant ≈ niveau de l'arène

function cuisine(): BackdropSpec[] {
  const r = (n: string) => `${RES}/${n}.gltf`;
  return [
    // Rangée de plans de travail derrière l'îlot (mur du fond) + évier + gazinière.
    model(r('kitchencounter_straight_A'), [[-28, FLOOR, -42, K, 0], [-14, FLOOR, -42, K, 0], [28, FLOOR, -42, K, 0]]),
    model(r('kitchencounter_sink'), [[14, FLOOR, -42, K, 0]]),
    model(r('stove_multi'), [[0, FLOOR, -42, K, 0]]),
    model(r('extractorhood'), [[0, FLOOR + 0.6 * K, -43, K, 0]]),
    model(r('pot_A_stew'), [[-3, TOP, -41, K * 0.8, 0.4]]),
    
    // Étagères murales garnies au-dessus des plans de travail.
    
    model(`${FUR}/shelf_B_large_decorated.gltf`, [[-24, FLOOR + 3.9 * K, -47.5, K, 0], [24, FLOOR + 3.9 * K, -47.5, K, 0]]),
    model(r('wall'), [[-28, FLOOR, -48.5, K * 1.05, 0], [0, FLOOR, -48.5, K * 1.05, 0], [28, FLOOR, -48.5, K * 1.05, 0]]),
    // Plans de travail latéraux, gauche et droite, au niveau de l'arène (profondeur + échelle immédiate).
    model(r('kitchencounter_straight_A'), [[-34, FLOOR, -14, K, Math.PI / 2], [-34, FLOOR, 0, K, Math.PI / 2], [34, FLOOR, -14, K, -Math.PI / 2], [34, FLOOR, 0, K, -Math.PI / 2], [-34, FLOOR, 14, K, Math.PI / 2], [34, FLOOR, 14, K, -Math.PI / 2]]),
    model(r('stove_single_countertop'), [[34, TOP, 14, K * 0.9, -Math.PI / 2]]),
    model(r('pot_B_stew'), [[34, TOP + 0.3 * K, 14, K * 0.8, 0.5]]),
    model(r('crate_carrots'), [[-34, TOP, 14, K * 0.7, 0.9]]),
    model(r('jar_C_large'), [[-33, TOP, 5, K * 1.1, 0]]),
    model(r('dishrack_plates'), [[-33, TOP, -12, K * 0.9, 0.3]]),
    model(r('crate_tomatoes'), [[-34, TOP, 0, K * 0.7, 0.2]]),
    model(r('jar_B_large'), [[33, TOP, -16, K * 1.1, 0], [35, TOP, -11, K * 0.9, 0.5]]),
    model(r('ketchup'), [[32, TOP, -2, K * 1.2, 0.3]]),
    model(r('kitchencabinet'), [[-34, FLOOR + 1.9 * K, -14, K, Math.PI / 2], [34, FLOOR + 1.9 * K, -14, K, -Math.PI / 2]]),
    // Coin repas au loin (profondeur), lampe sur pied.
    model(r('kitchentable_A_large_decorated'), [[-50, FLOOR, -58, K, 0.3]]),
    model(r('chair_A'), [[-58, FLOOR, -54, K, 1.9], [-42, FLOOR, -62, K, -1.2]]),
    model(`${FUR}/lamp_standing.gltf`, [[52, FLOOR, -52, K, 0]]),
    model(r('fridge_A_decorated'), [[48, FLOOR, -38, K * 1.05, -0.4]]),
  ];
}

/** Décor d'habillage à ajouter au `backdrop` de la map (voir engine.ts). */
export function dressing(id: MapId): BackdropSpec[] {
  if (id === 'archipel') return archipel();
  if (id === 'galion') return galion();
  if (id === 'cuisine') return cuisine();
  return [];
}
