// Résout un `fire()` en projectile(s) réel(s) : rafale du blaster, cloche de la grenade, tir direct du
// throwable, mur du shield. Choréo caméra/ralenti au lâcher, validée par Adem le 26/09 :
//   lâcher → `camera:cue{turn-swing}` + `slowmo` (1er tir seulement) → vol à vitesse constante →
//   fin de bascule → `projectile:incoming` → fenêtre de parade → impact.
// Règles v2 : BRO SMASH (`super:fire` au tir, recul ×1,8, dégâts ×1,5), le tour ne passe qu'une fois
// les éjections finies (`endTurnWhenSettled`).
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { consumeSuper } from './bro';
import { applyHit, applySplash } from './damage';
import type { ShotMods } from './formulas';
import { emitPerfectReflectReward, registerIncoming } from './parry';
import { endTurnWhenSettled, matchIsOver, setPhase } from './phases';
import { addShieldBody, getRuntime, otherPlayer } from './runtime';
import {
  BLASTER_SHOTS_MAX, BLASTER_SHOTS_MIN, BLASTER_SHOT_INTERVAL_MS, BLASTER_SPREAD_DEG_MAX, BLASTER_SPREAD_DEG_MIN,
  BRO_SMASH, CAMERA_SWING_MS, FIRE_SWING_SLOWMO, MIN_REMAINING_FLIGHT_MS, REFLECT_RETURN_MS, SHIELD_HEIGHT_MAX,
  SHIELD_HEIGHT_MIN, SHIELD_PLACE_DISTANCE, SHIELD_THICKNESS, SHIELD_WIDTH_MAX, SHIELD_WIDTH_MIN, SHOT_ORIGIN_HEIGHT,
  TRAIT_TUNING, WEAPON_COOLDOWN_TURNS,
} from './tuning';
import { lerp, predictTrajectory, type TrajectoryResult } from './trajectory';
import { add, length, normalize, sub, yawQuaternion } from './vec3';

let seq = 0;
function nextId(): string { return `proj-${++seq}`; }

/** Le match a-t-il changé depuis le tir (revanche) ? Une minuterie périmée ne résout plus rien. */
function stale(ctx: Ctx, matchSeq: number): boolean {
  return matchIsOver(ctx) || getRuntime().matchSeq !== matchSeq;
}

export function aimOrigin(ctx: Ctx, player: PlayerId): Vec3 {
  const p = ctx.state.players[player].pos;
  return [p[0], p[1] + SHOT_ORIGIN_HEIGHT, p[2]];
}

function endTurnSoon(ctx: Ctx, matchSeq: number): void {
  if (stale(ctx, matchSeq)) return;
  void ctx.loop.wait(0.3).then(() => { if (!stale(ctx, matchSeq)) endTurnWhenSettled(ctx); });
}

/** Un seul projectile volant (un tir de rafale, la grenade, ou le throwable). */
function launchOne(
  ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, mods: Partial<ShotMods>,
  isFirstOfAction: boolean, onDone: () => void, aimPoint: Vec3 | null,
  index = 1, count = 1,
): void {
  const target = otherPlayer(shooter);
  const matchSeq = getRuntime().matchSeq;
  const traj = predictTrajectory(ctx, shooter, weapon, origin, dir, mods.charge ?? 0.5, aimPoint);
  const id = nextId();

  let rawTravelMs = Math.max(1, traj.travelMs);
  if (weapon.trait === 'heavy') rawTravelMs /= TRAIT_TUNING.heavy.speedMult; // lourd = plus lent, donc plus long à voler
  const totalTravelMs = Math.max(rawTravelMs, CAMERA_SWING_MS + MIN_REMAINING_FLIGHT_MS);
  const distance = Math.max(0.01, length(sub(traj.impact, origin)));
  const speed = distance / (totalTravelMs / 1000); // vel reporté cohérent avec le temps de vol réellement utilisé
  const vdir = weapon.category === 'grenade' ? normalize(sub(traj.impact, origin)) : dir;

  ctx.bus.emit('projectile:spawn', { id, weapon, from: origin, vel: [vdir[0] * speed, vdir[1] * speed, vdir[2] * speed] });
  if (isFirstOfAction) {
    ctx.bus.emit('camera:cue', { shot: 'turn-swing', target });
    ctx.bus.emit('slowmo', FIRE_SWING_SLOWMO);
  }

  const tp = ctx.state.players[target].pos;
  const splashReach = traj.splashRadius > 0
    && Math.hypot(tp[0] - traj.impact[0], tp[2] - traj.impact[2]) <= traj.splashRadius + (weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0) + 0.4;
  const threatensDefender = weapon.category === 'grenade' ? splashReach : traj.hitPlayer === target;
  if (!threatensDefender) {
    // Rate tout (mur, esquive de la trajectoire...) : pas de parade possible, mais on garde le rythme visuel.
    setTimeout(() => { if (!stale(ctx, matchSeq)) onDone(); }, totalTravelMs);
    return;
  }
  registerIncoming(ctx, {
    id, player: target, attacker: shooter, weapon, index, count, totalTravelMs, incomingDelayMs: CAMERA_SWING_MS,
    onResolve: (outcome) => {
      if (stale(ctx, matchSeq)) return;
      resolveImpact(ctx, shooter, target, weapon, origin, traj, outcome.grade, mods);
      onDone();
    },
  });
}

function resolveImpact(
  ctx: Ctx, shooter: PlayerId, target: PlayerId, weapon: Weapon, origin: Vec3, traj: TrajectoryResult,
  grade: 'perfect' | 'good' | 'miss', mods: Partial<ShotMods>,
): void {
  if (grade === 'perfect') {
    if (weapon.category === 'throwable' || weapon.category === 'shield') reflectBack(ctx, shooter, target, weapon, traj, mods);
    return; // 0 dégât, blaster/grenade ne se renvoient pas (voir parry.ts)
  }
  const damageMultiplier = grade === 'good' ? 0.5 : 1;
  // Trait `explosive` : ajoute un souffle même à une catégorie qui n'en a normalement pas (blaster/throwable).
  const radius = traj.splashRadius + (weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0);
  // fromPos détermine la DIRECTION du recul : l'origine du tir pour un impact direct (loin du tireur),
  // le centre de l'explosion pour une grenade/un souffle (loin du point d'impact).
  const fromPos = radius > 0 && weapon.category === 'grenade' ? traj.impact : origin;
  const resolved = { ...traj, splashRadius: radius };
  const matchSeq = getRuntime().matchSeq;
  // Trait `sticky` : le coup adhère un instant avant d'infliger ses dégâts (fusible), plutôt qu'à l'impact.
  if (weapon.trait === 'sticky') {
    setTimeout(() => { if (!stale(ctx, matchSeq)) resolveDamage(ctx, shooter, target, weapon, resolved, fromPos, damageMultiplier, mods); }, TRAIT_TUNING.sticky.fuseMs);
  } else {
    resolveDamage(ctx, shooter, target, weapon, resolved, fromPos, damageMultiplier, mods);
  }
}

function resolveDamage(
  ctx: Ctx, attacker: PlayerId, target: PlayerId, weapon: Weapon, traj: TrajectoryResult, fromPos: Vec3,
  damageMultiplier: number, mods: Partial<ShotMods>,
): void {
  if (traj.splashRadius > 0) {
    applySplash(ctx, { attacker, weapon, damageMultiplier, impactPos: traj.impact, fromPos, center: traj.impact, radius: traj.splashRadius, mods });
  } else {
    applyHit(ctx, { attacker, target, weapon, damageMultiplier, impactPos: traj.impact, fromPos, mods });
  }
}

/** Parade PARFAITE sur throwable/shield : renvoyé sur l'attaquant d'origine, plein dégât, récompense (ralenti). */
function reflectBack(ctx: Ctx, shooter: PlayerId, target: PlayerId, weapon: Weapon, traj: TrajectoryResult, mods: Partial<ShotMods>): void {
  emitPerfectReflectReward(ctx);
  const returnId = nextId();
  const backDir = normalize(sub(ctx.state.players[shooter].pos, traj.impact));
  ctx.bus.emit('projectile:spawn', { id: returnId, weapon, from: traj.impact, vel: [backDir[0] * 12, backDir[1] * 12, backDir[2] * 12] });
  const matchSeq = getRuntime().matchSeq;
  setTimeout(() => {
    if (stale(ctx, matchSeq)) return;
    resolveDamage(ctx, target, shooter, weapon, { ...traj, splashRadius: 0 }, traj.impact, 1, { ...mods, superDamage: 1, superLaunch: 1 });
  }, REFLECT_RETURN_MS);
}

function yawJitter(ctx: Ctx, dir: Vec3, spreadDeg: number): Vec3 {
  const rad = (ctx.rng.range(-spreadDeg, spreadDeg) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return normalize([dir[0] * cos + dir[2] * sin, dir[1], -dir[0] * sin + dir[2] * cos]);
}

export function blasterShots(weapon: Weapon): number {
  return Math.round(lerp(BLASTER_SHOTS_MIN, BLASTER_SHOTS_MAX, weapon.stats.b));
}

function fireBlasterBurst(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, mods: Partial<ShotMods>, onAllDone: () => void): void {
  const shots = blasterShots(weapon);
  const spread = lerp(BLASTER_SPREAD_DEG_MAX, BLASTER_SPREAD_DEG_MIN, weapon.stats.c); // c = accuracy : plus haut = plus précis
  const matchSeq = getRuntime().matchSeq;
  let remaining = shots;
  for (let i = 0; i < shots; i++) {
    setTimeout(() => {
      if (stale(ctx, matchSeq)) return;
      // Le 1er tir part droit (visée calée) : la dispersion ne touche que les suivants.
      const d = i === 0 ? dir : yawJitter(ctx, dir, spread);
      launchOne(ctx, shooter, weapon, origin, d, { ...mods, burst: shots }, i === 0, () => {
        remaining -= 1;
        if (remaining <= 0) onAllDone();
      }, null, i + 1, shots);
    }, i * BLASTER_SHOT_INTERVAL_MS);
  }
}

function placeShield(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3): void {
  const pos = add(origin, dir, SHIELD_PLACE_DISTANCE);
  const width = lerp(SHIELD_WIDTH_MIN, SHIELD_WIDTH_MAX, weapon.stats.b);
  const height = lerp(SHIELD_HEIGHT_MIN, SHIELD_HEIGHT_MAX, weapon.stats.a);
  const yaw = Math.atan2(dir[0], dir[2]);
  const { RAPIER: R, world } = ctx.physics;
  const feetY = ctx.state.players[shooter].pos[1];
  const groundPos: Vec3 = [pos[0], feetY + height / 2, pos[2]];
  const body = world.createRigidBody(
    R.RigidBodyDesc.fixed().setTranslation(groundPos[0], groundPos[1], groundPos[2])
      .setRotation(yawQuaternion(yaw)).setUserData({ kind: 'shield', player: shooter }),
  );
  world.createCollider(R.ColliderDesc.cuboid(width / 2, height / 2, SHIELD_THICKNESS / 2).setFriction(0.8), body);
  addShieldBody(body);
  ctx.bus.emit('shield:placed', { player: shooter, weapon, pos: groundPos });
}

export interface FireOptions { nice?: boolean }

/** Point d'entrée unique (souris, F, tir automatique ou `gameHooks.fire`) : résout l'arme sélectionnée. */
export function performFire(ctx: Ctx, shooter: PlayerId, power: number, opts: FireOptions = {}): void {
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  if (shooter !== ctx.state.active) return;
  const state = ctx.state.players[shooter];
  const rt = getRuntime().players[shooter];
  if (rt.dead || rt.launch) return;
  const weapon = state.weapons[state.selected];
  if (!weapon || weapon.cooldown > 0) return;
  rt.charging = false;
  const clampedPower = Math.max(0, Math.min(1, power));
  const origin = aimOrigin(ctx, shooter);
  const dir = rt.aimDir;
  const matchSeq = getRuntime().matchSeq;
  const mods: Partial<ShotMods> = { charge: clampedPower, nice: !!opts.nice };

  setPhase(ctx, 'resolve');
  ctx.bus.emit('fire', { player: shooter, weapon, dir, power: clampedPower });
  // BRO SMASH : le prochain tir offensif après `super:ready` (pas la pose d'un bouclier).
  if (weapon.category !== 'shield' && consumeSuper(ctx, shooter)) {
    mods.superDamage = BRO_SMASH.damageMult;
    mods.superLaunch = BRO_SMASH.launchMult;
    ctx.bus.emit('super:fire', { player: shooter });
  }
  // Recharge : indisponible au prochain tour de son propriétaire (décrémentée au début de chacun de ses tours).
  weapon.cooldown = WEAPON_COOLDOWN_TURNS + 1;

  if (weapon.category === 'shield') {
    placeShield(ctx, shooter, weapon, origin, dir);
    endTurnSoon(ctx, matchSeq);
  } else if (weapon.category === 'blaster') {
    fireBlasterBurst(ctx, shooter, weapon, origin, dir, mods, () => endTurnSoon(ctx, matchSeq));
  } else {
    launchOne(ctx, shooter, weapon, origin, dir, mods, true, () => endTurnSoon(ctx, matchSeq), rt.aimPoint, 1, 1);
  }
  fireSplitFragments(ctx, shooter, weapon, origin, dir, mods);
}

/** Trait `split` : quelques projectiles supplémentaires en éventail, en plus du tir principal ci-dessus.
 * Résolus indépendamment (ne retardent pas la fin du tour). */
function fireSplitFragments(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, mods: Partial<ShotMods>): void {
  if (weapon.trait !== 'split' || weapon.category === 'shield') return;
  const matchSeq = getRuntime().matchSeq;
  for (let i = 0; i < TRAIT_TUNING.split.fragments; i++) {
    setTimeout(() => {
      if (stale(ctx, matchSeq)) return;
      const fragMods = { ...mods, superDamage: 1, superLaunch: 1, fragment: TRAIT_TUNING.split.fragmentDamageMult };
      launchOne(ctx, shooter, weapon, origin, yawJitter(ctx, dir, TRAIT_TUNING.split.spreadDeg), fragMods, false, () => {}, null, i + 2, TRAIT_TUNING.split.fragments + 1);
    }, 70 * (i + 1));
  }
}
