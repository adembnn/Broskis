// Sol de la partie : la map (lot LM/LMAP2) se charge en asynchrone APRÈS `match:start`. Tant que son sol
// n'existe pas sous les points d'apparition, la gravité est suspendue (sinon on tomberait avant le « GO! »).
// Sol plat de secours (30 x 30 à y = 0) seulement si la map n'arrive pas en 9 s, et RETIRÉ dès qu'elle est
// là : l'ancienne version le laissait en place pour toujours, ce qui fermait les arènes (sol invisible).
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, Vec3 } from '../core/types';
import { getSpawnPoints } from '../scene/maps/api';
import { invalidateArena } from './arena';

const HALF_SIZE = 15; // 30 x 30
const HALF_HEIGHT = 0.5;
const WAIT_MAP_MS = 9000;

let fallbackBody: RAPIER.RigidBody | null = null;
let ready = false;
let token = 0;

export function isGroundReady(): boolean {
  return ready;
}

function isRealGround(c: RAPIER.Collider): boolean {
  if (c.isSensor()) return false;
  const kind = (c.parent()?.userData as { kind?: string } | undefined)?.kind;
  return kind !== 'player' && kind !== 'fallback-ground';
}

function realGroundUnder(ctx: Ctx, p: Vec3): boolean {
  const { RAPIER: R, world } = ctx.physics;
  const ray = new R.Ray({ x: p[0], y: p[1] + 3, z: p[2] }, { x: 0, y: -1, z: 0 });
  return world.castRay(ray, 8, true, undefined, undefined, undefined, undefined, isRealGround) != null;
}

/** Vrai si la map a posé son sol : sous les deux points d'apparition, ou au centre à défaut. */
export function hasGroundCollider(ctx: Ctx): boolean {
  const spawns = getSpawnPoints();
  if (spawns) return realGroundUnder(ctx, spawns[0]) && realGroundUnder(ctx, spawns[1]);
  return realGroundUnder(ctx, [0, 0, 0]);
}

function createFallbackGround(ctx: Ctx): void {
  if (fallbackBody) return;
  const { RAPIER: R, world } = ctx.physics;
  fallbackBody = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -HALF_HEIGHT, 0).setUserData({ kind: 'fallback-ground' }));
  world.createCollider(R.ColliderDesc.cuboid(HALF_SIZE, HALF_HEIGHT, HALF_SIZE).setFriction(1).setRestitution(0), fallbackBody);
}

function removeFallbackGround(ctx: Ctx): void {
  if (!fallbackBody) return;
  if (fallbackBody.isValid()) ctx.physics.world.removeRigidBody(fallbackBody);
  fallbackBody = null;
}

export function installFallbackGround(ctx: Ctx): void {
  ctx.bus.on('match:start', () => {
    ready = false;
    invalidateArena();
    const mine = ++token;
    const start = performance.now();
    const poll = () => {
      if (mine !== token) return;
      if (hasGroundCollider(ctx)) {
        removeFallbackGround(ctx);
        invalidateArena();
        ready = true;
        return;
      }
      if (performance.now() - start > WAIT_MAP_MS && !fallbackBody) {
        console.warn('[gameplay] sol de la map introuvable après 9 s : sol plat de secours.');
        createFallbackGround(ctx);
        invalidateArena();
        ready = true;
      }
      setTimeout(poll, 60);
    };
    poll();
  });
}
