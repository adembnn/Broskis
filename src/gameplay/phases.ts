// Machine d'états des phases de tour (voir le type `Phase` dans core/types.ts) : bandeau de tour, alternance,
// mort subite (tout le monde à 150 %), fin de match. Règles v2 : le budget de déplacement et les sauts sont
// rendus à chaque tour, une arme prête est présélectionnée, et le tour ne passe qu'une fois les éjections finies.
// `setPhase` est le SEUL endroit qui doit changer `ctx.state.phase` (les autres modules l'appellent).
import type { Ctx, Phase, PlayerId, Vec3 } from '../core/types';
import { MOVE_BUDGET } from '../core/state';
import { teleport } from './character';
import { getRuntime, otherPlayer } from './runtime';
import {
  LEDGE_CLIMB_COST, SETTLE_TIMEOUT_MS, SUDDEN_DEATH_PCT, SUDDEN_DEATH_TURN, TURN_BANNER_S, TURN_FALLBACK_TIMER_S,
} from './tuning';

export function setPhase(ctx: Ctx, to: Phase): void {
  const from = ctx.state.phase;
  if (from === to) return;
  // Le listener central (core/ctx.ts) applique la mutation ; `emit` est synchrone donc `ctx.state.phase`
  // est déjà à jour dès que cette fonction retourne.
  ctx.bus.emit('phase:change', { from, to });
}

export function matchIsOver(ctx: Ctx): boolean {
  return ctx.state.winner != null || ctx.state.phase === 'ko' || ctx.state.phase === 'end';
}

/** Remet à zéro l'horloge d'inactivité (tir automatique après 15 s sans geste, voir autofire.ts). */
export function cancelGestureTimer(): void {
  getRuntime().lastGestureMs = performance.now();
}

/** Un geste du joueur actif (déplacement, saut, arme, visée, charge) : repousse le tir automatique. */
export function noteGesture(_ctx: Ctx): void {
  getRuntime().lastGestureMs = performance.now();
}

/** Tout le monde a fini de voler (éjection, réapparition, rattrapage) : on peut passer le tour. */
export function playersSettled(ctx: Ctx): boolean {
  for (const p of [0, 1] as const) {
    const rt = getRuntime().players[p];
    if (rt.launch || rt.dead || ctx.loop.time < rt.hoverUntil) return false;
    if (!rt.grounded && !rt.ledge) return false;
  }
  return true;
}

/** Au début du tour : budget rendu, sauts rendus, arme prête présélectionnée, mort subite. */
function prepareTurn(ctx: Ctx, active: PlayerId): void {
  const ps = ctx.state.players[active];
  const rt = getRuntime().players[active];
  ps.moveLeft = MOVE_BUDGET;
  ps.jumpUsed = false;
  rt.jumpsUsed = 0;
  rt.edgePushS = 0;
  rt.aimLocked = false;
  // Une arme utilisée recharge 1 tour : on décrémente au début du tour de son PROPRIÉTAIRE (voir tuning.ts).
  for (const w of ps.weapons) if (w.cooldown > 0) w.cooldown -= 1;
  const sel = ps.weapons[ps.selected];
  if (!sel || sel.cooldown > 0) {
    const ready = ps.weapons.findIndex((w) => w.cooldown <= 0);
    if (ready >= 0 && ready !== ps.selected) {
      ps.selected = ready;
      ctx.bus.emit('weapon:pick', { player: active, index: ready });
    }
  }
}

/** Mort subite : APRÈS `turn:start` (map-events, lot LMAP2, pose `suddenDeath` et émet `map:event` lui-même
 * s'il le trouve encore à false) ; les deux joueurs passent à 150 %, une seule fois. */
function applySuddenDeath(ctx: Ctx, turn: number): void {
  const rt = getRuntime();
  if (turn < SUDDEN_DEATH_TURN || rt.sdApplied) return;
  rt.sdApplied = true;
  ctx.state.suddenDeath = true;
  for (const p of ctx.state.players) p.pct = Math.max(p.pct, SUDDEN_DEATH_PCT);
}

/** Accroché au bord au début de son tour : il remonte (`ledge:climb`, coûte LEDGE_CLIMB_COST m). */
export function climbLedge(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const ps = ctx.state.players[player];
  if (!rt.ledge) return;
  const { edge, inward } = rt.ledge;
  rt.ledge = null;
  ps.onLedge = false;
  const top: Vec3 = [edge[0] + inward[0] * 0.7, edge[1] + 0.05, edge[2] + inward[2] * 0.7];
  teleport(ctx, player, top);
  rt.grounded = true;
  ps.moveLeft = Math.max(0, ps.moveLeft - LEDGE_CLIMB_COST);
  ctx.bus.emit('ledge:climb', { player });
  ctx.bus.emit('move:update', { player, pos: top, moveLeft: ps.moveLeft });
}

/** Lance le tour `turn` pour `active` : bandeau (`turn-intro`) puis `move`. */
export function beginTurn(ctx: Ctx, turn: number, active: PlayerId, bannerS = TURN_BANNER_S): void {
  const seq = getRuntime().matchSeq;
  ctx.state.turn = turn;
  ctx.state.active = active;
  ctx.state.timerLeft = TURN_FALLBACK_TIMER_S;
  // Une charge en cours (clic maintenu) ne doit jamais survivre à un changement de tour : sinon un simple
  // relâchement de souris, bien plus tard, tirerait un coup fantôme (voir aim.ts::onMouseUp).
  getRuntime().players[0].charging = false;
  getRuntime().players[1].charging = false;
  prepareTurn(ctx, active);
  setPhase(ctx, 'turn-intro');
  ctx.bus.emit('turn:start', { turn, active });
  applySuddenDeath(ctx, turn);
  void ctx.loop.wait(bannerS).then(() => {
    if (getRuntime().matchSeq !== seq) return;
    if (ctx.state.turn !== turn || ctx.state.phase !== 'turn-intro') return; // déjà passé à autre chose
    setPhase(ctx, 'move');
    const rt = getRuntime();
    rt.turnPlayStartMs = performance.now();
    rt.lastGestureMs = performance.now();
    if (rt.players[active].ledge) climbLedge(ctx, active);
  });
}

/** Fin normale d'un tour : le tour suivant revient à l'autre joueur. */
export function endTurn(ctx: Ctx): void {
  if (matchIsOver(ctx)) return;
  const turn = ctx.state.turn;
  const active = ctx.state.active;
  ctx.bus.emit('turn:end', { turn, active });
  beginTurn(ctx, turn + 1, otherPlayer(active));
}

/** Passe le tour dès que plus personne ne vole (plafond SETTLE_TIMEOUT_MS : le jeu ne se bloque jamais). */
export function endTurnWhenSettled(ctx: Ctx): void {
  const seq = getRuntime().matchSeq;
  const turn = ctx.state.turn;
  const start = performance.now();
  const poll = () => {
    if (getRuntime().matchSeq !== seq || ctx.state.turn !== turn || matchIsOver(ctx)) return;
    if (playersSettled(ctx) || performance.now() - start > SETTLE_TIMEOUT_MS) { endTurn(ctx); return; }
    setTimeout(poll, 50);
  };
  poll();
}

/** Point d'entrée unique pour clore le match (dernière vie perdue ou `forcerVictoire`). */
export function finishMatch(ctx: Ctx, winner: PlayerId): void {
  if (ctx.state.winner != null) return;
  ctx.state.winner = winner;
  setPhase(ctx, 'end');
  ctx.bus.emit('match:end', { winner });
}
