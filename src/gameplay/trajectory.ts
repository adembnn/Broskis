// Prédiction de trajectoire, partagée par la visée (aim.ts, prévisualisation) et la résolution réelle
// (projectiles.ts). Fonctions pures côté données (elles ne modifient ni les PV ni les armes) ; elles font
// seulement des requêtes Rapier en lecture (raycasts) pour savoir où un tir irait.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Category, Ctx, PlayerId, Trait, Vec3 } from '../core/types';
import { getRuntime, otherPlayer } from './runtime';
import {
  CATEGORY_TUNING, GRENADE_ARC_GRAVITY, GRENADE_BOUNCE_RESTITUTION, GRENADE_BOUNCES_MAX, GRENADE_BOUNCES_MIN,
  GRENADE_LIFT_RATIO, GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, SHIELD_PLACE_DISTANCE, TRAIT_TUNING,
} from './tuning';

interface TrajectoryWeapon { category: Category; stats: { a: number; b: number; c: number }; trait?: Trait }
import { add, fromRapier, normalize, toRapier } from './vec3';

export interface TrajectoryResult {
  path: Vec3[];
  impact: Vec3;
  /** Qui serait touché en direct (blaster/throwable) ou dans le rayon (grenade), le cas échéant. */
  hitPlayer: PlayerId | null;
  /** Temps de vol simulé jusqu'à la résolution (ms), calculé AU LANCER pour la parade (voir parry.ts). */
  travelMs: number;
  /** Rayon d'effet au point final (grenade uniquement, sinon 0). */
  splashRadius: number;
  bounces: Vec3[];
}

/** Stat (1..6) → une plage de tuning.ts. Partagé avec projectiles.ts (rafale, bouclier). */
export function lerp(min: number, max: number, stat1to6: number): number {
  return min + ((stat1to6 - 1) / 5) * (max - min);
}

/** Rayon Rapier (avec normale, pour les rebonds) ; excluant le collider du tireur. */
function castFrom(ctx: Ctx, shooter: PlayerId, origin: Vec3, dir: Vec3, maxToi: number): RAPIER.RayColliderIntersection | null {
  const { RAPIER: R, world } = ctx.physics;
  const shooterCollider = getRuntime().players[shooter].collider ?? undefined;
  const ray = new R.Ray(toRapier(origin), toRapier(dir));
  return world.castRayAndGetNormal(ray, maxToi, true, undefined, undefined, shooterCollider);
}

function hitKind(hit: RAPIER.RayColliderIntersection): { kind: string; player?: PlayerId } {
  const data = hit.collider.parent()?.userData as { kind?: string; player?: PlayerId } | undefined;
  return { kind: data?.kind ?? 'prop', player: data?.player };
}

/** Blaster / throwable : ligne droite, arrêtée par le premier obstacle (mur, bouclier ou joueur adverse). */
function simulateStraight(ctx: Ctx, shooter: PlayerId, weapon: TrajectoryWeapon, origin: Vec3, dir: Vec3, power: number): TrajectoryResult {
  const tuning = CATEGORY_TUNING[weapon.category];
  const speed = tuning.speed * (0.7 + 0.5 * power);
  const range = tuning.maxRange;
  const hit = castFrom(ctx, shooter, origin, dir, range);
  const distance = hit ? hit.timeOfImpact : range;
  const impact = add(origin, dir, distance);
  const target = otherPlayer(shooter);
  const info = hit ? hitKind(hit) : null;
  const hitPlayer = info && info.kind === 'player' && info.player === target ? target : null;
  const travelMs = (distance / speed) * 1000;
  return { path: [origin, impact], impact, hitPlayer, travelMs, splashRadius: 0, bounces: [] };
}

/** Grenade : balistique en cloche, rebonds, puis explosion (rayon) au point de repos ou au bout des rebonds. */
function simulateArc(ctx: Ctx, shooter: PlayerId, weapon: TrajectoryWeapon, origin: Vec3, dir: Vec3, power: number): TrajectoryResult {
  const tuning = CATEGORY_TUNING.grenade;
  const speed = tuning.speed * (0.7 + 0.6 * power);
  const gravity = GRENADE_ARC_GRAVITY;
  let pos = origin;
  // Portance ajoutée pour une vraie cloche haute (gravité déjà réduite par rapport au monde physique).
  let vel: Vec3 = [dir[0] * speed, dir[1] * speed + speed * GRENADE_LIFT_RATIO, dir[2] * speed];
  const path: Vec3[] = [pos];
  const bounces: Vec3[] = [];
  // Trait `bouncy` : quelques rebonds de plus que le tirage de la stat « bounce » (c).
  let bouncesLeft = Math.round(lerp(GRENADE_BOUNCES_MIN, GRENADE_BOUNCES_MAX, weapon.stats.c))
    + (weapon.trait === 'bouncy' ? TRAIT_TUNING.bouncy.extraBounces : 0);
  const dt = 1 / 30;
  let t = 0;
  const maxSteps = 240;
  let traveled = 0;
  for (let i = 0; i < maxSteps; i++) {
    vel = [vel[0], vel[1] - gravity * dt, vel[2]];
    const step: Vec3 = [vel[0] * dt, vel[1] * dt, vel[2] * dt];
    const stepLen = Math.hypot(step[0], step[1], step[2]);
    if (stepLen > 0.0001) {
      const hit = castFrom(ctx, shooter, pos, normalize(step), stepLen);
      if (hit) {
        const info = hitKind(hit);
        const hitPoint = add(pos, normalize(step), hit.timeOfImpact);
        if (info.kind === 'player' && info.player === otherPlayer(shooter)) {
          path.push(hitPoint);
          return finishArc(shooter, hitPoint, path, bounces, t + (hit.timeOfImpact / stepLen) * dt, weapon.stats);
        }
        if (bouncesLeft <= 0) {
          path.push(hitPoint);
          return finishArc(shooter, hitPoint, path, bounces, t + (hit.timeOfImpact / stepLen) * dt, weapon.stats);
        }
        bouncesLeft -= 1;
        bounces.push(hitPoint);
        const n = fromRapier(hit.normal ?? { x: 0, y: 1, z: 0 });
        const vn = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
        vel = [
          (vel[0] - 2 * vn * n[0]) * GRENADE_BOUNCE_RESTITUTION,
          (vel[1] - 2 * vn * n[1]) * GRENADE_BOUNCE_RESTITUTION,
          (vel[2] - 2 * vn * n[2]) * GRENADE_BOUNCE_RESTITUTION,
        ];
        pos = hitPoint;
        path.push(pos);
        t += (hit.timeOfImpact / stepLen) * dt;
        continue;
      }
    }
    pos = add(pos, step);
    path.push(pos);
    t += dt;
    traveled += stepLen;
    if (traveled > tuning.maxRange * 2) break;
  }
  return finishArc(shooter, pos, path, bounces, t, weapon.stats);
}

function finishArc(shooter: PlayerId, impact: Vec3, path: Vec3[], bounces: Vec3[], t: number, stats: { a: number; b: number; c: number }): TrajectoryResult {
  const radius = lerp(GRENADE_RADIUS_MIN, GRENADE_RADIUS_MAX, stats.b);
  return { path, impact, hitPlayer: otherPlayer(shooter), travelMs: t * 1000, splashRadius: radius, bounces };
}

function simulateShield(origin: Vec3, dir: Vec3): TrajectoryResult {
  const impact = add(origin, dir, SHIELD_PLACE_DISTANCE);
  return { path: [origin, impact], impact, hitPlayer: null, travelMs: 0, splashRadius: 0, bounces: [] };
}

export function predictTrajectory(
  ctx: Ctx,
  shooter: PlayerId,
  weapon: TrajectoryWeapon,
  origin: Vec3,
  dirRaw: Vec3,
  power: number,
): TrajectoryResult {
  const dir = normalize(dirRaw);
  if (weapon.category === 'shield') return simulateShield(origin, dir);
  if (weapon.category === 'grenade') return simulateArc(ctx, shooter, weapon, origin, dir, power);
  return simulateStraight(ctx, shooter, weapon, origin, dir, power);
}
