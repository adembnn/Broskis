// Résout un `fire()` en projectile(s) réel(s) : rafale du blaster, cloche de la grenade, tir direct du
// throwable, mur du shield. Choréo caméra/ralenti au lâcher, validée par Adem le 26/09 :
//   lâcher → `camera:cue{turn-swing}` + `slowmo` (1er tir seulement) → vol à vitesse constante →
//   fin de bascule → `projectile:incoming` → fenêtre de parade → impact.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { applyHit, applySplash } from './damage';
import { emitPerfectReflectReward, registerIncoming } from './parry';
import { endTurn, setPhase } from './phases';
import { addShieldBody, getRuntime, otherPlayer } from './runtime';
import {
  BLASTER_SHOTS_MAX, BLASTER_SHOTS_MIN, BLASTER_SHOT_INTERVAL_MS, BLASTER_SPREAD_DEG_MAX, BLASTER_SPREAD_DEG_MIN,
  CAMERA_SWING_MS, FIRE_SWING_SLOWMO, MIN_REMAINING_FLIGHT_MS, REFLECT_RETURN_MS, SHIELD_HEIGHT_MAX, SHIELD_HEIGHT_MIN,
  SHIELD_PLACE_DISTANCE, SHIELD_THICKNESS, SHIELD_WIDTH_MAX, SHIELD_WIDTH_MIN, SHOT_ORIGIN_HEIGHT, TRAIT_TUNING,
  WEAPON_COOLDOWN_TURNS,
} from './tuning';
import { lerp, predictTrajectory, type TrajectoryResult } from './trajectory';
import { add, length, normalize, sub, yawQuaternion } from './vec3';

let seq = 0;
function nextId(): string { return `proj-${++seq}`; }

function matchIsOver(ctx: Ctx): boolean {
  return ctx.state.winner != null || ctx.state.phase === 'ko' || ctx.state.phase === 'end';
}

export function aimOrigin(ctx: Ctx, player: PlayerId): Vec3 {
  const p = ctx.state.players[player].pos;
  return [p[0], p[1] + SHOT_ORIGIN_HEIGHT, p[2]];
}

function endTurnSoon(ctx: Ctx): void {
  if (matchIsOver(ctx)) return;
  void ctx.loop.wait(0.3).then(() => { if (!matchIsOver(ctx)) endTurn(ctx); });
}

/** Un seul projectile volant (un tir de rafale, la grenade, ou le throwable). */
function launchOne(
  ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, power: number,
  isFirstOfAction: boolean, onDone: () => void,
  index = 1, count = 1
): void {
  const target = otherPlayer(shooter);
  const traj = predictTrajectory(ctx, shooter, weapon, origin, dir, power);
  const id = nextId();

  let rawTravelMs = Math.max(1, traj.travelMs);
  if (weapon.trait === 'heavy') rawTravelMs /= TRAIT_TUNING.heavy.speedMult; // lourd = plus lent, donc plus long à voler
  const totalTravelMs = Math.max(rawTravelMs, CAMERA_SWING_MS + MIN_REMAINING_FLIGHT_MS);
  const distance = Math.max(0.01, length(sub(traj.impact, origin)));
  const speed = distance / (totalTravelMs / 1000); // vel reporté cohérent avec le temps de vol réellement utilisé

  ctx.bus.emit('projectile:spawn', { id, weapon, from: origin, vel: [dir[0] * speed, dir[1] * speed, dir[2] * speed] });
  if (isFirstOfAction) {
    ctx.bus.emit('camera:cue', { shot: 'turn-swing', target });
    ctx.bus.emit('slowmo', FIRE_SWING_SLOWMO);
  }

  const threatensDefender = weapon.category === 'grenade' || traj.hitPlayer === target;
  if (!threatensDefender) {
    // Rate tout (mur, esquive de la trajectoire...) : pas de parade possible, mais on garde le rythme visuel.
    setTimeout(onDone, totalTravelMs);
    return;
  }
  registerIncoming(ctx, {
    id, player: target, attacker: shooter, weapon, index, count, totalTravelMs, incomingDelayMs: CAMERA_SWING_MS,
    onResolve: (outcome) => {
      resolveImpact(ctx, shooter, target, weapon, origin, traj, outcome.grade);
      onDone();
    },
  });
}

function resolveImpact(
  ctx: Ctx, shooter: PlayerId, target: PlayerId, weapon: Weapon, origin: Vec3, traj: TrajectoryResult,
  grade: 'perfect' | 'good' | 'miss',
): void {
  if (grade === 'perfect') {
    if (weapon.category === 'throwable' || weapon.category === 'shield') reflectBack(ctx, shooter, target, weapon, traj);
    return; // 0 dégât, blaster/grenade ne se renvoient pas (voir parry.ts)
  }
  const damageMultiplier = grade === 'good' ? 0.5 : 1;
  // Trait `explosive` : ajoute un souffle même à une catégorie qui n'en a normalement pas (blaster/throwable).
  const radius = traj.splashRadius + (weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0);
  // fromPos détermine la DIRECTION du recul : l'origine du tir pour un impact direct (loin du tireur),
  // le centre de l'explosion pour une grenade/un souffle (loin du point d'impact) — jamais le point
  // d'impact lui-même pour un tir direct, sinon la cible == le point d'impact et la direction devient dégénérée.
  const fromPos = radius > 0 ? traj.impact : origin;
  const resolved = { ...traj, splashRadius: radius };
  // Trait `sticky` : le coup adhère un instant avant d'infliger ses dégâts (fusible), plutôt qu'à l'impact.
  if (weapon.trait === 'sticky') {
    setTimeout(() => { if (!matchIsOver(ctx)) resolveDamage(ctx, shooter, target, weapon, resolved, fromPos, damageMultiplier); }, TRAIT_TUNING.sticky.fuseMs);
  } else {
    resolveDamage(ctx, shooter, target, weapon, resolved, fromPos, damageMultiplier);
  }
}

function resolveDamage(ctx: Ctx, attacker: PlayerId, target: PlayerId, weapon: Weapon, traj: TrajectoryResult, fromPos: Vec3, damageMultiplier: number): void {
  if (traj.splashRadius > 0) {
    applySplash(ctx, { attacker, weapon, damageMultiplier, impactPos: traj.impact, fromPos, center: traj.impact, radius: traj.splashRadius });
  } else {
    applyHit(ctx, { attacker, target, weapon, damageMultiplier, impactPos: traj.impact, fromPos });
  }
}

/** Parade PARFAITE sur throwable/shield : renvoyé sur l'attaquant d'origine, plein dégât, récompense (ralenti).
 * `fromPos = traj.impact` (≈ position du défenseur qui a renvoyé le coup) : direction non dégénérée puisque
 * la nouvelle cible est l'attaquant d'origine, ailleurs sur le terrain. */
function reflectBack(ctx: Ctx, shooter: PlayerId, target: PlayerId, weapon: Weapon, traj: TrajectoryResult): void {
  emitPerfectReflectReward(ctx);
  const returnId = nextId();
  const backDir = normalize(sub(ctx.state.players[shooter].pos, traj.impact));
  ctx.bus.emit('projectile:spawn', { id: returnId, weapon, from: traj.impact, vel: [backDir[0] * 12, backDir[1] * 12, backDir[2] * 12] });
  setTimeout(() => {
    if (matchIsOver(ctx)) return;
    resolveDamage(ctx, target, shooter, weapon, { ...traj, splashRadius: 0 }, traj.impact, 1);
  }, REFLECT_RETURN_MS);
}

function yawJitter(ctx: Ctx, dir: Vec3, spreadDeg: number): Vec3 {
  const rad = (ctx.rng.range(-spreadDeg, spreadDeg) * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return normalize([dir[0] * cos + dir[2] * sin, dir[1], -dir[0] * sin + dir[2] * cos]);
}

function fireBlasterBurst(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, power: number, onAllDone: () => void): void {
  const shots = Math.round(lerp(BLASTER_SHOTS_MIN, BLASTER_SHOTS_MAX, weapon.stats.b));
  const spread = lerp(BLASTER_SPREAD_DEG_MAX, BLASTER_SPREAD_DEG_MIN, weapon.stats.c); // c = accuracy : plus haut = plus précis
  let remaining = shots;
  for (let i = 0; i < shots; i++) {
    setTimeout(() => {
      if (matchIsOver(ctx)) return;
      launchOne(ctx, shooter, weapon, origin, yawJitter(ctx, dir, spread), power, i === 0, () => {
        remaining -= 1;
        if (remaining <= 0) onAllDone();
      }, i + 1, shots);
    }, i * BLASTER_SHOT_INTERVAL_MS);
  }
}

function placeShield(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3): void {
  const pos = add(origin, dir, SHIELD_PLACE_DISTANCE);
  const width = lerp(SHIELD_WIDTH_MIN, SHIELD_WIDTH_MAX, weapon.stats.b);
  const height = lerp(SHIELD_HEIGHT_MIN, SHIELD_HEIGHT_MAX, weapon.stats.a);
  const yaw = Math.atan2(dir[0], dir[2]);
  const { RAPIER: R, world } = ctx.physics;
  const groundPos: Vec3 = [pos[0], height / 2, pos[2]];
  const body = world.createRigidBody(
    R.RigidBodyDesc.fixed().setTranslation(groundPos[0], groundPos[1], groundPos[2])
      .setRotation(yawQuaternion(yaw)).setUserData({ kind: 'shield', player: shooter }),
  );
  world.createCollider(R.ColliderDesc.cuboid(width / 2, height / 2, SHIELD_THICKNESS / 2).setFriction(0.8), body);
  addShieldBody(body);
  weapon.cooldown = WEAPON_COOLDOWN_TURNS;
  ctx.bus.emit('shield:placed', { player: shooter, weapon, pos: groundPos });
}

/** Point d'entrée unique (souris ou `gameHooks.fire`) : résout l'arme sélectionnée du joueur actif. */
export function performFire(ctx: Ctx, shooter: PlayerId, power: number): void {
  const state = ctx.state.players[shooter];
  const weapon = state.weapons[state.selected];
  if (!weapon || weapon.cooldown > 0) return;
  const clampedPower = Math.max(0, Math.min(1, power));
  const origin = aimOrigin(ctx, shooter);
  const dir = getRuntime().players[shooter].aimDir;

  setPhase(ctx, 'resolve');
  ctx.bus.emit('fire', { player: shooter, weapon, dir, power: clampedPower });

  if (weapon.category === 'shield') {
    placeShield(ctx, shooter, weapon, origin, dir);
    endTurnSoon(ctx);
  } else if (weapon.category === 'blaster') {
    fireBlasterBurst(ctx, shooter, weapon, origin, dir, clampedPower, () => endTurnSoon(ctx));
  } else {
    launchOne(ctx, shooter, weapon, origin, dir, clampedPower, true, () => endTurnSoon(ctx), 1, 1);
  }
  fireSplitFragments(ctx, shooter, weapon, origin, dir, clampedPower);
}

/** Trait `split` : quelques projectiles supplémentaires en éventail, en plus du tir principal ci-dessus.
 * Résolus indépendamment (ne retardent pas la fin du tour). */
function fireSplitFragments(ctx: Ctx, shooter: PlayerId, weapon: Weapon, origin: Vec3, dir: Vec3, power: number): void {
  if (weapon.trait !== 'split' || weapon.category === 'shield') return;
  for (let i = 0; i < TRAIT_TUNING.split.fragments; i++) {
    setTimeout(() => {
      if (matchIsOver(ctx)) return;
      launchOne(ctx, shooter, weapon, origin, yawJitter(ctx, dir, TRAIT_TUNING.split.spreadDeg), power, false, () => {}, i + 2, TRAIT_TUNING.split.fragments + 1);
    }, 70 * (i + 1));
  }
}
