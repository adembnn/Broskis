// Le tour ne se bloque jamais (règles v2) : 15 s sans aucun geste (ou 30 s de tour au total), le joueur
// actif tire tout seul son arme 1 (ou la première prête) à 60 % de puissance, visée calée sur l'adversaire.
// Tient aussi `state.timerLeft` à jour (secondes avant ce tir automatique, pour l'interface).
import type { Ctx } from '../core/types';
import { lockAimOnOpponent } from './aim';
import { performFire } from './projectiles';
import { climbLedge, setPhase } from './phases';
import { getRuntime } from './runtime';
import { AUTOFIRE_POWER, TURN_FALLBACK_TIMER_S, TURN_HARD_CAP_S } from './tuning';

function autoFire(ctx: Ctx): void {
  const rt = getRuntime();
  const player = ctx.state.active;
  const prt = rt.players[player];
  if (rt.autoFiredTurn === ctx.state.turn || prt.dead || prt.launch) return;
  rt.autoFiredTurn = ctx.state.turn;
  const ps = ctx.state.players[player];
  prt.charging = false;
  if (prt.ledge) climbLedge(ctx, player); // accroché et inactif : il remonte d'abord
  const first = ps.weapons[0] && ps.weapons[0].cooldown <= 0 ? 0 : ps.weapons.findIndex((w) => w.cooldown <= 0);
  if (first < 0) return;
  if (ps.selected !== first) {
    ps.selected = first;
    ctx.bus.emit('weapon:pick', { player, index: first });
  }
  if (ctx.state.phase === 'move') setPhase(ctx, 'aim');
  lockAimOnOpponent(ctx, player);
  performFire(ctx, player, AUTOFIRE_POWER);
}

export function installAutofire(ctx: Ctx): void {
  ctx.loop.addSystem('gameplay-autofire', () => {
    if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
    const rt = getRuntime();
    if (rt.players[ctx.state.active].charging) { rt.lastGestureMs = performance.now(); }
    const now = performance.now();
    const idleLeft = TURN_FALLBACK_TIMER_S - (now - rt.lastGestureMs) / 1000;
    const capLeft = TURN_HARD_CAP_S - (now - rt.turnPlayStartMs) / 1000;
    const left = Math.max(0, Math.min(idleLeft, capLeft));
    ctx.state.timerLeft = Math.ceil(left);
    if (left <= 0) autoFire(ctx);
  }, 70);
}
