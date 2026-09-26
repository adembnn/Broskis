// La physique RÉELLE de l'objet scanné se sent en jeu (demande d'Adem : « une chaise n'est pas une canette ») :
// `Weapon.physics` (masse, taille, matière, rebond, fragile, liquide ; estimée par Gemini, bornée par le code)
// → réglages de jeu PURS et BORNÉS. Lourd = lent, cloche plus basse et plus courte, gros dégâts et gros recul
// (quantité de mouvement), longue recharge ; léger = rapide, peu de dégâts, recharge courte. Aucune arme
// dominante : dégâts ÷ recharge reste dans une même bande, et un objet lourd reste esquivable (il est lent).
// Sans `physics` (vieilles armes) : l'objet « moyen » de sa catégorie (tous les multiplicateurs à 1).
import type { Category, Material, Vec3, Weapon } from '../core/types';

export interface PhysicsFeel {
  massKg: number;
  material: Material | null;
  sizeM: Vec3;
  /** Vitesse du projectile (× la vitesse de la catégorie). */
  speedMult: number;
  /** Gravité propre (m/s²) d'un objet lancé tendu (throwable) : 0 pour un objet léger. */
  throwGravity: number;
  /** Portée max d'une grenade (× la portée de base) : un objet lourd retombe court. */
  rangeMult: number;
  /** Gravité de la cloche d'une grenade (× la gravité de base) : plus lourd = cloche plus basse. */
  lobGravityMult: number;
  /** Rayon de contact (m), tiré de la taille réelle. */
  radius: number;
  /** Dégâts et recul ~ quantité de mouvement (masse × vitesse), bornés. */
  damageMult: number;
  launchMult: number;
  /** Recharge (× celle de la catégorie). */
  cooldownMult: number;
  /** Rebonds sur le décor avant de s'arrêter (throwable, grenade) et restitution. */
  bounces: number;
  restitution: number;
  fragile: boolean;
  liquid: boolean;
}

/** Objet « moyen » de référence (≈ une tasse pleine) : tous les multiplicateurs valent 1. */
const REF_MASS = 0.5;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const DEFAULTS: Record<Category, { massKg: number; sizeM: Vec3 }> = {
  blaster: { massKg: REF_MASS, sizeM: [0.25, 0.15, 0.08] },
  grenade: { massKg: REF_MASS, sizeM: [0.15, 0.12, 0.12] },
  throwable: { massKg: REF_MASS, sizeM: [0.3, 0.15, 0.15] },
  shield: { massKg: 2, sizeM: [0.6, 0.6, 0.05] },
};

export function physicsFeel(w: Pick<Weapon, 'category' | 'physics'>): PhysicsFeel {
  const ph = w.physics;
  const massKg = clamp(ph?.massKg ?? DEFAULTS[w.category].massKg, 0.02, 25);
  const sizeM = (ph?.sizeM ?? DEFAULTS[w.category].sizeM).map((s) => clamp(s, 0.02, 2.5)) as Vec3;
  const m = massKg / REF_MASS;
  const speedMult = ph ? clamp(Math.pow(m, -0.25), 0.65, 1.35) : 1;
  const momentum = m * speedMult; // quantité de mouvement relative à l'objet moyen
  const maxDim = Math.max(sizeM[0], sizeM[1], sizeM[2]);
  const bounciness = clamp(ph?.bounciness ?? 0.2, 0, 1);
  return {
    massKg,
    material: ph?.material ?? null,
    sizeM,
    speedMult,
    throwGravity: ph ? clamp((massKg - 0.3) * 1.6, 0, 9.81) : 0,
    rangeMult: ph ? clamp(Math.pow(m, -0.2), 0.55, 1.2) : 1,
    lobGravityMult: ph ? clamp(Math.pow(m, 0.12), 0.8, 1.4) : 1,
    radius: ph ? clamp(0.1 + 0.35 * maxDim, 0.15, 0.7) : 0,
    damageMult: ph ? clamp(Math.pow(momentum, 0.35), 0.6, 1.6) : 1,
    launchMult: ph ? clamp(Math.pow(momentum, 0.4), 0.6, 1.7) : 1,
    cooldownMult: ph ? clamp(Math.pow(m, 0.3), 0.6, 1.8) : 1,
    bounces: ph && bounciness > 0.3 ? Math.round(bounciness * 3) : 0,
    restitution: 0.25 + 0.6 * bounciness,
    fragile: !!ph?.fragile,
    liquid: !!ph?.liquid,
  };
}
