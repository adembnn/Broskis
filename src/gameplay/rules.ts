import type { Rng } from '../core/rng';
import type { ParryGrade, PlayerId, Weapon } from '../core/types';
import * as TUNING from './tuning.ts';

export interface SimPlayer {
  id: PlayerId;
  hp: number;
  hpMax: number;
  power: number;
  weapons: Weapon[];
  cooldowns: number[];
  distanceToOpponent: number;
  distanceToEdge: number; // distance to ringout
  hasCover: boolean;
  healedThisMatch: number;
  parryStreak: number;
}

export interface SimState {
  turn: number;
  active: PlayerId;
  players: [SimPlayer, SimPlayer];
  winner: PlayerId | null;
  suddenDeath: boolean;
}

export type SimAction = 
  | { type: 'attack'; weaponIdx: number; parryTimingMs?: number; parryHasInput?: boolean; aimQuality?: number }
  | { type: 'move'; strategy: 'cover' | 'push' };

export const MAX_HEAL_PER_MATCH = 25;
export const MAX_DAMAGE_PER_HIT = 35;
export const MAX_PROJECTILES_PER_TURN = 6;
export const MAX_MULTIPLIER = 2.5;

function getParryGrade(timingMs: number | undefined, hasInput: boolean | undefined, turn: number): ParryGrade {
  if (!hasInput || timingMs === undefined) return 'miss';
  const win = TUNING.getParryWindow(turn);
  const absOffset = Math.abs(timingMs);
  if (absOffset <= win.perfectMs) return 'perfect';
  if (absOffset <= win.goodMs) return 'good';
  return 'miss';
}

function calculateDamageAndKnockback(
  attacker: SimPlayer, 
  defender: SimPlayer, 
  weapon: Weapon, 
  parry: ParryGrade, 
  rng: Rng, 
  suddenDeath: boolean
): { damage: number, knockback: number, hits: number, reflected: boolean } {
  let powerStat = weapon.stats.a;
  let baseDamage = powerStat * TUNING.DAMAGE_PER_POWER;
  baseDamage += attacker.power * TUNING.FIGHTER_POWER_DAMAGE_FACTOR * baseDamage;
  
  let knockback = TUNING.KNOCKBACK_BASE + (powerStat * 0.5);
  knockback += baseDamage * TUNING.KNOCKBACK_DAMAGE_FACTOR;

  let hits = 1;
  let reflected = false;
  let accuracyHitChance = 1.0;

  if (weapon.category === 'blaster') {
    hits = Math.min(weapon.stats.b, MAX_PROJECTILES_PER_TURN); // 3..5 limit 6
    if (defender.hasCover) return { damage: 0, knockback: 0, hits: 0, reflected: false }; // stopped by cover
    accuracyHitChance = 0.5 + (weapon.stats.c * 0.1); // simple accuracy abstraction
  } else if (weapon.category === 'grenade') {
    let bounceHitChance = 0.4 + (weapon.stats.c * 0.15); // bounce and radius
    accuracyHitChance = bounceHitChance;
  } else if (weapon.category === 'throwable') {
    knockback *= 1.5;
    baseDamage *= 1.2;
  } else if (weapon.category === 'shield') {
    baseDamage *= 0.8;
  }

  if (rng() > accuracyHitChance) {
    return { damage: 0, knockback: 0, hits: 0, reflected: false };
  }

  let mult = 1.0;
  if (parry === 'perfect') {
    if (weapon.category === 'throwable' || weapon.category === 'shield') {
      reflected = true;
      mult *= 1.5;
    } else {
      mult *= 0; // 0 damage on perfect non-reflectable
    }
  } else if (parry === 'good') {
    mult *= 0.5;
  }

  // NICE * streak * renvoi * trait <= 2.5
  let traitMult = 1.0;
  if (weapon.trait === 'explosive') traitMult *= 1.2;
  if (weapon.trait === 'split') hits = Math.min(hits + 2, MAX_PROJECTILES_PER_TURN);
  if (weapon.trait === 'heavy') knockback *= TUNING.TRAIT_TUNING.heavy.knockbackMult;

  // Simulate streak
  let streakMult = 1.0 + (attacker.parryStreak * 0.1);
  let niceMult = 1.0; // Assume regular hit
  
  let totalMult = niceMult * streakMult * (reflected ? 1.5 : 1.0) * traitMult;
  if (totalMult > MAX_MULTIPLIER) totalMult = MAX_MULTIPLIER;
  mult *= totalMult;

  if (rng() < TUNING.CRIT_CHANCE) mult *= TUNING.CRIT_MULT;
  if (suddenDeath) mult *= 2.0;

  let finalDamage = Math.min(baseDamage * mult, MAX_DAMAGE_PER_HIT);
  let finalKnockback = knockback * mult;

  let totalDamage = finalDamage * hits;
  if (totalDamage > MAX_DAMAGE_PER_HIT && !suddenDeath) {
    totalDamage = MAX_DAMAGE_PER_HIT;
  }

  // HP scaling for knockback (Smash-like)
  const hpRatio = Math.max(0, defender.hp) / defender.hpMax;
  finalKnockback *= 1 + ((1 - hpRatio) * TUNING.KNOCKBACK_HP_SCALING);
  
  if (finalKnockback > 120 && !suddenDeath) finalKnockback = 120; // Cap to prevent turn 1 ringouts

  return { damage: totalDamage, knockback: finalKnockback, hits, reflected };
}

export function applyRuleEngine(state: SimState, action: SimAction, rng: Rng): SimState {
  const newState = JSON.parse(JSON.stringify(state)) as SimState;
  const attacker = newState.players[newState.active];
  const defenderId = newState.active === 0 ? 1 : 0;
  const defender = newState.players[defenderId];

  // Apply sudden death logic
  if (newState.turn >= TUNING.SUDDEN_DEATH_TURN) {
    newState.suddenDeath = true;
    attacker.distanceToEdge = Math.max(1, attacker.distanceToEdge - 2);
    defender.distanceToEdge = Math.max(1, defender.distanceToEdge - 2);
  }

  if (action.type === 'move') {
    if (action.strategy === 'cover') {
      attacker.hasCover = true;
      attacker.distanceToOpponent += 2;
    } else if (action.strategy === 'push') {
      attacker.hasCover = false;
      attacker.distanceToOpponent -= 2;
      defender.distanceToEdge -= 1;
      if (defender.distanceToEdge <= 0) {
        newState.winner = attacker.id;
        return newState;
      }
    }
    attacker.distanceToOpponent = Math.max(1, Math.min(20, attacker.distanceToOpponent));
  } else if (action.type === 'attack') {
    const weapon = attacker.weapons[action.weaponIdx];
    attacker.hasCover = (weapon.category === 'shield');
    attacker.cooldowns[action.weaponIdx] = TUNING.WEAPON_COOLDOWN_TURNS + 1; // +1 because it decrements at end of turn

    const parry = getParryGrade(action.parryTimingMs, action.parryHasInput, newState.turn);
    if (parry === 'perfect') defender.parryStreak++;
    else defender.parryStreak = 0;

    const { damage, knockback, reflected } = calculateDamageAndKnockback(attacker, defender, weapon, parry, rng, newState.suddenDeath);

    let actualTarget = reflected ? attacker : defender;
    let originalAttacker = reflected ? defender : attacker;

    if (damage > 0) {
      actualTarget.hp -= damage;
      actualTarget.distanceToEdge -= knockback * 0.1; // roughly 1 unit per 10 kb
      
      // Healing trait
      if (weapon.trait === 'healing') {
        const healAmt = Math.min(damage * TUNING.TRAIT_TUNING.healing.lifestealRatio, MAX_HEAL_PER_MATCH - originalAttacker.healedThisMatch);
        if (healAmt > 0) {
          originalAttacker.hp = Math.min(originalAttacker.hpMax, originalAttacker.hp + healAmt);
          originalAttacker.healedThisMatch += healAmt;
        }
      }

      if (actualTarget.distanceToEdge <= 0 || actualTarget.hp <= 0) {
        newState.winner = originalAttacker.id;
        return newState; // early exit
      }
    }
  }

  // End turn
  for (let i = 0; i < 3; i++) {
    if (attacker.cooldowns[i] > 0) attacker.cooldowns[i]--;
  }

  newState.active = defenderId;
  if (newState.active === 0) newState.turn++;

  return newState;
}
