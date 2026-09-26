// Machine d'états des phases de tour (voir le type `Phase` dans core/types.ts) : bandeau de 1 s,
// chrono de secours de 15 s au premier geste, alternance des tours, mort subite, fin de match.
// `setPhase` est le SEUL endroit qui doit changer `ctx.state.phase` (les autres modules l'appellent).
import type { Ctx, Phase, PlayerId } from '../core/types';
import { getRuntime, otherPlayer } from './runtime';
import { KO_PAUSE_S, SUDDEN_DEATH_TURN, TURN_BANNER_S, TURN_FALLBACK_TIMER_S } from './tuning';

export function setPhase(ctx: Ctx, to: Phase): void {
  const from = ctx.state.phase;
  if (from === to) return;
  // Le listener central (core/ctx.ts) applique la mutation ; `emit` est synchrone donc `ctx.state.phase`
  // est déjà à jour dès que cette fonction retourne.
  ctx.bus.emit('phase:change', { from, to });
}

/** À appeler par crate.ts en entrant/sortant de `snap-time` : le chrono de secours ne doit pas courir
 * pendant le scan (voir la friction notée dans le rendu final). */
export function cancelGestureTimer(): void {
  const rt = getRuntime();
  rt.cancelFallbackTimer?.();
  rt.cancelFallbackTimer = null;
  rt.gestureArmed = false;
}

/** Armé par hooks.ts au premier geste du tour (move/jump/pickWeapon/aim/fire). Une seule fois par tour. */
export function armFirstGestureTimer(ctx: Ctx): void {
  const rt = getRuntime();
  if (rt.gestureArmed) return;
  rt.gestureArmed = true;
  const turnAtArm = ctx.state.turn;
  let cancelled = false;
  rt.cancelFallbackTimer = () => { cancelled = true; };
  ctx.loop.later(TURN_FALLBACK_TIMER_S, () => {
    if (cancelled || ctx.state.turn !== turnAtArm) return;
    if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
    endTurn(ctx); // trop lent après avoir commencé à agir : on passe la main (façon bagarre-de-taverne/duel.js)
  });
}

/** Lance le tour `turn` pour `active` : bandeau 1 s (`turn-intro`) puis `move`. */
export function beginTurn(ctx: Ctx, turn: number, active: PlayerId): void {
  cancelGestureTimer();
  ctx.state.turn = turn;
  ctx.state.active = active;
  ctx.state.timerLeft = TURN_FALLBACK_TIMER_S;
  if (turn >= SUDDEN_DEATH_TURN) ctx.state.suddenDeath = true;
  // Une charge en cours (clic maintenu) ne doit jamais survivre à un changement de tour : sinon un simple
  // relâchement de souris, bien plus tard, tirerait un coup fantôme (voir aim.ts::onMouseUp).
  getRuntime().players[0].charging = false;
  getRuntime().players[1].charging = false;
  // Une arme utilisée recharge 1 tour : on décrémente au début du tour de son PROPRIÉTAIRE (voir tuning.ts).
  for (const w of ctx.state.players[active].weapons) if (w.cooldown > 0) w.cooldown -= 1;
  setPhase(ctx, 'turn-intro');
  ctx.bus.emit('turn:start', { turn, active });
  void ctx.loop.wait(TURN_BANNER_S).then(() => {
    if (ctx.state.turn !== turn || ctx.state.phase !== 'turn-intro') return; // déjà passé à autre chose
    setPhase(ctx, 'move');
  });
}

/** Fin normale d'un tour (pas de KO) : le tour suivant revient à l'autre joueur. */
export function endTurn(ctx: Ctx): void {
  const turn = ctx.state.turn;
  const active = ctx.state.active;
  ctx.bus.emit('turn:end', { turn, active });
  beginTurn(ctx, turn + 1, otherPlayer(active));
}

/** KO (PV à 0 ou ring-out) : bascule en phase `ko`, laisse le temps de l'éjection spectaculaire (lot LA),
 * puis termine le match (2 joueurs : le KO décide toujours du vainqueur, pas de système de vies). */
export function goToKo(ctx: Ctx, player: PlayerId, cause: 'hp' | 'ringout'): void {
  if (ctx.state.winner != null) return;
  cancelGestureTimer();
  setPhase(ctx, 'ko');
  ctx.bus.emit('ko', { player, cause });
  ctx.loop.later(KO_PAUSE_S, () => finishMatch(ctx, otherPlayer(player)));
}

/** Point d'entrée unique pour clore le match (KO naturel ou `forcerVictoire`). */
export function finishMatch(ctx: Ctx, winner: PlayerId): void {
  if (ctx.state.winner != null) return;
  cancelGestureTimer();
  ctx.state.winner = winner;
  setPhase(ctx, 'end');
  ctx.bus.emit('match:end', { winner });
}
