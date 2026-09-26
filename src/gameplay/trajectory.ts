// Prédiction de trajectoire, partagée par la visée (aim.ts, prévisualisation) et la résolution réelle
// (projectiles.ts). Fonctions pures côté données (elles ne modifient ni les PV ni les armes) ; elles font
// seulement des requêtes Rapier en lecture (raycasts) pour savoir où un tir irait.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Category, Ctx, PlayerId, Trait, Vec3 } from '../core/types';
import { getRuntime, otherPlayer } from './runtime';
import {
  CATEGORY_TUNING, GRENADE_ARC_GRAVITY, GRENADE_LOB_DEG, GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, GRENADE_RANGE_MIN,
  GRENADE_RANGE_SPAN, SHIELD_PLACE_DISTANCE, SHOT_ORIGIN_HEIGHT,
} from './tuning';

interface TrajectoryWeapon { category: Category; stats: { a: number; b: number; c: number }; trait?: Trait }
import { add, normalize, toRapier } from './vec3';

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
  return world.castRayAndGetNormal(ray, maxToi, true, undefined, undefined, shooterCollider, undefined, (c) => !c.isSensor());
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

/** Grenade (règles v2) : cloche calculée pour RETOMBER SUR LE POINT VISÉ (l'adversaire quand la visée est
 * calée), explosion au premier contact (sol, mur, joueur). Sans point visé (script par angles), la portée
 * vient de la charge : GRENADE_RANGE_MIN + charge × GRENADE_RANGE_SPAN mètres dans la direction visée. */
function simulateArc(ctx: Ctx, shooter: PlayerId, weapon: TrajectoryWeapon, origin: Vec3, dir: Vec3, power: number, aimPoint: Vec3 | null): TrajectoryResult {
  const g = GRENADE_ARC_GRAVITY;
  let target: Vec3;
  if (aimPoint) target = aimPoint;
  else {
    const h = Math.hypot(dir[0], dir[2]) || 1;
    const dist = GRENADE_RANGE_MIN + Math.max(0, Math.min(1, power)) * GRENADE_RANGE_SPAN;
    target = [origin[0] + (dir[0] / h) * dist, origin[1] - SHOT_ORIGIN_HEIGHT, origin[2] + (dir[2] / h) * dist];
  }
  let dx = target[0] - origin[0];
  let dz = target[2] - origin[2];
  let D = Math.hypot(dx, dz);
  const maxRange = CATEGORY_TUNING.grenade.maxRange;
  if (D > maxRange) { dx *= maxRange / D; dz *= maxRange / D; D = maxRange; }
  if (D < 0.5) { D = 0.5; dx = dx || 0.5; }
  const ux = dx / (Math.hypot(dx, dz) || 1), uz = dz / (Math.hypot(dx, dz) || 1);
  const hDiff = target[1] - origin[1];
  // v² = g·D² / (2·cos²θ·(D·tanθ − h)) ; on relève l'angle si la cible est trop haute.
  let theta = (GRENADE_LOB_DEG * Math.PI) / 180;
  let denom = 2 * Math.cos(theta) ** 2 * (D * Math.tan(theta) - hDiff);
  if (denom <= 0.1) { theta = (70 * Math.PI) / 180; denom = Math.max(0.1, 2 * Math.cos(theta) ** 2 * (D * Math.tan(theta) - hDiff)); }
  const speed = Math.sqrt((g * D * D) / denom);
  let vel: Vec3 = [ux * Math.cos(theta) * speed, Math.sin(theta) * speed, uz * Math.cos(theta) * speed];
  let pos = origin;
  const path: Vec3[] = [pos];
  const step = 1 / 30;
  let t = 0;
  for (let i = 0; i < 240; i++) {
    vel = [vel[0], vel[1] - g * step, vel[2]];
    const d: Vec3 = [vel[0] * step, vel[1] * step, vel[2] * step];
    const len = Math.hypot(d[0], d[1], d[2]);
    const hit = len > 1e-4 ? castFrom(ctx, shooter, pos, normalize(d), len) : null;
    if (hit) {
      const hp = add(pos, normalize(d), hit.timeOfImpact);
      path.push(hp);
      return finishArc(shooter, hp, path, [], t + (hit.timeOfImpact / len) * step, weapon.stats);
    }
    pos = add(pos, d);
    path.push(pos);
    t += step;
    if (pos[1] < origin[1] - 12) break; // tombée dans le vide : explose en bas, loin de tout
  }
  return finishArc(shooter, pos, path, [], t, weapon.stats);
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
  aimPoint: Vec3 | null = null,
): TrajectoryResult {
  const dir = normalize(dirRaw);
  if (weapon.category === 'shield') return simulateShield(origin, dir);
  if (weapon.category === 'grenade') return simulateArc(ctx, shooter, weapon, origin, dir, power, aimPoint);
  return simulateStraight(ctx, shooter, weapon, origin, dir, power);
}
