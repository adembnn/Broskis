// Formules PURES des règles v2 (lot LSMASH) : dégâts en %, vitesse d'éjection, intégration d'un vol.
// Aucune dépendance au moteur (ni ctx, ni Rapier) : partagées par le jeu (damage.ts, launch.ts) et par le
// simulateur d'équilibrage (tools/balance/sim.ts), qui tourne sous Node — d'où l'import en `.ts`.
import type { Category, Trait, Vec3 } from '../core/types';
import {
  BLASTER_BURST_DAMAGE_RATIO, CHARGE_DAMAGE_MIN, CHARGE_DAMAGE_SPAN, FIGHTER_POWER_PCT_FACTOR, HEAVY_LAUNCH_MULT,
  LAUNCH_AIR_DECEL, LAUNCH_ANGLE_DEG, LAUNCH_BASE, LAUNCH_BASE_CAP, LAUNCH_GRAVITY, LAUNCH_GROUND_DECEL, LAUNCH_K1,
  LAUNCH_K2, MAX_PCT_PER_HIT, NICE_DAMAGE_MULT, PCT_PER_POWER, THROWABLE_DAMAGE_MULT, WEIGHT_EXP,
} from './tuning.ts';

export interface WeaponLike { category: Category; stats: { a: number; b: number; c: number }; trait: Trait }

/** Tout ce qui module UN coup (un tir de rafale, une grenade, un objet lancé). */
export interface ShotMods {
  /** Charge du tir, 0..1. */
  charge: number;
  /** Nombre de tirs de la rafale (blaster), 1 sinon : les dégâts de la rafale se répartissent. */
  burst: number;
  /** 1 ; 0,5 pour une parade GOOD ; atténuation d'une explosion (0,6..1). Dégâts seulement. */
  mult: number;
  crit: boolean;
  nice: boolean;
  /** BRO SMASH : multiplicateurs de dégâts et de recul (1 sinon). */
  superDamage: number;
  superLaunch: number;
  /** Éclat secondaire (trait `split`) : fraction des dégâts et du recul d'un coup plein. */
  fragment: number;
}

export const NO_MODS: ShotMods = { charge: 0.5, burst: 1, mult: 1, crit: false, nice: false, superDamage: 1, superLaunch: 1, fragment: 1 };

/** Dégâts en % d'un coup (arrondis à l'unité, au moins 1). */
export function damagePct(w: WeaponLike, fighterPower: number, m: ShotMods, critMult: number): number {
  let dmg = w.stats.a * PCT_PER_POWER;
  if (w.category === 'throwable') dmg *= THROWABLE_DAMAGE_MULT;
  if (w.category === 'blaster') dmg *= BLASTER_BURST_DAMAGE_RATIO / Math.max(1, m.burst);
  dmg *= 1 + (fighterPower - 5) * FIGHTER_POWER_PCT_FACTOR;
  dmg *= CHARGE_DAMAGE_MIN + CHARGE_DAMAGE_SPAN * clamp01(m.charge);
  if (m.nice) dmg *= NICE_DAMAGE_MULT;
  if (m.crit) dmg *= critMult;
  if (w.trait === 'explosive') dmg *= 1.1;
  dmg = Math.min(dmg, MAX_PCT_PER_HIT);
  dmg *= m.superDamage * m.mult * m.fragment;
  return Math.max(1, Math.round(dmg));
}

/** Partie « base_arme + charge × k1 » de la formule, traits compris, plafonnée. */
export function launchBase(w: WeaponLike, charge: number): number {
  const c = clamp01(charge);
  let b: number;
  if (w.category === 'throwable') b = LAUNCH_BASE.throwable.base + LAUNCH_BASE.throwable.perC * w.stats.c + LAUNCH_K1 * c;
  else if (w.category === 'grenade') b = LAUNCH_BASE.grenade.base + LAUNCH_BASE.grenade.perA * w.stats.a + LAUNCH_BASE.grenade.perC * w.stats.c + LAUNCH_K1 * c;
  else if (w.category === 'blaster') b = LAUNCH_BASE.blaster.base + LAUNCH_BASE.blaster.perA * w.stats.a + LAUNCH_BASE.blaster.k1 * c;
  else b = 0; // le shield ne lance rien
  if (w.trait === 'heavy') b *= HEAVY_LAUNCH_MULT;
  if (w.trait === 'bouncy' && w.category === 'grenade') b *= 1.08;
  return Math.min(b, LAUNCH_BASE_CAP);
}

/** Vitesse d'éjection (m/s) : (base + charge × k1) × (1 + %après/100 × k2), × poids, × multiplicateurs. */
export function launchSpeed(w: WeaponLike, pctAfter: number, m: ShotMods, targetHpMax = 100): number {
  const weight = Math.pow(100 / Math.max(50, targetHpMax), WEIGHT_EXP);
  // `m.mult` (parade GOOD, atténuation d'explosion) ne touche que les dégâts : le % après coup, plus bas, suffit.
  return launchBase(w, m.charge) * (1 + (Math.max(0, pctAfter) / 100) * LAUNCH_K2) * weight * m.superLaunch * m.fragment;
}

/** Vecteur d'éjection : direction horizontale du tir + LAUNCH_ANGLE_DEG vers le haut. */
export function launchVector(dirXZ: Vec3, speed: number): Vec3 {
  const a = (LAUNCH_ANGLE_DEG * Math.PI) / 180;
  const len = Math.hypot(dirXZ[0], dirXZ[2]) || 1;
  const h = Math.cos(a) * speed;
  return [(dirXZ[0] / len) * h, Math.sin(a) * speed, (dirXZ[2] / len) * h];
}

// ---------- Intégration d'un vol (partagée : prédiction `willKo`, simulateur, et vol réel) ----------

export interface FlightBody { pos: Vec3; vel: Vec3; grounded: boolean }

/** Un pas de vol SANS collisions : gravité + décélération horizontale (en l'air) ou glissade (au sol). */
export function stepFlightVelocity(b: FlightBody, dt: number): void {
  const h = Math.hypot(b.vel[0], b.vel[2]);
  const decel = (b.grounded ? LAUNCH_GROUND_DECEL : LAUNCH_AIR_DECEL) * dt;
  const k = h > 1e-6 ? Math.max(0, h - decel) / h : 0;
  b.vel = [b.vel[0] * k, b.grounded ? 0 : b.vel[1] - LAUNCH_GRAVITY * dt, b.vel[2] * k];
}

/** Distance horizontale parcourue EN L'AIR (retour au niveau de départ) par une éjection de `speed` m/s,
 * sur sol plat : sert aux estimations rapides (IA, simulateur). */
export function flatAirDistance(speed: number): number {
  const a = (LAUNCH_ANGLE_DEG * Math.PI) / 180;
  const b: FlightBody = { pos: [0, 0, 0], vel: [Math.cos(a) * speed, Math.sin(a) * speed, 0], grounded: false };
  const dt = 1 / 60;
  for (let t = 0; t < 6; t += dt) {
    stepFlightVelocity(b, dt);
    b.pos = [b.pos[0] + b.vel[0] * dt, b.pos[1] + b.vel[1] * dt, 0];
    if (b.pos[1] <= 0 && b.vel[1] < 0) break;
  }
  return b.pos[0];
}

export function horizontalSpeed(v: Vec3): number {
  return Math.hypot(v[0], v[2]);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
