// Vies (règles v2) : sortie de l'arène → `stock:lost` (+ `ringout` pour les lots v1 : sons, bandeau) →
// réapparition au-dessus du centre (`respawn`, % à 0, invulnérable jusqu'à la fin de son prochain tour),
// ou, sans vie restante : `ko` → `match:banner { game }` + 1 s de ralenti → `match:end`.
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { getArena, type BlastSide } from './arena';
import { teleport } from './character';
import { setBlastHandler, setTeeter } from './launch';
import { cancelGestureTimer, finishMatch, setPhase } from './phases';
import { getRuntime, otherPlayer } from './runtime';
import {
  GAME_SLOWMO, RESPAWN_DELAY_S, RESPAWN_HEIGHT, RESPAWN_HOVER_S, SUDDEN_DEATH_PCT,
} from './tuning';

/** Vie perdue (zone d'explosion atteinte en vol, ou chute sous RINGOUT_Y). */
export function loseStock(ctx: Ctx, player: PlayerId, side: BlastSide, exitPos: Vec3): void {
  const rt = getRuntime();
  const prt = rt.players[player];
  const ps = ctx.state.players[player];
  if (prt.dead || ctx.state.winner != null || ctx.state.phase === 'end') return;
  prt.dead = true;
  prt.launch = null;
  prt.ledge = null;
  prt.charging = false;
  prt.vy = 0;
  ps.onLedge = false;
  setTeeter(ctx, player, false);
  teleport(ctx, player, exitPos); // corps garé au point de sortie (au-dessus du voidY des maps)
  ps.stocks = Math.max(0, ps.stocks - 1);
  ctx.bus.emit('stock:lost', { player, stocksLeft: ps.stocks, exitPos, side });
  ctx.bus.emit('ringout', { player });

  if (ps.stocks <= 0) { endGame(ctx, player); return; }
  const seq = rt.matchSeq;
  ctx.loop.later(RESPAWN_DELAY_S, () => { if (getRuntime().matchSeq === seq) respawn(ctx, player); });
}

function endGame(ctx: Ctx, loser: PlayerId): void {
  const ps = ctx.state.players[loser];
  ps.alive = false;
  cancelGestureTimer();
  setPhase(ctx, 'ko');
  ctx.bus.emit('ko', { player: loser, cause: 'ringout' });
  ctx.bus.emit('match:banner', { kind: 'game' });
  ctx.bus.emit('slowmo', GAME_SLOWMO);
  const seq = getRuntime().matchSeq;
  // Temps réel : les ralentis demandés (ici et par les effets) ne doivent pas allonger la fin.
  setTimeout(() => { if (getRuntime().matchSeq === seq) finishMatch(ctx, otherPlayer(loser)); }, GAME_SLOWMO.ms);
}

/** Réapparition : au-dessus du centre (décalée si l'adversaire y est), % à 0 (150 en mort subite). */
export function respawn(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const ps = ctx.state.players[player];
  if (!rt.dead || ctx.state.winner != null) return;
  const arena = getArena(ctx);
  const other = ctx.state.players[otherPlayer(player)].pos;
  let x = arena.center[0], z = arena.center[2];
  if (Math.hypot(other[0] - x, other[2] - z) < 1.6) {
    const dx = x - other[0], dz = z - other[2];
    const len = Math.hypot(dx, dz) || 1;
    x = other[0] + (dx / len) * 2; z = other[2] + (dz / len) * 2;
  }
  const pos: Vec3 = [x, arena.top + RESPAWN_HEIGHT, z];
  rt.dead = false;
  rt.launch = null;
  rt.ledge = null;
  rt.grounded = false;
  rt.vy = 0;
  rt.hoverUntil = ctx.loop.time + RESPAWN_HOVER_S;
  // « Invulnérable jusqu'à la fin de son prochain tour » : le prochain tour de ce joueur, pas le tour en cours.
  const turn = ctx.state.turn;
  rt.invulnUntilTurn = ctx.state.active === player ? turn + 2 : turn + 1;
  ps.pct = ctx.state.suddenDeath ? SUDDEN_DEATH_PCT : 0;
  ps.onLedge = false;
  teleport(ctx, player, pos);
  ctx.bus.emit('respawn', { player, pos });
}

export function isInvulnerable(ctx: Ctx, player: PlayerId): boolean {
  const rt = getRuntime().players[player];
  return rt.dead || (rt.invulnUntilTurn > 0 && ctx.state.turn <= rt.invulnUntilTurn);
}

export function installStocks(ctx: Ctx): void {
  setBlastHandler(loseStock);
  ctx.bus.on('turn:end', ({ turn }) => {
    for (const p of [0, 1] as const) {
      const rt = getRuntime().players[p];
      if (rt.invulnUntilTurn > 0 && turn >= rt.invulnUntilTurn) rt.invulnUntilTurn = 0;
    }
  });
}
