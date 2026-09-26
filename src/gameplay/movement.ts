// Déplacement clavier (ZQSD, WASD ou flèches) + saut (Espace ou Maj). `requestMove`/`doJump` sont le SEUL chemin
// de déplacement : le clavier les appelle à chaque frame (petits pas), les hooks une fois (script/agents de test).
// Règles v2 : bords ouverts (au bord on vacille ; en insistant on marche dans le vide), 2 sauts par tour
// (le 1er coûte JUMP_COST, le 2e est gratuit et seulement en l'air), contrôle en l'air, remontée du bord.
import type { Ctx, PlayerId } from '../core/types';
import { JUMP_COST } from '../core/state';
import { applyMove, startJump, stepVerticalMotion, syncBodyToState } from './character';
import { checkCratePickup } from './crate';
import { setTeeter, stepFalls } from './launch';
import { climbLedge, noteGesture } from './phases';
import { getRuntime } from './runtime';
import {
  AIR_JUMP_VELOCITY, JUMP_KEY, JUMP_VELOCITY, MAX_JUMPS_PER_TURN, MOVE_SPEED, TEETER_PUSH_THROUGH_S, TRAIT_TUNING,
} from './tuning';

const HELD = new Set<string>();
const MOVE_KEYS = new Set(['KeyW', 'KeyZ', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'KeyQ', 'ArrowLeft', 'KeyD', 'ArrowRight']);
const JUMP_KEYS = new Set(['Space', JUMP_KEY, 'ShiftRight']);

function currentDir(): [number, number] {
  let dx = 0;
  let dz = 0;
  if (HELD.has('KeyW') || HELD.has('KeyZ') || HELD.has('ArrowUp')) dz -= 1;
  if (HELD.has('KeyS') || HELD.has('ArrowDown')) dz += 1;
  if (HELD.has('KeyA') || HELD.has('KeyQ') || HELD.has('ArrowLeft')) dx -= 1;
  if (HELD.has('KeyD') || HELD.has('ArrowRight')) dx += 1;
  const len = Math.hypot(dx, dz);
  return len > 0 ? [dx / len, dz / len] : [0, 0];
}

/** Le joueur actif peut-il agir (se déplacer, sauter) ? En phase de déplacement ou de visée, hors charge. */
function canAct(ctx: Ctx, player: PlayerId): boolean {
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return false;
  if (player !== ctx.state.active) return false;
  const rt = getRuntime().players[player];
  return !rt.dead && !rt.launch && !rt.charging;
}

/** Déplacement demandé (mètres, pas une vitesse) : borné par le budget, glisse sur les obstacles, s'arrête au
 * bord (on vacille) ; on passe dans le vide en insistant (clavier : TEETER_PUSH_THROUGH_S ; script : 2e appel). */
export function requestMove(ctx: Ctx, player: PlayerId, dx: number, dz: number, source: 'key' | 'hook' = 'hook', dt = 0): void {
  if (!canAct(ctx, player)) return;
  const state = ctx.state.players[player];
  const rt = getRuntime().players[player];
  if (rt.ledge) {
    // Accroché pendant son tour : pousser vers le plateau = remonter.
    if (dx * rt.ledge.inward[0] + dz * rt.ledge.inward[2] > 0) { climbLedge(ctx, player); noteGesture(ctx); }
    return;
  }
  // Trait `slippery` subi récemment (voir damage.ts) : on dérape, le déplacement demandé est amplifié.
  const slidingMult = performance.now() < rt.slipperyUntilMs ? 1 + TRAIT_TUNING.slippery.driftMult : 1;
  const [ddx, ddz] = [dx * slidingMult, dz * slidingMult];
  const requested = Math.hypot(ddx, ddz);
  if (requested <= 0 || state.moveLeft <= 0) return;
  const scale = Math.min(1, state.moveLeft / requested);
  const insist = source === 'hook' ? rt.teetering : rt.edgePushS >= TEETER_PUSH_THROUGH_S;
  const result = applyMove(ctx, player, ddx * scale, ddz * scale, insist);
  if (result.blockedByEdge) {
    setTeeter(ctx, player, true);
    rt.edgePushS += dt;
  } else if (result.movedDistance > 0.01 && rt.teetering) {
    setTeeter(ctx, player, false);
  }
  if (result.movedDistance <= 0) return;
  state.moveLeft = Math.max(0, state.moveLeft - result.movedDistance);
  ctx.bus.emit('move:update', { player, pos: result.pos, moveLeft: state.moveLeft });
  noteGesture(ctx);
  checkCratePickup(ctx, player);
}

/** Saut : le 1er coûte JUMP_COST (ou ce qui reste), le 2e est gratuit et seulement en l'air. Accroché : remonte. */
export function doJump(ctx: Ctx): void {
  const player = ctx.state.active;
  if (!canAct(ctx, player)) return;
  const state = ctx.state.players[player];
  const rt = getRuntime().players[player];
  if (rt.ledge) { climbLedge(ctx, player); noteGesture(ctx); return; }
  if (rt.jumpsUsed >= MAX_JUMPS_PER_TURN) return;
  const airborne = !rt.grounded;
  if (rt.jumpsUsed === 0) {
    if (!airborne && state.moveLeft <= 0.05) return;
    state.moveLeft = Math.max(0, state.moveLeft - Math.min(JUMP_COST, state.moveLeft));
    startJump(player, JUMP_VELOCITY);
  } else {
    if (!airborne) return;
    startJump(player, AIR_JUMP_VELOCITY);
  }
  rt.jumpsUsed += 1;
  state.jumpUsed = true;
  setTeeter(ctx, player, false);
  ctx.bus.emit('move:jump', { player });
  ctx.bus.emit('move:update', { player, pos: state.pos, moveLeft: state.moveLeft });
  noteGesture(ctx);
}

export function install(ctx: Ctx): void {
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.has(e.code)) { HELD.add(e.code); e.preventDefault(); }
    else if (JUMP_KEYS.has(e.code) && !e.repeat) {
      if (ctx.state.phase === 'move' || ctx.state.phase === 'aim') { e.preventDefault(); doJump(ctx); }
    }
  });
  window.addEventListener('keyup', (e) => { if (MOVE_KEYS.has(e.code)) HELD.delete(e.code); });
  window.addEventListener('blur', () => HELD.clear()); // change de fenêtre = relâche toutes les touches

  ctx.loop.addSystem('gameplay-movement', (dt) => {
    for (const p of [0, 1] as const) if (!getRuntime().players[p].launch) syncBodyToState(ctx, p);
    stepVerticalMotion(ctx, 0, dt);
    stepVerticalMotion(ctx, 1, dt);
    stepFalls(ctx);
    const active = ctx.state.active;
    const [dx, dz] = currentDir();
    if ((ctx.state.phase === 'move' || ctx.state.phase === 'aim') && (dx !== 0 || dz !== 0)) {
      requestMove(ctx, active, dx * MOVE_SPEED * dt, dz * MOVE_SPEED * dt, 'key', dt);
    } else {
      getRuntime().players[active].edgePushS = 0;
    }
  }, 50); // avant la physique (100) : on pose la translation cinématique désirée avant world.step()

  ctx.hooks.move = (dx, dz) => requestMove(ctx, ctx.state.active, dx, dz, 'hook');
  ctx.hooks.jump = () => doJump(ctx);
}
