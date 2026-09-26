// Sol plat de secours (30 x 30 à y = 0) : tant que le lot LM n'a pas livré de map, on ne veut pas
// que les persos tombent dans le vide. Ne s'active QUE si aucun collider de sol n'existe déjà à `match:start`
// (détection : un rayon vers le bas depuis le centre de l'arène trouve-t-il quelque chose ?).
import type { Ctx } from '../core/types';
import { raycastDown } from './character';

const HALF_SIZE = 15; // 30 x 30
const HALF_HEIGHT = 0.5;
const PROBE_HEIGHT = 20;
const PROBE_MAX_DIST = 25;

export function hasGroundCollider(ctx: Ctx): boolean {
  // Une vraie map (lot LM) aura toujours un collider fixe sous l'arène : un simple rayon depuis
  // le centre suffit à le détecter, quelle que soit sa forme (cuboïde, heightfield, trimesh…).
  return raycastDown(ctx, [0, PROBE_HEIGHT, 0], PROBE_MAX_DIST) != null;
}

function createFallbackGround(ctx: Ctx): void {
  const { RAPIER: R, world } = ctx.physics;
  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -HALF_HEIGHT, 0).setUserData({ kind: 'fallback-ground' }));
  world.createCollider(R.ColliderDesc.cuboid(HALF_SIZE, HALF_HEIGHT, HALF_SIZE).setFriction(1).setRestitution(0), body);
}

export function installFallbackGround(ctx: Ctx): void {
  ctx.bus.on('match:start', () => {
    if (hasGroundCollider(ctx)) return;
    createFallbackGround(ctx);
  });
}
