// Contrôleur de personnage Rapier (capsule) : création des corps, déplacement avec glissement sur les
// obstacles, arrêt au bord en marchant (raycast vers le sol), saut/gravité. Un seul sol de vérité :
// pendant que le corps est cinématique, NOUS écrivons `state.players[i].pos` (voir applyMove/stepVertical) ;
// dès qu'il devient dynamique (recul, voir damage.ts), c'est Rapier qui décide et on relit sa position.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { getRuntime } from './runtime';
import { CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS, EDGE_RAYCAST_AHEAD, EDGE_RAYCAST_DEPTH, GRAVITY } from './tuning';

const CONTROLLER_OFFSET = 0.04;

/** Lance un rayon vers le bas depuis `point` ; renvoie la distance jusqu'au premier obstacle, ou null. */
export function raycastDown(ctx: Ctx, point: Vec3, maxDist: number, exclude?: RAPIER.Collider): number | null {
  const { RAPIER: R, world } = ctx.physics;
  const ray = new R.Ray({ x: point[0], y: point[1], z: point[2] }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, maxDist, true, undefined, undefined, exclude);
  return hit ? hit.timeOfImpact : null;
}

function bodyUserData(player: PlayerId) {
  return { kind: 'player' as const, player };
}

export const HEIGHT_OFFSET = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS;
/** Centre du corps (repère Rapier) à partir des pieds (repère `state.pos`). */
function centerFromFeet(pos: Vec3) {
  return { x: pos[0], y: pos[1] + HEIGHT_OFFSET, z: pos[2] };
}

/** Crée (une fois) puis repositionne le corps + le contrôleur d'un joueur d'après `state.players[i].pos`. */
export function ensurePlayerBody(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const { RAPIER: R, world } = ctx.physics;
  const pos = ctx.state.players[player].pos;
  if (!rt.body) {
    const center = centerFromFeet(pos);
    const desc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z);
    desc.setUserData(bodyUserData(player));
    const body = world.createRigidBody(desc);
    const colliderDesc = R.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS).setFriction(0.7);
    const collider = world.createCollider(colliderDesc, body);
    const controller = world.createCharacterController(CONTROLLER_OFFSET);
    controller.setMaxSlopeClimbAngle((60 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.enableAutostep(0.35, 0.2, true);
    controller.enableSnapToGround(0.3);
    controller.setSlideEnabled(true);
    rt.body = body;
    rt.collider = collider;
    rt.controller = controller;
  } else {
    rt.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    rt.body.setTranslation(centerFromFeet(pos), true);
    rt.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rt.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  rt.vy = 0;
  rt.grounded = true;
}

export function ensureAllPlayerBodies(ctx: Ctx): void {
  ensurePlayerBody(ctx, 0);
  ensurePlayerBody(ctx, 1);
}

/** Vrai s'il y a du vide (pas de sol) à `dest`, empêchant un pas en marchant. */
function isVoidAhead(ctx: Ctx, player: PlayerId, dest: Vec3): boolean {
  const rt = getRuntime().players[player];
  const above: Vec3 = [dest[0], dest[1] + 0.5, dest[2]];
  const dist = raycastDown(ctx, above, 0.5 + EDGE_RAYCAST_DEPTH, rt.collider ?? undefined);
  return dist == null;
}

export interface MoveResult { movedDistance: number; pos: Vec3 }

/** Déplacement horizontal borné par le budget côté appelant (hooks.ts). Glisse sur les obstacles (Rapier),
 * s'arrête au bord du vide en marchant (raycast). `dx`/`dz` sont un déplacement désiré en mètres (pas une vitesse). */
export function applyMove(ctx: Ctx, player: PlayerId, dx: number, dz: number): MoveResult {
  const rt = getRuntime().players[player];
  const cur = ctx.state.players[player].pos;
  if (!rt.body || !rt.controller || !rt.collider || rt.body.isDynamic()) return { movedDistance: 0, pos: cur };
  let desired: Vec3 = [dx, 0, dz];
  if (rt.grounded && (dx !== 0 || dz !== 0)) {
    const len = Math.hypot(dx, dz) || 1;
    const pushAhead: Vec3 = [
      cur[0] + dx + (dx / len) * EDGE_RAYCAST_AHEAD,
      cur[1],
      cur[2] + dz + (dz / len) * EDGE_RAYCAST_AHEAD,
    ];
    if (isVoidAhead(ctx, player, pushAhead)) desired = [0, 0, 0];
  }
  rt.controller.computeColliderMovement(rt.collider, { x: desired[0], y: desired[1], z: desired[2] });
  const moved = rt.controller.computedMovement();
  rt.grounded = rt.controller.computedGrounded();
  // Base = state.pos (pas rt.body.translation(), qui ne bouge qu'au world.step() suivant) : ainsi un
  // déplacement horizontal et l'intégration verticale (stepVerticalMotion) peuvent s'accumuler dans la
  // même frame au lieu de s'écraser l'un l'autre.
  const base = centerFromFeet(cur);
  const next = { x: base.x + moved.x, y: base.y + moved.y, z: base.z + moved.z };
  rt.body.setNextKinematicTranslation(next);
  const pos: Vec3 = [next.x, next.y - HEIGHT_OFFSET, next.z];
  ctx.state.players[player].pos = pos;
  return { movedDistance: Math.hypot(moved.x, moved.z), pos };
}

/** Amorce un saut (vitesse verticale initiale) ; la gravité est intégrée par `stepVerticalMotion`. */
export function tryStartJump(player: PlayerId, jumpVelocity: number): boolean {
  const rt = getRuntime().players[player];
  if (!rt.body || !rt.grounded || rt.body.isDynamic()) return false;
  rt.vy = jumpVelocity;
  rt.grounded = false;
  return true;
}

/** Système à appeler chaque frame (saut/gravité), pour le joueur actif comme pour l'autre (chute possible). */
export function stepVerticalMotion(ctx: Ctx, player: PlayerId, dt: number): void {
  const rt = getRuntime().players[player];
  if (!rt.body || !rt.controller || !rt.collider || rt.body.isDynamic()) return;
  if (rt.grounded && rt.vy <= 0) { rt.vy = 0; return; }
  rt.vy -= GRAVITY * dt;
  rt.controller.computeColliderMovement(rt.collider, { x: 0, y: rt.vy * dt, z: 0 });
  const moved = rt.controller.computedMovement();
  rt.grounded = rt.controller.computedGrounded();
  if (rt.grounded && rt.vy < 0) rt.vy = 0;
  const base = centerFromFeet(ctx.state.players[player].pos);
  const next = { x: base.x + moved.x, y: base.y + moved.y, z: base.z + moved.z };
  rt.body.setNextKinematicTranslation(next);
  ctx.state.players[player].pos = [next.x, next.y - HEIGHT_OFFSET, next.z];
}

/** Bascule le corps en dynamique pour laisser la physique jouer le recul (voir damage.ts). */
export function setDynamicForRecovery(ctx: Ctx, player: PlayerId, impulse: Vec3): void {
  const rt = getRuntime().players[player];
  if (!rt.body) return;
  const { RAPIER: R } = ctx.physics;
  rt.body.setBodyType(R.RigidBodyType.Dynamic, true);
  rt.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  rt.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  rt.body.lockRotations(true, true); // un perso qui vrille en continu lit mal ; LA peut animer la culbute lui-même
  rt.body.applyImpulseAtPoint(
    { x: impulse[0], y: impulse[1], z: impulse[2] },
    rt.body.translation(),
    true,
  );
}

/** Relit la position simulée par Rapier pendant le recul (corps dynamique). À appeler chaque frame. */
export function syncFromDynamicBody(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  if (!rt.body || !rt.body.isDynamic()) return;
  const t = rt.body.translation();
  ctx.state.players[player].pos = [t.x, t.y - HEIGHT_OFFSET, t.z];
}

/** Repasse le corps en cinématique une fois le recul terminé, à la position actuelle (figée). */
export function restoreKinematicFromDynamic(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  if (!rt.body) return;
  const { RAPIER: R } = ctx.physics;
  const pos = ctx.state.players[player].pos;
  rt.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
  rt.body.setTranslation(centerFromFeet(pos), true);
  rt.body.lockRotations(false, true);
  rt.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  rt.vy = 0;
  rt.grounded = true;
}
