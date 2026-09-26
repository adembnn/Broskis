// Déroulé d'un match temps réel (plan/PIVOT-TEMPS-REEL.md) : `countdown` (READY? puis 3-2-1, GO! une fois le
// sol de la map posé) → `fight` (les 2 joueurs agissent en même temps ; horloge de 3:00 avant la mort subite,
// où tout le monde passe à 150 %) → `ko` (GAME!, voir stocks.ts) → `end`.
// `setPhase` est le SEUL endroit qui doit changer `ctx.state.phase` (les autres modules l'appellent).
import type { Ctx, Phase, PlayerId } from '../core/types';
import { measureArena } from './arena';
import { isGroundReady } from './fallback-ground';
import { getRuntime } from './runtime';
import { GO_MAX_WAIT_MS, RT, SUDDEN_DEATH_PCT } from './tuning';

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

export function inFight(ctx: Ctx): boolean {
  return ctx.state.phase === 'fight' && ctx.state.winner == null;
}

/** READY? → 3, 2, 1 → GO! (contrôles bloqués jusque-là). Le compte ne démarre qu'avec le sol de la map. */
export function startCountdown(ctx: Ctx): void {
  const seq = getRuntime().matchSeq;
  setPhase(ctx, 'countdown');
  ctx.bus.emit('match:banner', { kind: 'ready' });
  const t0 = performance.now();
  const waitGround = () => {
    if (getRuntime().matchSeq !== seq) return;
    if (!isGroundReady() && performance.now() - t0 < GO_MAX_WAIT_MS) { setTimeout(waitGround, 50); return; }
    measureArena(ctx);
    let n = Math.max(1, Math.round(RT.countdownS));
    const tick = () => {
      if (getRuntime().matchSeq !== seq) return;
      if (n > 0) { ctx.bus.emit('countdown', { n }); n -= 1; setTimeout(tick, 1000); return; }
      ctx.bus.emit('match:banner', { kind: 'go' });
      getRuntime().fightTime = 0;
      setPhase(ctx, 'fight');
    };
    tick();
  };
  waitGround();
}

/** Horloge du combat (temps de jeu) : `timerLeft` jusqu'à la mort subite, qui met les 2 joueurs à 150 %. */
export function stepMatchClock(ctx: Ctx, dt: number): void {
  if (!inFight(ctx)) return;
  const rt = getRuntime();
  rt.fightTime += dt;
  ctx.state.timerLeft = Math.max(0, RT.suddenDeathS - rt.fightTime);
  if (ctx.state.timerLeft <= 0 && !rt.sdApplied) {
    rt.sdApplied = true;
    ctx.state.suddenDeath = true;
    for (const p of ctx.state.players) p.pct = Math.max(p.pct, SUDDEN_DEATH_PCT);
  }
}

/** Point d'entrée unique pour clore le match (dernière vie perdue ou `forcerVictoire`). */
export function finishMatch(ctx: Ctx, winner: PlayerId): void {
  if (ctx.state.winner != null) return;
  ctx.state.winner = winner;
  setPhase(ctx, 'end');
  ctx.bus.emit('match:end', { winner });
}
