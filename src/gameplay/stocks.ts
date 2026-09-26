// Vies (règles v2, temps réel) : sortie de l'arène → `stock:lost` (+ `ringout` pour les lots v1 : sons, bandeau)
// → réapparition au-dessus du point de réapparition de la map (`respawn`, % à 0, invulnérable 2 s après le
// vol stationnaire), ou, sans vie restante : `ko` → `match:banner { game }` + 1 s de ralenti → `match:end`.
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { getArena, type BlastSide } from './arena';
import { teleport } from './character';
import { setBlastHandler, setTeeter } from './launch';
import { finishMatch, setPhase } from './phases';
import { getRuntime, otherPlayer } from './runtime';
import { GAME_SLOWMO, RESPAWN_DELAY_S, RESPAWN_HEIGHT, RESPAWN_HOVER_S, RT, SUDDEN_DEATH_PCT } from './tuning';

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
  ps.charge = 0;
  if (ps.blocking) { ps.blocking = false; ctx.bus.emit('block', { player, on: false }); }
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
  setPhase(ctx, 'ko');
  ctx.bus.emit('ko', { player: loser, cause: 'ringout' });
  ctx.bus.emit('match:banner', { kind: 'game' });
  ctx.bus.emit('slowmo', GAME_SLOWMO);
  const seq = getRuntime().matchSeq;
  // Temps réel : les ralentis demandés (ici et par les effets) ne doivent pas allonger la fin.
  setTimeout(() => { if (getRuntime().matchSeq === seq) finishMatch(ctx, otherPlayer(loser)); }, GAME_SLOWMO.ms);
}

/** Réapparition : au-dessus du point de réapparition de la map (décalée si l'adversaire y est), % remis à 0
 * (150 en mort subite), invulnérable pendant le vol stationnaire puis RT.respawnInvulnS secondes. */
export function respawn(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const ps = ctx.state.players[player];
  if (!rt.dead || ctx.state.winner != null) return;
  const arena = getArena(ctx);
  let x = arena.respawn[0] + (player === 0 ? -3 : 3);
  let z = arena.respawn[2];
  const pos: Vec3 = [x, arena.respawn[1] + RESPAWN_HEIGHT, z];
  rt.dead = false;
  rt.launch = null;
  rt.ledge = null;
  rt.grounded = false;
  rt.vy = 0;
  rt.jumpsUsed = 0;
  rt.hoverUntil = ctx.loop.time + RESPAWN_HOVER_S;
  rt.invulnUntil = ctx.loop.time + RESPAWN_HOVER_S + RT.respawnInvulnS;
  // Mort subite : on réapparaît à 150 % (sinon la mort subite ne tranche pas un match à 2 vies).
  ps.pct = ctx.state.suddenDeath ? SUDDEN_DEATH_PCT : 0;
  ps.onLedge = false;
  teleport(ctx, player, pos);
  rt.prevPos = [pos[0], pos[1], pos[2]];
  rt.vel = [0, 0, 0];
  ctx.bus.emit('respawn', { player, pos });
}

export function isInvulnerable(ctx: Ctx, player: PlayerId): boolean {
  const rt = getRuntime().players[player];
  return rt.dead || ctx.loop.time < rt.invulnUntil;
}

export function installStocks(): void {
  setBlastHandler(loseStock);
}
