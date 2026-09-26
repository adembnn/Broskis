// Physique RÉELLE d'un objet scanné -> stats et réglages de jeu (demande d'Adem, 15h50 : « une chaise n'est pas une
// canette »). Gemini estime la physique sur la photo (api/scan-object.ts), CE fichier la borne puis en déduit tout le
// reste : l'IA interprète, le code arbitre. Module isomorphe et pur (aucun DOM, aucun Node) : importé par le serveur
// (api/scan-object.ts), par le navigateur (src/ia/scan.ts, presets, labo) et par le gameplay (RTCORE, via
// weaponTuning). Références de réglage : tableau REPERES en bas de fichier.
import type { Category, Material, ObjectShape, Weapon, WeaponPhysics, WeaponStats } from '../core/types';

export const MATERIALS: readonly Material[] = ['metal', 'wood', 'plastic', 'glass', 'ceramic', 'fabric', 'paper', 'rubber', 'food', 'stone'];
export const SHAPES: readonly ObjectShape[] = ['long', 'flat', 'round', 'box', 'irregular'];

export const MASS_MIN_KG = 0.02;
export const MASS_MAX_KG = 25;
export const SIZE_MIN_M = 0.03;
export const SIZE_MAX_M = 2.5;
/** Objet de référence : 1 kg donne les multiplicateurs 1 (dégâts, recul, vitesse, portée, recharge). */
export const REF_MASS_KG = 1;

/** Rebond typique par matière (0 = mou, 1 = balle rebondissante). */
const MATERIAL_BOUNCE: Record<Material, number> = {
  rubber: 0.85, plastic: 0.5, wood: 0.35, metal: 0.3, glass: 0.25, ceramic: 0.2, stone: 0.15, food: 0.2, paper: 0.1, fabric: 0.15,
};
/** Dureté (garde et renvoi d'un bouclier, précision d'un tir). */
const MATERIAL_HARD: Record<Material, number> = {
  metal: 1, stone: 1, ceramic: 0.8, wood: 0.75, glass: 0.7, plastic: 0.5, rubber: 0.4, food: 0.2, paper: 0.15, fabric: 0.1,
};
/** Physique par défaut d'une catégorie : armes anciennes ou réponse de Gemini inutilisable. */
const DEFAULT_PHYSICS: Record<Category, WeaponPhysics> = {
  blaster: { massKg: 0.6, sizeM: [0.15, 0.3, 0.08], material: 'plastic', shape: 'long', bounciness: 0.4, fragile: false, liquid: false },
  grenade: { massKg: 0.4, sizeM: [0.1, 0.1, 0.1], material: 'plastic', shape: 'round', bounciness: 0.6, fragile: false, liquid: false },
  throwable: { massKg: 1.2, sizeM: [0.3, 0.2, 0.1], material: 'wood', shape: 'irregular', bounciness: 0.3, fragile: false, liquid: false },
  shield: { massKg: 2, sizeM: [0.5, 0.4, 0.05], material: 'metal', shape: 'flat', bounciness: 0.3, fragile: false, liquid: false },
};
/** Recharge de base par catégorie, en secondes (plan/PIVOT-TEMPS-REEL.md), pour un objet de REF_MASS_KG. */
export const BASE_COOLDOWN_S: Record<Category, number> = { blaster: 1.2, grenade: 3, throwable: 4, shield: 8 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function defaultPhysics(category: Category): WeaponPhysics {
  const d = DEFAULT_PHYSICS[category];
  return { ...d, sizeM: [...d.sizeM] as [number, number, number] };
}

/**
 * Borne une physique proposée par Gemini (ou lue d'un JSON) : masse 0,02 à 25 kg, tailles 0,03 à 2,5 m,
 * matière et forme dans leur liste fermée, rebond 0 à 1. Accepte `sizeM: [h, w, d]` ou `heightM/widthM/depthM`.
 */
export function clampPhysics(v: unknown, category: Category): WeaponPhysics {
  const d = DEFAULT_PHYSICS[category];
  const raw = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const arr = Array.isArray(raw.sizeM) ? (raw.sizeM as unknown[]) : [raw.heightM, raw.widthM, raw.depthM];
  const sizeM = [0, 1, 2].map((i) => clamp(num(arr[i], d.sizeM[i]), SIZE_MIN_M, SIZE_MAX_M)) as [number, number, number];
  const material = (MATERIALS as readonly string[]).includes(raw.material as string) ? (raw.material as Material) : d.material;
  const shape = (SHAPES as readonly string[]).includes(raw.shape as string) ? (raw.shape as ObjectShape) : d.shape;
  const fragile = typeof raw.fragile === 'boolean' ? raw.fragile : material === 'glass' || material === 'ceramic';
  return {
    massKg: +clamp(num(raw.massKg, d.massKg), MASS_MIN_KG, MASS_MAX_KG).toFixed(3),
    sizeM: sizeM.map((s) => +s.toFixed(3)) as [number, number, number],
    material,
    shape,
    // Idempotent (le serveur puis le navigateur bornent la même valeur) : pas de mélange avec la matière ici.
    bounciness: +clamp01(num(raw.bounciness, MATERIAL_BOUNCE[material])).toFixed(2),
    fragile,
    liquid: raw.liquid === true,
  };
}

/** Réglages de jeu déduits de la physique : API pour le gameplay temps réel (RTCORE) et la scène (LATK1). */
export interface WeaponTuning {
  /** Multiplicateur des dégâts (%), ∝ √masse (1 = objet de 1 kg). */
  damage: number;
  /** Multiplicateur du recul / de l'éjection, ∝ √masse. */
  knockback: number;
  /** Multiplicateur de la vitesse de lancer ou du projectile, ∝ 1/√masse. */
  speed: number;
  /** Multiplicateur de la portée, ∝ 1/√masse. */
  range: number;
  /** Recharge après usage (s) : base de la catégorie × masse^0,75 (bornée). */
  cooldownS: number;
  /** Rebond au contact du sol/des murs, 0 à 1 (matière + estimation). */
  bounce: number;
  /** Objet fragile : éclats et petite zone de dégâts à l'impact (rayon en m), 0 sinon. */
  shatterRadiusM: number;
  /** Objet qui contient un liquide : giclée à l'impact. */
  splash: boolean;
  /** Rotation en vol selon la forme : long = tourne sur lui-même, flat = frisbee, round = roule, sinon vacille. */
  spin: 'tumble' | 'frisbee' | 'roll' | 'wobble';
  /** Plus grande dimension réelle (m) : taille de l'objet en main et en vol. */
  sizeM: number;
  massKg: number;
}

const SPIN: Record<ObjectShape, WeaponTuning['spin']> = { long: 'tumble', flat: 'frisbee', round: 'roll', box: 'wobble', irregular: 'wobble' };

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

/**
 * Stats (budget 10, sens STAT_NAMES) et réglages de jeu d'une arme, à partir de sa physique réelle. Pure et
 * déterministe. Une chaise : lente, fait très mal, pousse fort, recharge longtemps ; une canette : rapide,
 * dégâts faibles, recharge vite, gicle.
 */
export function deriveStats(physics: WeaponPhysics, category: Category): { stats: WeaponStats; tuning: WeaponTuning } {
  const m = physics.massKg;
  const maxDim = Math.max(...physics.sizeM);
  const heavy = heaviness(m);
  const light = 1 - heavy;
  const big = bigness(maxDim);
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
  const root = Math.sqrt(m / REF_MASS_KG);
  const tuning: WeaponTuning = {
    damage: +clamp(root, 0.5, 2.2).toFixed(2),
    knockback: +clamp(root, 0.5, 2.4).toFixed(2),
    speed: +clamp(1 / root, 0.6, 1.5).toFixed(2),
    range: +clamp(1 / root, 0.6, 1.4).toFixed(2),
    cooldownS: +(BASE_COOLDOWN_S[category] * clamp(Math.pow(m / REF_MASS_KG, 0.75), 0.6, 2.4)).toFixed(2),
    bounce: physics.bounciness,
    shatterRadiusM: physics.fragile ? +clamp(0.6 + maxDim, 0.6, 1.5).toFixed(2) : 0,
    splash: physics.liquid,
    spin: SPIN[physics.shape],
    sizeM: +maxDim.toFixed(3),
    massKg: m,
  };
  return { stats: allocate(scores), tuning };
}

/** Réglages de jeu d'une arme quelconque (physique absente : valeurs par défaut de sa catégorie). */
export function weaponTuning(w: Pick<Weapon, 'category' | 'physics'>): WeaponTuning {
  return deriveStats(w.physics ?? defaultPhysics(w.category), w.category).tuning;
}

/*
 * REPERES (masse -> dégâts ×, recul ×, vitesse ×, recharge d'un throwable) :
 *   banane 0,15 kg     0,5  0,5  1,5  2,4 s
 *   canette 0,35 kg    0,59 0,59 1,5  2,4 s   (+ giclée)
 *   mug 0,35 kg        0,59 0,59 1,5  2,4 s   (+ éclats)
 *   livre 1,2 kg       1,1  1,1  0,91 4,6 s
 *   ordinateur 2 kg    1,41 1,41 0,71 6,7 s
 *   chaise 12 kg       2,2  2,4  0,6  9,6 s
 * Dégâts par seconde de 0,83 à 1,05 fois la référence sur toute la plage : la chaise frappe rarement mais éjecte.
 */
