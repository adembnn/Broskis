// Armes et blocage en temps réel, visée VERROUILLÉE sur l'adversaire (plan/PIVOT-TEMPS-REEL.md) :
// - armes 1/2/3 (sélection libre), recharge en secondes après usage (`cooldowns`, `weapon:ready`) ;
// - tir maintenu = charge (0 → 1 entre 0,3 et 1 s), relâcher = tir ; blaster en rafale de 3 avec avance sur
//   la vitesse de l'adversaire, grenade en cloche calculée jusqu'à lui, throwable tendu, bouclier = mur de 5 s ;
// - blocage maintenu (`block`) : dégâts ÷ 3, recul ÷ 2 ; le début du blocage date la parade parfaite
//   (projectiles.ts). Bloquer annule une charge en cours.
// - BRO SMASH : le premier tir offensif après `super:ready` (bro.ts) : `super:fire`, recul ×1,8, dégâts ×1,5.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { consumeSuper } from './bro';
import type { PlayerInput } from './controls';
import type { ShotMods } from './formulas';
import { inFight } from './phases';
import { aimOrigin, spawnProjectile } from './projectiles';
import { getRuntime, otherPlayer } from './runtime';
import { BRO_SMASH, RT, SHIELD_HEIGHT_MAX, SHIELD_HEIGHT_MIN, SHIELD_PLACE_DISTANCE, SHIELD_THICKNESS, SHIELD_WIDTH_MAX, SHIELD_WIDTH_MIN } from './tuning';
import { lerp } from './trajectory';
import { yawQuaternion } from './vec3';

const WEAPON_KEYS = ['weapon1', 'weapon2', 'weapon3'] as const;

function canAct(ctx: Ctx, player: PlayerId): boolean {
  const rt = getRuntime().players[player];
  return inFight(ctx) && !rt.dead && !rt.launch && !rt.ledge;
}

/** Charge (0..1) d'un tir maintenu depuis `heldS` secondes. */
export function chargeFor(heldS: number): number {
  return Math.max(0, Math.min(1, (heldS - RT.chargeMinS) / (RT.chargeFullS - RT.chargeMinS)));
}

function setBlocking(ctx: Ctx, player: PlayerId, on: boolean, atMs: number): void {
  const ps = ctx.state.players[player];
  const rt = getRuntime().players[player];
  if (ps.blocking === on) return;
  ps.blocking = on;
  // Anti-martelage : un blocage relancé juste après en avoir lâché un ne compte pas pour la parade parfaite.
  if (on) rt.blockStartMs = atMs - rt.blockEndMs < RT.block.remashMs ? -1e9 : atMs;
  else rt.blockEndMs = atMs;
  ctx.bus.emit('block', { player, on });
}

/** Point visé : poitrine de l'adversaire, avec une avance selon sa vitesse (temps de vol du projectile). */
function leadTarget(ctx: Ctx, shooter: PlayerId, speed: number): Vec3 {
  const t = otherPlayer(shooter);
  const tp = ctx.state.players[t].pos;
  const v = getRuntime().players[t].vel;
  const o = aimOrigin(ctx, shooter);
  const dist = Math.hypot(tp[0] - o[0], tp[2] - o[2]);
  const tof = speed > 0 ? Math.min(0.8, dist / speed) : 0;
  const k = 0.7; // avance partielle : on peut encore esquiver en changeant de direction
  return [tp[0] + v[0] * tof * k, tp[1] + 1.0, tp[2] + v[2] * tof * k];
}

function placeShield(ctx: Ctx, shooter: PlayerId, weapon: Weapon): void {
  const me = ctx.state.players[shooter].pos;
  const them = ctx.state.players[otherPlayer(shooter)].pos;
  const dx = them[0] - me[0], dz = them[2] - me[2];
  const l = Math.hypot(dx, dz) || 1;
  const width = lerp(SHIELD_WIDTH_MIN, SHIELD_WIDTH_MAX, weapon.stats.b);
  const height = lerp(SHIELD_HEIGHT_MIN, SHIELD_HEIGHT_MAX, weapon.stats.a);
  const pos: Vec3 = [me[0] + (dx / l) * SHIELD_PLACE_DISTANCE, me[1] + height / 2, me[2] + (dz / l) * SHIELD_PLACE_DISTANCE];
  const { RAPIER: R, world } = ctx.physics;
  const body = world.createRigidBody(
    R.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2])
      .setRotation(yawQuaternion(Math.atan2(dx, dz))).setUserData({ kind: 'shield', player: shooter }),
  );
  world.createCollider(R.ColliderDesc.cuboid(width / 2, height / 2, SHIELD_THICKNESS / 2).setFriction(0.8), body);
  getRuntime().shieldBodies.push({ body, until: ctx.loop.time + RT.shieldLifeS });
  ctx.bus.emit('shield:placed', { player: shooter, weapon, pos });
}

/** Tir de l'arme choisie avec la charge `charge` (0..1). Renvoie faux si impossible (recharge, hors combat…). */
export function fireWeapon(ctx: Ctx, shooter: PlayerId, charge: number): boolean {
  const ps = ctx.state.players[shooter];
  const rt = getRuntime().players[shooter];
  const idx = ps.selected;
  const weapon = ps.weapons[idx];
  if (!weapon || !canAct(ctx, shooter) || (ps.cooldowns[idx] ?? 0) > 0) return false;
  rt.charging = false;
  ps.charge = 0;
  const c = Math.max(0, Math.min(1, charge));
  const origin = aimOrigin(ctx, shooter);
  const mods: Partial<ShotMods> = { charge: c };
  ps.cooldowns[idx] = RT.cooldownS[weapon.category];
  const dirTo = (p: Vec3): Vec3 => {
    const d: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  const aimAt = leadTarget(ctx, shooter, RT.speed[weapon.category] || 12);
  rt.aimDir = dirTo(aimAt);
  ctx.bus.emit('fire', { player: shooter, weapon, dir: rt.aimDir, power: c });
  if (weapon.category !== 'shield' && consumeSuper(ctx, shooter)) {
    mods.superDamage = BRO_SMASH.damageMult;
    mods.superLaunch = BRO_SMASH.launchMult;
    ctx.bus.emit('super:fire', { player: shooter });
  }
  const seq = getRuntime().matchSeq;
  if (weapon.category === 'shield') {
    placeShield(ctx, shooter, weapon);
  } else if (weapon.category === 'blaster') {
    const speed = RT.speed.blaster * (1 + RT.chargeSpeedBonus * c);
    for (let i = 0; i < RT.blasterShots; i++) {
      ctx.loop.later(i * RT.blasterIntervalS, () => {
        if (getRuntime().matchSeq !== seq || !inFight(ctx) || getRuntime().players[shooter].dead) return;
        const o = aimOrigin(ctx, shooter);
        const target = leadTarget(ctx, shooter, speed);
        const d: Vec3 = [target[0] - o[0], target[1] - o[1], target[2] - o[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        spawnProjectile(ctx, shooter, weapon, o, [(d[0] / l) * speed, (d[1] / l) * speed, (d[2] / l) * speed], 0, { ...mods, burst: RT.blasterShots });
      });
    }
  } else if (weapon.category === 'grenade') {
    // Cloche calculée jusqu'à l'adversaire : durée de vol selon la distance, vitesse initiale en conséquence.
    const t0 = ctx.state.players[otherPlayer(shooter)].pos;
    const dist0 = Math.hypot(t0[0] - origin[0], t0[2] - origin[2]);
    const T = Math.min(RT.grenadeFlight.max, RT.grenadeFlight.min + dist0 * RT.grenadeFlight.perM);
    // Avance partielle sur la course de l'adversaire (il peut encore sortir de la zone en changeant de direction).
    const v = getRuntime().players[otherPlayer(shooter)].vel;
    const t: Vec3 = [t0[0] + v[0] * T * 0.5, t0[1], t0[2] + v[2] * T * 0.5];
    const dx = t[0] - origin[0], dz = t[2] - origin[2], dy = t[1] + 0.3 - origin[1];
    const g = RT.grenadeGravity;
    spawnProjectile(ctx, shooter, weapon, origin, [dx / T, (dy + 0.5 * g * T * T) / T, dz / T], g, mods, T);
  } else {
    const speed = RT.speed.throwable * (1 + RT.chargeSpeedBonus * c);
    spawnProjectile(ctx, shooter, weapon, origin, [rt.aimDir[0] * speed, rt.aimDir[1] * speed, rt.aimDir[2] * speed], 0, mods);
  }
  return true;
}

/** Armes, charge et blocage d'un joueur pour cette image. */
export function stepCombat(ctx: Ctx, player: PlayerId, input: PlayerInput, dt: number): void {
  const ps = ctx.state.players[player];
  const rt = getRuntime().players[player];
  // Recharges (en secondes de jeu) et signal « prête ».
  for (let i = 0; i < ps.cooldowns.length; i++) {
    if (ps.cooldowns[i] <= 0) continue;
    ps.cooldowns[i] = Math.max(0, ps.cooldowns[i] - dt);
    if (ps.cooldowns[i] === 0) ctx.bus.emit('weapon:ready', { player, index: i });
  }
  if (!canAct(ctx, player)) {
    rt.charging = false; ps.charge = 0;
    if (ps.blocking) setBlocking(ctx, player, false, performance.now());
    return;
  }
  // Choix d'arme (libre, même en recharge : on la prépare).
  WEAPON_KEYS.forEach((k, i) => {
    if (input.pressed.has(k) && i < ps.weapons.length && ps.selected !== i) {
      ps.selected = i;
      ctx.bus.emit('weapon:pick', { player, index: i });
    }
  });
  // Blocage maintenu : prioritaire, annule la charge.
  const blockHeld = input.held.has('parry') || input.pressed.has('parry');
  if (blockHeld !== ps.blocking) setBlocking(ctx, player, blockHeld, input.downAt.get('parry') ?? performance.now());
  if (ps.blocking) { rt.charging = false; ps.charge = 0; return; }
  // Tir : appui = début de charge, relâcher = tir (un appui très court = tir immédiat, charge 0).
  const now = performance.now();
  if (input.pressed.has('fire') && !rt.charging && (ps.cooldowns[ps.selected] ?? 0) <= 0) {
    rt.charging = true;
    rt.chargeStartMs = input.downAt.get('fire') ?? now;
  }
  if (rt.charging) {
    const heldS = (now - rt.chargeStartMs) / 1000;
    ps.charge = chargeFor(heldS);
    if (input.released.has('fire') || !input.held.has('fire') || heldS >= RT.autoReleaseS) {
      if (!fireWeapon(ctx, player, ps.charge)) { rt.charging = false; ps.charge = 0; } // arme changée en recharge
    }
  }
}

/** Retire les murs de bouclier expirés. */
export function stepShields(ctx: Ctx): void {
  const rt = getRuntime();
  for (let i = rt.shieldBodies.length - 1; i >= 0; i--) {
    const s = rt.shieldBodies[i];
    if (ctx.loop.time < s.until) continue;
    if (s.body.isValid()) ctx.physics.world.removeRigidBody(s.body);
    rt.shieldBodies.splice(i, 1);
  }
}
