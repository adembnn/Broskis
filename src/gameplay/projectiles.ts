// Projectiles temps réel : de vrais objets qui volent dans le monde à chaque image (on peut les esquiver),
// touchent le décor (murs, boucliers, sol) ou la capsule d'un perso. Au contact d'un perso qui BLOQUE :
// dégâts ÷ 3 et recul ÷ 2, ou PARADE PARFAITE si le blocage a commencé moins de 150 ms avant (renvoi,
// ralenti ×0,3, `parry:result`). `projectile:incoming` part 400 ms avant l'impact prévu (anneau de repère).
// Le visuel rejoue le même vol à partir de `projectile:spawn` (from, vel, gravity) et s'arrête à `projectile:end`.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { isGroundCollider } from './arena';
import { applyHit, applySplash } from './damage';
import type { ShotMods } from './formulas';
import { inFight } from './phases';
import { getRuntime, otherPlayer } from './runtime';
import { isInvulnerable } from './stocks';
import { CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS, GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, RT, SHOT_ORIGIN_HEIGHT, TRAIT_TUNING } from './tuning';
import { lerp } from './trajectory';

interface Projectile {
  id: string;
  owner: PlayerId;
  weapon: Weapon;
  pos: Vec3;
  vel: Vec3;
  gravity: number;
  radius: number;
  age: number;
  /** Rayon d'explosion (grenade, trait explosive), 0 sinon. */
  splash: number;
  mods: Partial<ShotMods>;
  /** Durée de vol prévue jusqu'à la cible (grenade) : sert au repère `projectile:incoming`. */
  flightS: number;
  incomingSent: boolean;
}

let seq = 0;
const live: Projectile[] = [];

export function aimOrigin(ctx: Ctx, player: PlayerId): Vec3 {
  const p = ctx.state.players[player].pos;
  return [p[0], p[1] + SHOT_ORIGIN_HEIGHT, p[2]];
}

export function clearProjectiles(): void {
  live.length = 0;
}

export function liveProjectiles(): readonly { id: string; owner: PlayerId; pos: Vec3; vel: Vec3 }[] {
  return live;
}

export function spawnProjectile(
  ctx: Ctx, owner: PlayerId, weapon: Weapon, from: Vec3, vel: Vec3, gravity: number, mods: Partial<ShotMods>, flightS = 0,
): void {
  const splash = weapon.category === 'grenade'
    ? lerp(GRENADE_RADIUS_MIN, GRENADE_RADIUS_MAX, weapon.stats.b) + (weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0)
    : weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0;
  const p: Projectile = {
    id: `proj-${++seq}`, owner, weapon, pos: [...from], vel: [...vel], gravity, radius: RT.radius[weapon.category] || 0.3,
    age: 0, splash, mods, flightS, incomingSent: false,
  };
  live.push(p);
  ctx.bus.emit('projectile:spawn', { id: p.id, weapon, from: [...from], vel: [...vel], gravity, owner });
}

function end(ctx: Ctx, p: Projectile, reason: 'hit' | 'world' | 'parried' | 'expired'): void {
  const i = live.indexOf(p);
  if (i < 0) return;
  live.splice(i, 1);
  ctx.bus.emit('projectile:end', { id: p.id, pos: [...p.pos], reason });
}

/** Distance du segment [a, b] à l'axe vertical de la capsule d'un perso ; renvoie le paramètre t le plus proche. */
function segmentToCapsule(a: Vec3, b: Vec3, feet: Vec3): { dist: number; t: number } {
  const y0 = feet[1] + CHARACTER_RADIUS, y1 = feet[1] + CHARACTER_RADIUS + 2 * CHARACTER_HALF_HEIGHT;
  let best = { dist: Infinity, t: 0 };
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
    const cy = Math.max(y0, Math.min(y1, y));
    const d = Math.hypot(x - feet[0], y - cy, z - feet[2]);
    if (d < best.dist) best = { dist: d, t };
  }
  return best;
}

/** Temps avant l'impact prévu (s) sur la cible : cloche = durée prévue restante ; tir tendu = distance / vitesse. */
function etaTo(p: Projectile, target: Vec3): number | null {
  if (p.gravity > 0) return p.flightS > 0 ? Math.max(0, p.flightS - p.age) : null;
  const sp = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
  if (sp < 1e-3) return null;
  const c: Vec3 = [target[0] - p.pos[0], target[1] + 0.9 - p.pos[1], target[2] - p.pos[2]];
  const along = (c[0] * p.vel[0] + c[1] * p.vel[1] + c[2] * p.vel[2]) / sp;
  if (along <= 0) return null;
  const lateral = Math.sqrt(Math.max(0, c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - along * along));
  return lateral < 1.4 ? along / sp : null;
}

function explode(ctx: Ctx, p: Projectile, at: Vec3, mods: Partial<ShotMods> = p.mods, damageMultiplier = 1): void {
  applySplash(ctx, { attacker: p.owner, weapon: p.weapon, impactPos: at, fromPos: at, center: at, radius: p.splash, mods, damageMultiplier });
}

/** Contact avec un perso : parade parfaite (renvoi), blocage (÷ 3 / ÷ 2) ou coup plein. */
function hitPlayer(ctx: Ctx, p: Projectile, target: PlayerId, at: Vec3): 'hit' | 'parried' {
  const ts = ctx.state.players[target];
  const trt = getRuntime().players[target];
  const shooterPos = ctx.state.players[p.owner].pos;
  if (ts.blocking) {
    const sinceBlock = performance.now() - trt.blockStartMs;
    if (sinceBlock <= RT.block.perfectMs) {
      // PARADE PARFAITE : renvoyé droit sur le tireur, un peu plus vite, au ralenti.
      ctx.bus.emit('parry:result', { player: target, grade: 'perfect', deltaMs: Math.round(sinceBlock) });
      ctx.bus.emit('slowmo', RT.parrySlowmo);
      const dir: Vec3 = [shooterPos[0] - at[0], shooterPos[1] + 1 - at[1], shooterPos[2] - at[2]];
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const sp = Math.max(RT.speed.throwable, Math.hypot(p.vel[0], p.vel[1], p.vel[2])) * RT.reflectSpeedMult;
      spawnProjectile(ctx, target, p.weapon, at, [(dir[0] / dl) * sp, (dir[1] / dl) * sp, (dir[2] / dl) * sp], 0,
        { ...p.mods, superDamage: 1, superLaunch: 1 });
      return 'parried';
    }
    ctx.bus.emit('parry:result', { player: target, grade: 'good', deltaMs: Math.round(sinceBlock) });
    const blocked = { ...p.mods, launchMult: (p.mods.launchMult ?? 1) * RT.block.launchMult };
    if (p.splash > 0 && p.weapon.category === 'grenade') explode(ctx, p, at, blocked, RT.block.damageMult);
    else applyHit(ctx, { attacker: p.owner, target, weapon: p.weapon, impactPos: at, fromPos: shooterPos, mods: blocked, damageMultiplier: RT.block.damageMult });
    return 'hit';
  }
  if (p.weapon.category === 'grenade') explode(ctx, p, at);
  else {
    applyHit(ctx, { attacker: p.owner, target, weapon: p.weapon, impactPos: at, fromPos: shooterPos, mods: p.mods });
    if (p.splash > 0) explode(ctx, p, at, { ...p.mods, fragment: 0.5 });
  }
  return 'hit';
}

/** Système : fait voler tous les projectiles (temps de jeu : le ralenti les ralentit). */
export function stepProjectiles(ctx: Ctx, dt: number): void {
  if (!inFight(ctx)) { for (const p of [...live]) end(ctx, p, 'expired'); return; }
  if (dt <= 0) return;
  const { RAPIER: R, world } = ctx.physics;
  for (const p of [...live]) {
    const target = otherPlayer(p.owner);
    const tpos = ctx.state.players[target].pos;
    const a: Vec3 = [p.pos[0], p.pos[1], p.pos[2]];
    p.vel = [p.vel[0], p.vel[1] - p.gravity * dt, p.vel[2]];
    const b: Vec3 = [a[0] + p.vel[0] * dt, a[1] + p.vel[1] * dt, a[2] + p.vel[2] * dt];
    p.age += dt;
    // Repère de parade : une seule fois, ~400 ms avant l'impact prévu sur la cible.
    if (!p.incomingSent) {
      const eta = etaTo(p, tpos);
      if (eta != null && eta * 1000 <= RT.incomingLeadMs) {
        p.incomingSent = true;
        ctx.bus.emit('projectile:incoming', { id: p.id, target, etaMs: Math.round(eta * 1000) });
      }
    }
    // Décor (sol, murs, boucliers) le long du segment.
    const seg: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(seg[0], seg[1], seg[2]);
    let worldT = Infinity;
    if (len > 1e-5) {
      const ray = new R.Ray({ x: a[0], y: a[1], z: a[2] }, { x: seg[0] / len, y: seg[1] / len, z: seg[2] / len });
      const hit = world.castRay(ray, len, true, undefined, undefined, undefined, undefined, (c: RAPIER.Collider) => isGroundCollider(c));
      if (hit) worldT = hit.timeOfImpact / len;
    }
    // Perso visé (capsule), s'il est touchable.
    let playerT = Infinity;
    if (!getRuntime().players[target].dead && !isInvulnerable(ctx, target)) {
      const c = segmentToCapsule(a, b, tpos);
      if (c.dist <= CHARACTER_RADIUS + p.radius) playerT = c.t;
    }
    if (playerT < Infinity && playerT <= worldT) {
      p.pos = [a[0] + seg[0] * playerT, a[1] + seg[1] * playerT, a[2] + seg[2] * playerT];
      end(ctx, p, hitPlayer(ctx, p, target, p.pos));
      continue;
    }
    if (worldT < Infinity) {
      p.pos = [a[0] + seg[0] * worldT, a[1] + seg[1] * worldT, a[2] + seg[2] * worldT];
      if (p.splash > 0) explode(ctx, p, p.pos);
      end(ctx, p, 'world');
      continue;
    }
    p.pos = b;
    if (p.age > RT.projectileMaxLifeS || p.pos[1] < -20) end(ctx, p, 'expired');
  }
}
