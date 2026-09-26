// Physique RÉELLE d'un objet scanné (demande d'Adem, 15h50 : « une chaise n'est pas une canette »). Gemini décrit
// l'objet (matière, forme, taille, sa propre estimation de masse et sa confiance, api/scan-object.ts) ; CE fichier
// arbitre : il borne tout, recoupe la masse avec la taille et la matière, se replie sur une table d'objets courants,
// puis en déduit les stats a/b/c (budget 10) et corrige un trait absurde. L'effet en jeu (vitesse, dégâts, recul,
// recharge) est ailleurs, en UN seul endroit : src/gameplay/physics-feel.ts (RTCORE) lit `weapon.physics`.
// Module isomorphe et pur : importé par le serveur (api/scan-object.ts) et par le navigateur (scan, presets, labo).
// Voir plan/recherche/R1-physique-photo.md.
import type { Category, Material, ObjectShape, Trait, WeaponPhysics, WeaponStats } from '../core/types';
import { TRAITS } from '../core/types';

export const MATERIALS: readonly Material[] = ['metal', 'wood', 'plastic', 'glass', 'ceramic', 'fabric', 'paper', 'rubber', 'food', 'stone'];
export const SHAPES: readonly ObjectShape[] = ['long', 'flat', 'round', 'box', 'irregular'];
export type PhysicsConfidence = 'low' | 'medium' | 'high';

export const MASS_MIN_KG = 0.02;
export const MASS_MAX_KG = 25;
export const SIZE_MIN_M = 0.03;
export const SIZE_MAX_M = 2.5;

/** Densité « objet du quotidien » par matière (kg/m³, R1) : plafond physique d'une masse annoncée. */
const DENSITY: Record<Material, number> = {
  metal: 4000, stone: 2600, glass: 2500, ceramic: 2300, rubber: 1100, plastic: 900, food: 900, paper: 700, wood: 600, fabric: 200,
};
/** Part pleine de la boîte englobante selon la forme (R1) : estimation quand Gemini n'est pas sûr de lui. */
const FILL: Record<ObjectShape, number> = { box: 0.7, round: 0.5, flat: 0.3, long: 0.35, irregular: 0.12 };
/** Rebond typique par matière (0 = mou, 1 = balle rebondissante) ; bas pour ce qui casse (R1 : « il se brise »). */
const MATERIAL_BOUNCE: Record<Material, number> = {
  rubber: 0.85, plastic: 0.45, wood: 0.3, metal: 0.25, glass: 0.1, ceramic: 0.1, stone: 0.1, food: 0.15, paper: 0.1, fabric: 0.2,
};
/** Dureté (garde et renvoi d'un bouclier, précision d'un tir). */
const MATERIAL_HARD: Record<Material, number> = {
  metal: 1, stone: 1, ceramic: 0.8, wood: 0.75, glass: 0.7, plastic: 0.5, rubber: 0.4, food: 0.2, paper: 0.15, fabric: 0.1,
};

type Row = [keywords: string[], massKg: number, sizeM: [number, number, number], material: Material, shape: ObjectShape, bounce: number, fragile: boolean, liquid: boolean];
/** Repli : 30+ objets courants (R1, section 4), reconnus par mot-clé dans le nom d'objet. L'ordre compte (le plus précis d'abord). */
const TABLE: Row[] = [
  [['office chair', 'desk chair', 'gaming chair'], 13, [1.05, 0.65, 0.65], 'plastic', 'irregular', 0.05, false, false],
  [['beanbag', 'bean bag'], 8, [0.8, 0.8, 0.8], 'fabric', 'irregular', 0.2, false, false],
  [['stool'], 3, [0.5, 0.35, 0.35], 'wood', 'irregular', 0.1, false, false],
  [['chair'], 6.5, [0.9, 0.45, 0.5], 'wood', 'irregular', 0.05, false, false],
  [['snow globe'], 0.6, [0.12, 0.1, 0.1], 'glass', 'round', 0.1, true, true],
  [['mug', 'coffee cup', 'teacup', 'cup'], 0.35, [0.1, 0.09, 0.09], 'ceramic', 'round', 0.1, true, true],
  [['soda can', 'beer can', 'can of', 'tin can', 'can'], 0.38, [0.12, 0.066, 0.066], 'metal', 'long', 0.3, false, true],
  [['beer bottle', 'wine bottle', 'glass bottle'], 0.55, [0.23, 0.06, 0.06], 'glass', 'long', 0.1, true, true],
  [['water bottle', 'bottle', 'flask'], 0.52, [0.22, 0.065, 0.065], 'plastic', 'long', 0.4, false, true],
  [['frying pan', 'skillet', 'pan'], 2.2, [0.05, 0.3, 0.3], 'metal', 'flat', 0.15, false, false],
  [['rubber duck', 'duck'], 0.03, [0.08, 0.09, 0.045], 'rubber', 'round', 0.6, false, false],
  [['tennis ball'], 0.058, [0.067, 0.067, 0.067], 'rubber', 'round', 0.9, false, false],
  [['basketball', 'football', 'soccer ball', 'ball'], 0.6, [0.24, 0.24, 0.24], 'rubber', 'round', 0.85, false, false],
  [['plate'], 0.4, [0.02, 0.25, 0.25], 'ceramic', 'flat', 0.05, true, false],
  [['smartphone', 'phone', 'cellphone'], 0.19, [0.15, 0.075, 0.008], 'metal', 'flat', 0.2, true, false],
  [['laptop', 'notebook computer'], 1.8, [0.02, 0.33, 0.23], 'metal', 'box', 0.1, true, false],
  [['book', 'hardcover', 'novel'], 0.9, [0.25, 0.16, 0.03], 'paper', 'flat', 0.05, false, false],
  [['duct tape', 'tape'], 0.35, [0.05, 0.1, 0.1], 'plastic', 'round', 0.3, false, false],
  [['broom', 'mop'], 0.4, [1.3, 0.3, 0.03], 'wood', 'long', 0.1, false, false],
  [['umbrella'], 0.45, [0.6, 0.08, 0.08], 'fabric', 'long', 0.2, false, false],
  [['pillow', 'cushion'], 0.7, [0.5, 0.7, 0.15], 'fabric', 'flat', 0.4, false, false],
  [['teddy', 'plush', 'stuffed'], 0.3, [0.3, 0.2, 0.15], 'fabric', 'irregular', 0.3, false, false],
  [['bucket', 'pail'], 0.5, [0.28, 0.28, 0.28], 'plastic', 'round', 0.3, false, false],
  [['baseball bat', 'bat'], 0.9, [0.86, 0.07, 0.07], 'wood', 'long', 0.2, false, false],
  [['hand mixer', 'mixer', 'whisk'], 0.9, [0.3, 0.12, 0.08], 'plastic', 'irregular', 0.15, false, false],
  [['brick'], 2.3, [0.065, 0.1, 0.215], 'stone', 'box', 0.05, false, false],
  [['watermelon'], 5, [0.25, 0.3, 0.3], 'food', 'round', 0.1, true, true],
  [['egg'], 0.06, [0.06, 0.045, 0.045], 'food', 'round', 0.05, true, true],
  [['banana'], 0.15, [0.2, 0.04, 0.04], 'food', 'long', 0.1, false, false],
  [['baguette', 'bread'], 0.25, [0.65, 0.06, 0.06], 'food', 'long', 0.1, false, false],
  [['hose nozzle', 'garden hose', 'spray nozzle'], 0.15, [0.15, 0.06, 0.05], 'plastic', 'irregular', 0.2, false, false],
  [['ironing board'], 5, [1.1, 0.35, 0.05], 'metal', 'flat', 0.05, false, false],
  [['guitar'], 2, [1, 0.4, 0.12], 'wood', 'irregular', 0.15, true, false],
  [['skateboard'], 3, [0.8, 0.2, 0.1], 'wood', 'long', 0.3, false, false],
  [['garden gnome', 'gnome'], 1.5, [0.3, 0.15, 0.15], 'ceramic', 'irregular', 0.1, true, false],
  [['stapler'], 0.3, [0.06, 0.17, 0.04], 'metal', 'long', 0.2, false, false],
  [['sneaker', 'shoe', 'boot', 'loafer', 'moccasin'], 0.4, [0.12, 0.3, 0.11], 'fabric', 'irregular', 0.4, false, false],
  [['headphones', 'headset'], 0.25, [0.2, 0.18, 0.08], 'plastic', 'irregular', 0.2, false, false],
  [['marker', 'pen', 'pencil'], 0.015, [0.14, 0.015, 0.015], 'plastic', 'long', 0.3, false, false],
  [['watch'], 0.08, [0.25, 0.045, 0.012], 'metal', 'flat', 0.2, true, false],
  [['lamp'], 1.2, [0.3, 0.2, 0.2], 'plastic', 'irregular', 0.1, true, false],
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function rowToPhysics(r: Row): WeaponPhysics {
  return { massKg: r[1], sizeM: [...r[2]] as [number, number, number], material: r[3], shape: r[4], bounciness: r[5], fragile: r[6], liquid: r[7] };
}

/** Objet courant reconnu par mot-clé (mot entier) dans son nom, ou rien. */
export function tablePhysics(objectName: string): WeaponPhysics | null {
  const name = ` ${objectName.toLowerCase().replace(/[^a-z ]/g, ' ')} `;
  const row = TABLE.find((r) => r[0].some((k) => name.includes(` ${k} `) || name.includes(` ${k}s `)));
  return row ? rowToPhysics(row) : null;
}

/** Physique par défaut d'une catégorie, si rien d'autre n'est exploitable (même ordre de grandeur que physics-feel). */
export function defaultPhysics(category: Category): WeaponPhysics {
  const byCat: Record<Category, WeaponPhysics> = {
    blaster: { massKg: 0.5, sizeM: [0.25, 0.15, 0.08], material: 'plastic', shape: 'long', bounciness: 0.3, fragile: false, liquid: false },
    grenade: { massKg: 0.5, sizeM: [0.15, 0.12, 0.12], material: 'plastic', shape: 'round', bounciness: 0.5, fragile: false, liquid: false },
    throwable: { massKg: 0.5, sizeM: [0.3, 0.15, 0.15], material: 'wood', shape: 'irregular', bounciness: 0.2, fragile: false, liquid: false },
    shield: { massKg: 2, sizeM: [0.6, 0.6, 0.05], material: 'metal', shape: 'flat', bounciness: 0.2, fragile: false, liquid: false },
  };
  return byCat[category];
}

/**
 * Arbitre une physique proposée par Gemini (ou lue d'un JSON déjà borné : idempotent).
 * - taille bornée 0,03-2,5 m, matière et forme dans leur liste fermée ;
 * - masse : l'estimation de Gemini si sa confiance n'est pas « low », plafonnée par la boîte englobante PLEINE de sa
 *   matière (un objet ne pèse jamais plus que ça : un « 999 kg » écrit sur une plume retombe à quelques grammes) ;
 *   confiance basse ou masse absente : table des objets courants, sinon volume × remplissage × densité ;
 * - bornes finales 0,02-25 kg.
 */
export function clampPhysics(v: unknown, category: Category, objectName = ''): WeaponPhysics {
  const raw = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const known = tablePhysics(objectName);
  const base = known ?? defaultPhysics(category);
  const confidence: PhysicsConfidence = raw.physicsConfidence === 'low' || raw.physicsConfidence === 'high' ? raw.physicsConfidence : 'medium';
  const arr = Array.isArray(raw.sizeM) ? (raw.sizeM as unknown[]) : [raw.heightM, raw.widthM, raw.depthM];
  const sizes = [0, 1, 2].map((i) => num(arr[i]));
  const useGeminiShape = confidence !== 'low' && sizes.every((s) => s !== null && s > 0);
  const sizeM = (useGeminiShape ? sizes : base.sizeM).map((s) => +clamp(s as number, SIZE_MIN_M, SIZE_MAX_M).toFixed(3)) as [number, number, number];
  const material = (MATERIALS as readonly string[]).includes(raw.material as string) ? (raw.material as Material) : base.material;
  const shape = (SHAPES as readonly string[]).includes(raw.shape as string) ? (raw.shape as ObjectShape) : base.shape;

  const box = sizeM[0] * sizeM[1] * sizeM[2];
  const solidKg = box * DENSITY[material];
  const said = num(raw.massKg);
  let massKg: number;
  if (confidence !== 'low' && said !== null && said > 0) massKg = Math.min(said, solidKg);
  else if (known) massKg = known.massKg;
  else massKg = box * FILL[shape] * DENSITY[material];

  const fragile = typeof raw.fragile === 'boolean' ? raw.fragile : material === 'glass' || material === 'ceramic';
  const bounce = num(raw.bounciness);
  return {
    massKg: +clamp(massKg, MASS_MIN_KG, MASS_MAX_KG).toFixed(3),
    sizeM,
    material,
    shape,
    // Ce qui casse ne rebondit pas (lecture « il se brise », R1).
    bounciness: +(fragile ? Math.min(0.15, clamp01(bounce ?? MATERIAL_BOUNCE[material])) : clamp01(bounce ?? MATERIAL_BOUNCE[material])).toFixed(2),
    fragile,
    liquid: typeof raw.liquid === 'boolean' ? raw.liquid : known?.liquid ?? false,
  };
}

/** Log de la masse ramené à 0..1 (50 g -> 0, 20 kg -> 1) : l'écart canette/chaise se lit mieux en échelle log. */
function heaviness(m: number): number {
  return clamp01((Math.log10(m) - Math.log10(0.05)) / (Math.log10(20) - Math.log10(0.05)));
}
function bigness(maxDim: number): number {
  return clamp01((Math.log10(maxDim) - Math.log10(0.05)) / (Math.log10(1.5) - Math.log10(0.05)));
}
const LONGISH: Record<ObjectShape, number> = { long: 1, box: 0.7, flat: 0.6, irregular: 0.4, round: 0.3 };

/**
 * Répartit le budget de 10 points (chaque stat de 1 à 6) selon trois « envies » entre 0 et 1 : 1 point d'office
 * par stat, les 7 autres au prorata (accentué), plus fort reste pour tomber pile sur 10.
 */
function allocate(scores: [number, number, number]): WeaponStats {
  const w = scores.map((s) => Math.pow(clamp01(s) + 0.05, 1.6));
  const total = w.reduce((a, b) => a + b, 0);
  const extra = w.map((x) => (7 * x) / total);
  const pts = extra.map((x) => Math.min(5, Math.floor(x)));
  let left = 7 - pts.reduce((a, b) => a + b, 0);
  const order = [0, 1, 2].sort((i, j) => extra[j] - Math.floor(extra[j]) - (extra[i] - Math.floor(extra[i])));
  for (let k = 0; left > 0 && k < 12; k++) {
    const i = order[k % 3];
    if (pts[i] < 5) {
      pts[i]++;
      left--;
    }
  }
  return { a: 1 + pts[0], b: 1 + pts[1], c: 1 + pts[2] };
}

/** Trait de Gemini gardé, sauf s'il contredit la physique (« heavy » pour un feutre, « bouncy » pour un mug). */
function coherentTrait(trait: Trait, p: WeaponPhysics): Trait {
  if (trait === 'heavy' && p.massKg < 0.5) return p.liquid ? 'slippery' : 'bouncy';
  if (trait === 'bouncy' && p.bounciness < 0.2) return p.massKg >= 3 ? 'heavy' : p.fragile ? 'split' : 'sticky';
  return trait;
}

/**
 * Stats a/b/c (budget 10, sens STAT_NAMES) et trait d'une arme, à partir de sa physique réelle. Pure et
 * déterministe. Rien d'autre : dégâts, vitesse, recul et recharge viennent de physics-feel.ts (un seul endroit).
 */
export function deriveStats(physics: WeaponPhysics, category: Category, trait: Trait = TRAITS[0]): { stats: WeaponStats; trait: Trait } {
  const heavy = heaviness(physics.massKg);
  const light = 1 - heavy;
  const big = bigness(Math.max(...physics.sizeM));
  const hard = MATERIAL_HARD[physics.material];
  const bouncy = physics.bounciness;
  let scores: [number, number, number];
  switch (category) {
    case 'blaster': // power, shots, accuracy
      scores = [heavy, light, LONGISH[physics.shape] * 0.6 + hard * 0.4];
      break;
    case 'grenade': // power, radius, bounce
      scores = [heavy * 0.7 + (physics.fragile ? 0.3 : 0), big * 0.6 + (physics.liquid ? 0.4 : 0) + (physics.fragile ? 0.2 : 0), bouncy];
      break;
    case 'shield': // guard, size, reflect
      scores = [hard * 0.6 + heavy * 0.4, big, hard * 0.5 + bouncy * 0.5];
      break;
    default: // throwable : power, speed, knockback
      scores = [heavy, light, heavy * 0.7 + big * 0.3];
  }
  return { stats: allocate(scores), trait: coherentTrait(trait, physics) };
}
