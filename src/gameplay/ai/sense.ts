// Perception et « manette » partagées par le bot et l'humain simulé des tests. Lecture seule du monde (sol,
// ligne de tir, projectiles) ; les actions passent UNIQUEMENT par `gameHooks.input`, comme un clavier.
import type { Category, Ctx, InputAction, PlayerId, Vec3, Weapon } from '../../core/types';
import { getArena, groundYBelow, isGroundCollider } from '../arena';
import { isVoidAt } from '../character';
import { viewForward } from '../movement';
import { liveProjectiles } from '../projectiles';
import { GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, SHOT_ORIGIN_HEIGHT, TRAIT_TUNING } from '../tuning';
import { lerp } from '../trajectory';

export const flatDist = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[2] - a[2]);

export function norm2(x: number, z: number): [number, number] {
  const l = Math.hypot(x, z);
  return l > 1e-6 ? [x / l, z / l] : [0, 0];
}

/** Distance libre (m) avant le vide en marchant de `pos` vers (dx, dz) unitaire, sondée tous les `step` m. */
export function freeRun(ctx: Ctx, pos: Vec3, dx: number, dz: number, max: number, step = 0.6): number {
  for (let d = step; d <= max + 1e-6; d += step) {
    if (isVoidAt(ctx, [pos[0] + dx * d, pos[1], pos[2] + dz * d])) return d - step;
  }
  return max;
}

/** Plus courte distance au vide autour de `pos` (8 directions, jusqu'à `max` m). */
export function edgeDistance(ctx: Ctx, pos: Vec3, max = 6): number {
  let best = max;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    best = Math.min(best, freeRun(ctx, pos, Math.cos(a), Math.sin(a), best, 0.75));
    if (best <= 0) return 0;
  }
  return best;
}

/** Au-dessus du vide profond (hors plateau) : rien sous les pieds sur 12 m. */
export function overVoid(ctx: Ctx, pos: Vec3): boolean {
  return groundYBelow(ctx, [pos[0], pos[1] + 0.5, pos[2]], 12) == null;
}

/** Ligne de tir libre (décor, murs, boucliers) de la poitrine du tireur à celle de la cible. */
export function lineOfFire(ctx: Ctx, from: Vec3, to: Vec3): boolean {
  const { RAPIER: R, world } = ctx.physics;
  const a = { x: from[0], y: from[1] + SHOT_ORIGIN_HEIGHT, z: from[2] };
  const b = { x: to[0], y: to[1] + 1.0, z: to[2] };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (len < 0.5) return true;
  const ray = new R.Ray(a, { x: d.x / len, y: d.y / len, z: d.z / len });
  const hit = world.castRay(ray, len - 0.4, true, undefined, undefined, undefined, undefined, isGroundCollider);
  return !hit;
}

/** Centre de l'arène (mesuré par gameplay/arena.ts). */
export function arenaCenter(ctx: Ctx): Vec3 {
  return getArena(ctx).center;
}

/** Rayon d'explosion d'une arme (même formule que projectiles.ts). */
export function splashOf(weapon: Weapon): number {
  if (weapon.category === 'grenade') {
    return lerp(GRENADE_RADIUS_MIN, GRENADE_RADIUS_MAX, weapon.stats.b) + (weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0);
  }
  return weapon.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0;
}

export interface SeenShot {
  id: string;
  owner: PlayerId;
  category: Category;
  gravity: number;
  splash: number;
  /** Temps de jeu du tir. */
  firedAt: number;
}

/** Estimation de l'impact d'un projectile sur `target` : secondes de jeu avant contact (null = il ne touchera pas)
 * et point d'impact prévu. Tir tendu : approche la plus proche de la poitrine ; cloche : chute jusqu'aux pieds. */
export function predictImpact(shot: SeenShot, target: Vec3): { eta: number; at: Vec3; lateral: number } | null {
  const p = liveProjectiles().find((q) => q.id === shot.id);
  if (!p) return null;
  if (shot.gravity > 0) {
    // Cloche : on intègre jusqu'à passer sous la hauteur de la cible (pas de 30 ms).
    let x = p.pos[0], y = p.pos[1], z = p.pos[2], vy = p.vel[1];
    const floor = target[1] + 0.3;
    for (let t = 0; t < 2.5; t += 0.03) {
      x += p.vel[0] * 0.03; z += p.vel[2] * 0.03; vy -= shot.gravity * 0.03; y += vy * 0.03;
      if (vy < 0 && y <= floor) {
        const lateral = Math.hypot(x - target[0], z - target[2]);
        return lateral <= shot.splash + 0.9 ? { eta: t, at: [x, y, z], lateral } : null;
      }
    }
    return null;
  }
  const sp = Math.hypot(p.vel[0], p.vel[1], p.vel[2]);
  if (sp < 1e-3) return null;
  const c: Vec3 = [target[0] - p.pos[0], target[1] + 0.9 - p.pos[1], target[2] - p.pos[2]];
  const along = (c[0] * p.vel[0] + c[1] * p.vel[1] + c[2] * p.vel[2]) / sp;
  if (along <= 0) return null;
  const lateral = Math.sqrt(Math.max(0, c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - along * along));
  if (lateral > 1.6) return null;
  const k = along / sp;
  return { eta: Math.max(0, (along - 0.6) / sp), at: [p.pos[0] + p.vel[0] * k, p.pos[1] + p.vel[1] * k, p.pos[2] + p.vel[2] * k], lateral };
}

const ALL: readonly InputAction[] = ['up', 'down', 'left', 'right', 'jump', 'weapon1', 'weapon2', 'weapon3', 'fire', 'parry'];

/** Manette virtuelle : chaque image on déclare les actions voulues, `flush` appuie / relâche ce qui change et
 * ré-affirme ce qui est maintenu (un `blur` de la fenêtre vide les entrées : on les reprend à l'image suivante). */
export class VirtualPad {
  private readonly ctx: Ctx;
  readonly player: PlayerId;
  private held = new Set<InputAction>();
  private want = new Set<InputAction>();
  constructor(ctx: Ctx, player: PlayerId) {
    this.ctx = ctx;
    this.player = player;
  }

  hold(a: InputAction): void { this.want.add(a); }

  /** Direction monde (x, z) → 8 directions au clavier, relatives à la vue du joueur (même calcul que movement.ts). */
  steer(dx: number, dz: number): void {
    if (Math.hypot(dx, dz) < 1e-3) return;
    const [fx, fz] = viewForward(this.ctx, this.player);
    const [ux, uz] = norm2(dx, dz);
    const my = ux * fx + uz * fz; // avant
    const mx = -ux * fz + uz * fx; // droite (rx = -fz, rz = fx)
    const t = 0.38; // ~22,5° : 8 secteurs
    if (my > t) this.want.add('up'); else if (my < -t) this.want.add('down');
    if (mx > t) this.want.add('right'); else if (mx < -t) this.want.add('left');
  }

  flush(): void {
    const input = this.ctx.hooks.input;
    if (!input) return;
    for (const a of ALL) {
      if (this.want.has(a)) input(this.player, a, true);
      else if (this.held.has(a)) input(this.player, a, false);
    }
    this.held = this.want;
    this.want = new Set();
  }

  /** Relâche tout (fin de match, bot coupé). */
  releaseAll(): void {
    this.want.clear();
    this.flush();
  }

  /** Oublie l'état (les entrées ont été vidées par `startMatch`). */
  forget(): void {
    this.held.clear();
    this.want.clear();
  }
}
