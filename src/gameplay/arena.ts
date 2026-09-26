// Géométrie de l'arène, lue par rayons Rapier (aucune dépendance au format des maps, que le lot LMAP2
// refait en parallèle) : centre, hauteur du plateau, rayon, sol sous un point, bord le plus proche.
// Un « sol » = tout collider solide qui n'est ni un joueur ni un capteur (sensor).
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, Vec3 } from '../core/types';
import { getArenaBounds, getSpawnPoints } from '../scene/maps/api';
import { BLAST_SIDE_MARGIN, BLAST_TOP } from './tuning';

export interface ArenaInfo {
  center: Vec3;
  /** Hauteur du dessus du plateau principal. */
  top: number;
  /** Distance horizontale max du centre à du sol (toutes directions). */
  radius: number;
  /** Point de réapparition au sol (la map le donne ; sinon le centre). */
  respawn: Vec3;
}

let cached: ArenaInfo | null = null;
let cachedAtTurn = -1;

/** Filtre des rayons « sol » : ni joueur, ni capteur, ni collider désactivé (plateforme traversable vide). */
export function isGroundCollider(c: RAPIER.Collider): boolean {
  if (c.isSensor() || !c.isEnabled()) return false;
  const data = c.parent()?.userData as { kind?: string } | undefined;
  return data?.kind !== 'player';
}

/** Hauteur du sol sous `point` (rayon vers le bas sur `maxDist` m), ou null s'il n'y a que du vide. */
export function groundYBelow(ctx: Ctx, point: Vec3, maxDist: number): number | null {
  const { RAPIER: R, world } = ctx.physics;
  const ray = new R.Ray({ x: point[0], y: point[1], z: point[2] }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, maxDist, true, undefined, undefined, undefined, undefined, isGroundCollider);
  return hit ? point[1] - hit.timeOfImpact : null;
}

function spawnCenter(): { center: Vec3; y: number } | null {
  const spawns = getSpawnPoints();
  if (!spawns) return null;
  const [a, b] = spawns;
  return { center: [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2], y: (a[1] + b[1]) / 2 };
}

/** Centre, hauteur du plateau, rayon et réapparition : donnés par la map (lot LMAP2, `getArenaBounds`) ;
 * à défaut, mesurés par rayons (16 directions, pas de 0,5 m, jusqu'à 30 m). */
export function measureArena(ctx: Ctx): ArenaInfo {
  const b = getArenaBounds();
  if (b) {
    const ground = groundYBelow(ctx, [b.respawn[0], b.respawn[1] + 3, b.respawn[2]], 6);
    const top = ground ?? b.respawn[1];
    cached = { center: [b.center[0], top, b.center[2]], top, radius: b.radius, respawn: [b.respawn[0], top, b.respawn[2]] };
    cachedAtTurn = ctx.state.turn;
    return cached;
  }
  const sc = spawnCenter();
  const center: Vec3 = sc ? [sc.center[0], 0, sc.center[2]] : [0, 0, 0];
  const probeTop = 30;
  const topAtCenter = groundYBelow(ctx, [center[0], probeTop, center[2]], 60);
  const top = topAtCenter ?? sc?.y ?? 0;
  center[1] = top;
  let radius = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    for (let r = 0.5; r <= 30; r += 0.5) {
      const y = groundYBelow(ctx, [center[0] + dx * r, top + 1.5, center[2] + dz * r], 4);
      if (y != null && y > top - 2.5) radius = Math.max(radius, r);
    }
  }
  if (radius < 4) radius = 9; // map pas encore chargée : valeur d'une arène moyenne
  cached = { center, top, radius, respawn: [center[0], top, center[2]] };
  cachedAtTurn = ctx.state.turn;
  return cached;
}

/** Mesure mise en cache par tour (le rayon change quand l'anneau extérieur de l'Archipel tombe). */
export function getArena(ctx: Ctx): ArenaInfo {
  if (!cached || cachedAtTurn !== ctx.state.turn) return measureArena(ctx);
  return cached;
}

export function invalidateArena(): void {
  cached = null;
}

export type BlastSide = 'side' | 'top' | 'bottom';

/** Zone d'explosion atteinte ? (bas : RINGOUT_Y est testé par l'appelant avec la vraie hauteur des pieds). */
export function blastZoneHit(arena: ArenaInfo, pos: Vec3, ringoutY: number): BlastSide | null {
  if (pos[1] < ringoutY) return 'bottom';
  if (pos[1] > arena.top + BLAST_TOP) return 'top';
  const d = Math.hypot(pos[0] - arena.center[0], pos[2] - arena.center[2]);
  if (d > arena.radius + BLAST_SIDE_MARGIN) return 'side';
  return null;
}

/** Bord le plus proche en marchant de `pos` vers le centre (pas de 0,25 m) : premier point avec du sol
 * au niveau du plateau. Renvoie ce point (y = dessus du sol) et la direction vers l'intérieur, ou null. */
export function findLedge(ctx: Ctx, pos: Vec3, maxDist: number): { edge: Vec3; inward: Vec3; dist: number } | null {
  const arena = getArena(ctx);
  let dx = arena.center[0] - pos[0];
  let dz = arena.center[2] - pos[2];
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return null;
  dx /= len; dz /= len;
  for (let d = 0.1; d <= maxDist; d += 0.25) {
    const q: Vec3 = [pos[0] + dx * d, 0, pos[2] + dz * d];
    const y = groundYBelow(ctx, [q[0], arena.top + 1.2, q[2]], 2.4);
    if (y != null) return { edge: [q[0], y, q[2]], inward: [dx, 0, dz], dist: d };
  }
  return null;
}
