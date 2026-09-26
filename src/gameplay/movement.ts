// Déplacement temps réel des 2 joueurs en même temps : 6,5 m/s relatif à LA VUE du joueur (avant = direction
// de sa caméra, `forwardOf` du lot RTVIEW ; à défaut, l'axe joueur → adversaire), contrôle en l'air, double
// saut, bords ouverts (au bord on vacille, en poussant on passe dans le vide), remontée du rattrapage au bord.
// Blocage : on avance à 40 %. Tir en charge : 85 %.
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import * as cameraApi from '../scene/camera';
import { applyMove, startJump, stepVerticalMotion, syncBodyToState } from './character';
import type { PlayerInput } from './controls';
import { checkCratePickup } from './crate';
import { setTeeter, stepFalls } from './launch';
import { inFight } from './phases';
import { getRuntime, otherPlayer } from './runtime';
import { RT, TRAIT_TUNING } from './tuning';

type ForwardFn = (player: PlayerId) => Vec3 | null | undefined;

/** Avant horizontal de la vue du joueur : caméra du lot RTVIEW si elle l'expose, sinon vers l'adversaire. */
export function viewForward(ctx: Ctx, player: PlayerId): [number, number] {
  const fromCam = (cameraApi as unknown as { forwardOf?: ForwardFn }).forwardOf?.(player);
  if (fromCam && Math.hypot(fromCam[0], fromCam[2]) > 1e-3) {
    const l = Math.hypot(fromCam[0], fromCam[2]);
    return [fromCam[0] / l, fromCam[2] / l];
  }
  const me = ctx.state.players[player].pos;
  const them = ctx.state.players[otherPlayer(player)].pos;
  const dx = them[0] - me[0], dz = them[2] - me[2];
  const l = Math.hypot(dx, dz);
  return l > 1e-3 ? [dx / l, dz / l] : [player === 0 ? 1 : -1, 0];
}

/** Le joueur peut-il bouger/sauter ? (en combat, ni éjecté, ni mort ; accroché : seulement remonter). */
function canMove(ctx: Ctx, player: PlayerId): boolean {
  const rt = getRuntime().players[player];
  return inFight(ctx) && !rt.dead && !rt.launch;
}

/** Remontée du bord (saut ou poussée vers le plateau) : `ledge:climb`. */
export function climbLedge(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const ps = ctx.state.players[player];
  if (!rt.ledge) return;
  const { edge, inward } = rt.ledge;
  rt.ledge = null;
  ps.onLedge = false;
  const top: Vec3 = [edge[0] + inward[0] * 0.7, edge[1] + 0.05, edge[2] + inward[2] * 0.7];
  ps.pos = top;
  rt.body?.setTranslation({ x: top[0], y: top[1] + 0.9, z: top[2] }, true);
  rt.vy = 0;
  rt.grounded = true;
  rt.jumpsUsed = 0;
  ctx.bus.emit('ledge:climb', { player });
}

/** Saut : 2 au plus avant de retoucher le sol (le 2e en l'air). Accroché au bord : remonte. */
export function jump(ctx: Ctx, player: PlayerId): void {
  if (!canMove(ctx, player)) return;
  const rt = getRuntime().players[player];
  if (rt.ledge) { climbLedge(ctx, player); return; }
  if (rt.jumpsUsed >= RT.maxJumps) return;
  startJump(player, rt.jumpsUsed === 0 && rt.grounded ? RT.jumpVelocity : RT.airJumpVelocity);
  rt.jumpsUsed += 1;
  ctx.state.players[player].jumpUsed = true;
  setTeeter(ctx, player, false);
  ctx.bus.emit('move:jump', { player });
}

/** Un pas de déplacement (m) pour `player` ; au sol, s'arrête au bord sauf si on pousse depuis `teeterPushS`. */
export function moveBy(ctx: Ctx, player: PlayerId, dx: number, dz: number, dt: number, forceVoid = false): void {
  const rt = getRuntime().players[player];
  if (rt.ledge) {
    if (dx * rt.ledge.inward[0] + dz * rt.ledge.inward[2] > 0) climbLedge(ctx, player);
    return;
  }
  const slide = performance.now() < rt.slipperyUntilMs ? 1 + TRAIT_TUNING.slippery.driftMult : 1;
  const insist = forceVoid || rt.edgePushS >= RT.teeterPushS;
  const r = applyMove(ctx, player, dx * slide, dz * slide, insist);
  if (r.blockedByEdge) { setTeeter(ctx, player, true); rt.edgePushS += dt; }
  else if (r.movedDistance > 0.005 && !insist) { rt.edgePushS = 0; setTeeter(ctx, player, false); }
  else if (insist && !rt.grounded) setTeeter(ctx, player, false);
  if (r.movedDistance > 0) checkCratePickup(ctx, player);
}

/** Contrôle d'un joueur pour cette image (appelé par le système d'entrées, pour P1 et P2). */
export function stepPlayerControl(ctx: Ctx, player: PlayerId, input: PlayerInput, dt: number): void {
  const rt = getRuntime().players[player];
  const ps = ctx.state.players[player];
  // Orientation verrouillée vers l'adversaire (visée automatique).
  const them = ctx.state.players[otherPlayer(player)].pos;
  ps.yaw = Math.atan2(them[0] - ps.pos[0], them[2] - ps.pos[2]);
  if (rt.grounded && rt.vy <= 0 && !rt.launch) rt.jumpsUsed = 0;
  if (!canMove(ctx, player)) { rt.edgePushS = 0; return; }
  if (input.pressed.has('jump')) jump(ctx, player);
  const [mx, my] = input.move;
  if (Math.hypot(mx, my) < 1e-3) { rt.edgePushS = 0; return; }
  const [fx, fz] = viewForward(ctx, player);
  const rx = -fz, rz = fx; // droite de la vue (y vers le haut)
  let wx = fx * my + rx * mx;
  let wz = fz * my + rz * mx;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  let speed = RT.moveSpeed * (rt.grounded ? 1 : RT.airControl);
  if (ps.blocking) speed *= RT.blockMoveMult;
  else if (rt.charging) speed *= RT.chargeMoveMult;
  moveBy(ctx, player, wx * speed * dt, wz * speed * dt, dt);
}

/** Système physique des persos (gravité, chutes, vitesse estimée) : avant la physique Rapier. */
export function stepBodies(ctx: Ctx, dt: number): void {
  for (const p of [0, 1] as const) if (!getRuntime().players[p].launch) syncBodyToState(ctx, p);
  stepVerticalMotion(ctx, 0, dt);
  stepVerticalMotion(ctx, 1, dt);
  stepFalls(ctx);
  if (dt <= 0) return;
  for (const p of [0, 1] as const) {
    const rt = getRuntime().players[p];
    const pos = ctx.state.players[p].pos;
    const k = Math.min(1, dt * 10); // lissage de la vitesse estimée (avance de visée)
    rt.vel = [
      rt.vel[0] + ((pos[0] - rt.prevPos[0]) / dt - rt.vel[0]) * k,
      rt.vel[1] + ((pos[1] - rt.prevPos[1]) / dt - rt.vel[1]) * k,
      rt.vel[2] + ((pos[2] - rt.prevPos[2]) / dt - rt.vel[2]) * k,
    ];
    rt.prevPos = [pos[0], pos[1], pos[2]];
  }
}
