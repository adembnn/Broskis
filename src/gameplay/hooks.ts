// Cycle de vie du match : `startMatch` (persos + 3 armes par défaut si rien n'est fourni) et
// `forcerVictoire` (raccourci de test, toujours utilisable sans souris ni clavier).
import type { Ctx, PlayerId, StartMatchOptions } from '../core/types';
import { createPlayer } from '../core/state';
import { ensureAllPlayerBodies } from './character';
import { resetParryState } from './parry';
import { beginTurn, finishMatch } from './phases';
import { getRuntime, resetRuntime } from './runtime';
import { CRATE_INTERVAL_TURNS, defaultArsenal, defaultFighters } from './tuning';

function startMatch(ctx: Ctx, opts: StartMatchOptions = {}): void {
  if (opts.seed != null) { ctx.rng.setSeed(opts.seed); ctx.state.seed = opts.seed; }
  if (opts.map) ctx.state.mapId = opts.map;

  resetRuntime(ctx);
  resetParryState();

  const fighters = opts.fighters ?? defaultFighters();
  const weapons = opts.weapons ?? [defaultArsenal(), defaultArsenal()];

  ctx.state.players = [createPlayer(0), createPlayer(1)];
  for (const p of [0, 1] as const) {
    const state = ctx.state.players[p];
    state.fighter = fighters[p];
    state.hp = fighters[p].hpMax;
    state.weapons = weapons[p];
  }
  ctx.state.suddenDeath = false;
  ctx.state.winner = null;
  ctx.state.crate = null;

  ensureAllPlayerBodies(ctx);
  getRuntime().nextCrateWarnTurn = 1 + ctx.rng.int(CRATE_INTERVAL_TURNS[0], CRATE_INTERVAL_TURNS[1]);

  ctx.bus.emit('match:start', { mapId: ctx.state.mapId, seed: ctx.state.seed });
  beginTurn(ctx, 1, 0);
}

/** Raccourci de test (agents du harnais) : termine le match tout de suite, sans passer par un K.O. réel. */
function forcerVictoire(ctx: Ctx, player: PlayerId = 0): void {
  if (ctx.state.winner != null) return;
  const loser = ctx.state.players[player === 0 ? 1 : 0];
  if (loser.alive) {
    loser.alive = false;
    loser.hp = 0;
    ctx.bus.emit('ko', { player: loser.id, cause: 'hp' });
  }
  finishMatch(ctx, player);
}

export function install(ctx: Ctx): void {
  ctx.hooks.startMatch = (opts) => startMatch(ctx, opts);
  ctx.hooks.forcerVictoire = (player) => forcerVictoire(ctx, player);
}
