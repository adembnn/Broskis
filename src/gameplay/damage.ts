// Dégâts, recul (façon % de Smash : grandit quand les PV baissent) et K.O. Le corps touché devient
// dynamique le temps du recul (character.ts), puis se resynchronise. Sous y = RINGOUT_Y : ring-out puis K.O.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import {
  restoreKinematicFromDynamic, setDynamicForRecovery, syncFromDynamicBody,
} from './character';
import { goToKo } from './phases';
import { getRuntime } from './runtime';
import {
  CRIT_CHANCE, CRIT_MULT, DAMAGE_PER_POWER, FIGHTER_POWER_DAMAGE_FACTOR, KNOCKBACK_BASE,
  KNOCKBACK_DAMAGE_FACTOR, KNOCKBACK_HP_SCALING, KNOCKBACK_UP_RATIO, KO_EXTRA_KNOCKBACK_MULT,
  RECOVERY_SETTLE_S, RINGOUT_Y, TRAIT_TUNING, WEAPON_COOLDOWN_TURNS,
} from './tuning';
import { normalizeXZ, sub } from './vec3';

/** `a` est toujours la stat « power »/« guard » d'après STAT_NAMES ; le shield ne passe jamais ici (il ne
 * lance rien sur l'adversaire), donc en pratique `a` veut dire « power » pour les 3 autres catégories. */
export function computeDamage(ctx: Ctx, attacker: PlayerId, weapon: Weapon): { damage: number; crit: boolean } {
  const fighter = ctx.state.players[attacker].fighter;
  let dmg = weapon.stats.a * DAMAGE_PER_POWER;
  if (fighter) dmg *= 1 + fighter.power * FIGHTER_POWER_DAMAGE_FACTOR;
  const crit = ctx.rng() < CRIT_CHANCE;
  if (crit) dmg *= CRIT_MULT;
  return { damage: Math.max(1, Math.round(dmg)), crit };
}

function knockbackStatFor(weapon: Weapon): number {
  return weapon.category === 'throwable' ? weapon.stats.c : weapon.stats.a;
}

export function computeKnockbackMagnitude(ctx: Ctx, target: PlayerId, weapon: Weapon, damage: number): number {
  const state = ctx.state.players[target];
  const hpMax = state.fighter?.hpMax ?? 100;
  const hpAfter = Math.max(0, state.hp - damage);
  const missingRatio = 1 - hpAfter / hpMax; // 0 à pleine vie, 1 à 0 PV (façon % de Smash)
  let kb = (KNOCKBACK_BASE + knockbackStatFor(weapon) * 0.6) * (1 + missingRatio * KNOCKBACK_HP_SCALING) + damage * KNOCKBACK_DAMAGE_FACTOR;
  if (weapon.trait === 'heavy') kb *= TRAIT_TUNING.heavy.knockbackMult;
  if (hpAfter <= 0) kb *= KO_EXTRA_KNOCKBACK_MULT; // éjection spectaculaire
  return kb;
}

export interface ApplyHitOptions {
  attacker: PlayerId;
  target: PlayerId;
  weapon: Weapon;
  /** 1 par défaut ; 0,5 pour une parade « bonne » (voir parry.ts). Jamais appelé pour une parade parfaite. */
  damageMultiplier?: number;
  impactPos: Vec3;
  /** Origine du coup (tireur ou point d'explosion), pour la direction du recul. */
  fromPos: Vec3;
}

/** Applique un coup déjà décidé (jamais appelé quand une parade parfaite a tout annulé : voir parry.ts/projectiles.ts). */
export function applyHit(ctx: Ctx, opts: ApplyHitOptions): void {
  const target = ctx.state.players[opts.target];
  if (!target.alive) return;
  const { damage, crit } = computeDamage(ctx, opts.attacker, opts.weapon);
  const finalDamage = Math.max(0, Math.round(damage * (opts.damageMultiplier ?? 1)));
  const magnitude = computeKnockbackMagnitude(ctx, opts.target, opts.weapon, finalDamage);
  const dir = normalizeXZ(sub(target.pos, opts.fromPos));
  const knockback: Vec3 = [dir[0] * magnitude, magnitude * KNOCKBACK_UP_RATIO, dir[2] * magnitude];

  target.hp = Math.max(0, target.hp - finalDamage);

  if (opts.weapon.trait === 'healing') {
    const attacker = ctx.state.players[opts.attacker];
    const cap = attacker.fighter?.hpMax ?? 100;
    attacker.hp = Math.min(cap, attacker.hp + finalDamage * TRAIT_TUNING.healing.lifestealRatio);
  }
  if (opts.weapon.trait === 'loud') {
    ctx.bus.emit('slowmo', { factor: TRAIT_TUNING.loud.slowmoFactor, ms: TRAIT_TUNING.loud.slowmoMs });
  }
  if (opts.weapon.trait === 'slippery') {
    // Consommé par movement.ts::requestMove : les prochains déplacements du joueur touché dérapent.
    getRuntime().players[opts.target].slipperyUntilMs = performance.now() + TRAIT_TUNING.slippery.slideMs;
  }

  ctx.bus.emit('hit', {
    target: opts.target, attacker: opts.attacker, weapon: opts.weapon,
    damage: finalDamage, knockback, crit, pos: opts.impactPos,
  });

  setDynamicForRecovery(ctx, opts.target, knockback);
  ctx.loop.later(RECOVERY_SETTLE_S, () => {
    if (target.alive) restoreKinematicFromDynamic(ctx, opts.target);
  });

  opts.weapon.cooldown = WEAPON_COOLDOWN_TURNS;

  if (target.hp <= 0) {
    target.alive = false;
    goToKo(ctx, opts.target, 'hp');
  }
}

/** Splash générique (grenade, ou tout coup avec le trait `explosive`) : dégâts à qui est dans le rayon,
 * jamais au tireur lui-même (pas de dégâts à soi-même dans cette version). */
export function applySplash(ctx: Ctx, opts: Omit<ApplyHitOptions, 'target'> & { center: Vec3; radius: number }): void {
  for (const p of [0, 1] as const) {
    if (p === opts.attacker) continue;
    const state = ctx.state.players[p];
    if (!state.alive) continue;
    const d = Math.hypot(state.pos[0] - opts.center[0], state.pos[1] - opts.center[1], state.pos[2] - opts.center[2]);
    if (d > opts.radius) continue;
    const falloff = 1 - (d / opts.radius) * TRAIT_TUNING.explosive.falloff;
    applyHit(ctx, { ...opts, target: p, damageMultiplier: (opts.damageMultiplier ?? 1) * Math.max(0.2, falloff) });
  }
}

/** Système à appeler chaque frame : relit la position des corps en recul (dynamiques) et surveille le ring-out. */
export function installDamageSystems(ctx: Ctx): void {
  ctx.loop.addSystem('gameplay-damage', () => {
    for (const p of [0, 1] as const) {
      syncFromDynamicBody(ctx, p);
      const state = ctx.state.players[p];
      if (state.alive && state.pos[1] < RINGOUT_Y) {
        state.alive = false;
        ctx.bus.emit('ringout', { player: p });
        goToKo(ctx, p, 'ringout');
      }
    }
  }, 150); // après la physique (100), avant le rendu (1000)
}
