// Règles v2 façon Smash : un coup ajoute ses dégâts au % de la cible (plus de K.O. à 0 PV ; `hp` n'est plus
// touché, gardé pour compatibilité) et l'éjecte à une vitesse qui grandit avec ce % (formulas.ts). Le vol
// lui-même, le rattrapage au bord et la perte de vie vivent dans launch.ts / stocks.ts.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { damagePct, launchSpeed, launchVector, NO_MODS, type ShotMods } from './formulas';
import { predictLaunch, startLaunch, stepLaunches } from './launch';
import { getRuntime } from './runtime';
import { isInvulnerable } from './stocks';
import { CRIT_CHANCE_V2, CRIT_MULT_V2, TRAIT_TUNING } from './tuning';
import { normalizeXZ, sub } from './vec3';

/** Dégâts (%) d'un coup, sans hasard (pour la prévisualisation et l'IA). */
export function previewDamage(ctx: Ctx, attacker: PlayerId, weapon: Weapon, mods: Partial<ShotMods> = {}): number {
  const power = ctx.state.players[attacker].fighter?.power ?? 5;
  return damagePct(weapon, power, { ...NO_MODS, ...mods }, CRIT_MULT_V2);
}

/** Vitesse d'éjection (m/s) qu'aurait ce coup sur `target`, à son % actuel + `damage`. */
export function previewLaunchSpeed(ctx: Ctx, target: PlayerId, weapon: Weapon, damage: number, mods: Partial<ShotMods> = {}): number {
  const ps = ctx.state.players[target];
  return launchSpeed(weapon, ps.pct + damage, { ...NO_MODS, ...mods }, ps.fighter?.hpMax ?? 100);
}

export interface ApplyHitOptions {
  attacker: PlayerId;
  target: PlayerId;
  weapon: Weapon;
  /** 1 par défaut ; 0,5 pour une parade « bonne » (voir parry.ts) ; atténuation d'une explosion. */
  damageMultiplier?: number;
  impactPos: Vec3;
  /** Origine du coup (tireur ou point d'explosion), pour la direction du recul. */
  fromPos: Vec3;
  /** Modificateurs du tir (charge, rafale, NICE, BRO SMASH), posés au lâcher par projectiles.ts. */
  mods?: Partial<ShotMods>;
}

/** Applique un coup déjà décidé (jamais appelé quand une parade parfaite a tout annulé : voir projectiles.ts). */
export function applyHit(ctx: Ctx, opts: ApplyHitOptions): void {
  const target = ctx.state.players[opts.target];
  if (!target.alive || ctx.state.winner != null) return;
  if (isInvulnerable(ctx, opts.target)) return; // réapparu : invulnérable jusqu'à la fin de son prochain tour
  const crit = ctx.rng() < CRIT_CHANCE_V2;
  const mods: ShotMods = { ...NO_MODS, ...opts.mods, crit, mult: opts.damageMultiplier ?? 1 };
  const power = ctx.state.players[opts.attacker].fighter?.power ?? 5;
  const damage = damagePct(opts.weapon, power, mods, CRIT_MULT_V2);
  target.pct = Math.min(999, target.pct + damage);

  const speed = launchSpeed(opts.weapon, target.pct, mods, target.fighter?.hpMax ?? 100);
  // Direction : loin de l'origine du coup ; explosion pile sous les pieds → loin du tireur.
  let raw = sub(target.pos, opts.fromPos);
  if (Math.hypot(raw[0], raw[2]) < 0.6) raw = sub(target.pos, ctx.state.players[opts.attacker].pos);
  const dir = normalizeXZ(raw);
  const launch = launchVector(dir, speed);
  const outcome = predictLaunch(ctx, target.pos, launch);
  const willKo = outcome.kind === 'ko';

  if (opts.weapon.trait === 'healing') {
    const attacker = ctx.state.players[opts.attacker];
    attacker.pct = Math.max(0, attacker.pct - Math.round(damage * TRAIT_TUNING.healing.lifestealRatio));
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
    damage, knockback: launch, crit, pos: opts.impactPos,
    pct: target.pct, launch, willKo,
  });
  if (speed > 0.5) startLaunch(ctx, opts.target, launch, opts.attacker);
}

/** Splash générique (grenade, ou tout coup avec le trait `explosive`) : dégâts à qui est dans le rayon,
 * jamais au tireur lui-même (pas de dégâts à soi-même dans cette version). */
export function applySplash(ctx: Ctx, opts: Omit<ApplyHitOptions, 'target'> & { center: Vec3; radius: number }): void {
  for (const p of [0, 1] as const) {
    if (p === opts.attacker) continue;
    const state = ctx.state.players[p];
    if (!state.alive) continue;
    const d = Math.hypot(state.pos[0] - opts.center[0], state.pos[1] + 0.9 - opts.center[1], state.pos[2] - opts.center[2]);
    if (d > opts.radius + 0.4) continue;
    const falloff = 1 - Math.min(1, d / (opts.radius + 0.4)) * TRAIT_TUNING.explosive.falloff;
    applyHit(ctx, { ...opts, target: p, damageMultiplier: (opts.damageMultiplier ?? 1) * Math.max(0.6, falloff) });
  }
}

/** Système à appeler chaque frame : fait voler les éjectés (launch.ts). */
export function installDamageSystems(ctx: Ctx): void {
  ctx.loop.addSystem('gameplay-launch', (dt) => stepLaunches(ctx, dt), 60); // avant la physique (100)
}
