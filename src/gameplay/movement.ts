// Déplacement clavier (ZQSD, WASD ou flèches) + saut. `requestMove`/`doJump` sont le SEUL chemin de
// déplacement : le clavier les appelle à chaque frame (petits pas), les hooks les appellent une fois
// (script/agents de test) — usage identique, donc utilisable sans clavier.
import type { Ctx, PlayerId } from '../core/types';
import { JUMP_COST } from '../core/state';
import { applyMove, stepVerticalMotion, tryStartJump } from './character';
import { checkCratePickup } from './crate';
import { armFirstGestureTimer } from './phases';
import { getRuntime } from './runtime';
import { JUMP_KEY, JUMP_VELOCITY, MOVE_SPEED, TRAIT_TUNING } from './tuning';

const HELD = new Set<string>();
const MOVE_KEYS = new Set(['KeyW', 'KeyZ', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'KeyQ', 'ArrowLeft', 'KeyD', 'ArrowRight']);

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

/** Déplacement demandé (mètres, pas une vitesse) : borné par le budget, glisse sur les obstacles,
 * s'arrête au bord en marchant (voir character.ts). Utilisable en un seul appel (script) ou en petits
 * pas répétés chaque frame (clavier). */
export function requestMove(ctx: Ctx, player: PlayerId, dx: number, dz: number): void {
  if (ctx.state.phase !== 'move' || player !== ctx.state.active) return;
  const state = ctx.state.players[player];
  // Trait `slippery` subi récemment (voir damage.ts) : on dérape, le déplacement demandé est amplifié.
  const rt = getRuntime().players[player];
  const slidingMult = performance.now() < rt.slipperyUntilMs ? 1 + TRAIT_TUNING.slippery.driftMult : 1;
  const [ddx, ddz] = [dx * slidingMult, dz * slidingMult];
  const requested = Math.hypot(ddx, ddz);
  if (requested <= 0 || state.moveLeft <= 0) return;
  const scale = Math.min(1, state.moveLeft / requested);
  const result = applyMove(ctx, player, ddx * scale, ddz * scale);
  if (result.movedDistance <= 0) return;
  state.moveLeft = Math.max(0, state.moveLeft - result.movedDistance);
  ctx.bus.emit('move:update', { player, pos: result.pos, moveLeft: state.moveLeft });
  armFirstGestureTimer(ctx);
  checkCratePickup(ctx, player);
}

function doJump(ctx: Ctx): void {
  const player = ctx.state.active;
  if (ctx.state.phase !== 'move') return;
  const state = ctx.state.players[player];
  if (state.jumpUsed || state.moveLeft < JUMP_COST) return;
  if (!tryStartJump(player, JUMP_VELOCITY)) return;
  state.jumpUsed = true;
  state.moveLeft = Math.max(0, state.moveLeft - JUMP_COST);
  ctx.bus.emit('move:jump', { player });
  armFirstGestureTimer(ctx);
}

export function install(ctx: Ctx): void {
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS.has(e.code)) { HELD.add(e.code); e.preventDefault(); }
    else if (e.code === JUMP_KEY && !e.repeat) { e.preventDefault(); doJump(ctx); }
  });
  window.addEventListener('keyup', (e) => { if (MOVE_KEYS.has(e.code)) HELD.delete(e.code); });
  window.addEventListener('blur', () => HELD.clear()); // change de fenêtre = relâche toutes les touches

  ctx.loop.addSystem('gameplay-movement', (dt) => {
    stepVerticalMotion(ctx, 0, dt);
    stepVerticalMotion(ctx, 1, dt);
    if (ctx.state.phase === 'move' && HELD.size > 0) {
      const [dx, dz] = currentDir();
      if (dx !== 0 || dz !== 0) requestMove(ctx, ctx.state.active, dx * MOVE_SPEED * dt, dz * MOVE_SPEED * dt);
    }
  }, 50); // avant la physique (100) : on pose la translation cinématique désirée avant world.step()

  ctx.hooks.move = (dx, dz) => requestMove(ctx, ctx.state.active, dx, dz);
  ctx.hooks.jump = () => doJump(ctx);
}
