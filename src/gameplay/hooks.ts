// Cycle de vie du match : `startMatch` (persos + 3 armes par défaut si rien n'est fourni, 2 vies, 1 en démo,
// « READY? » puis « GO! » 1,2 s plus tard, contrôles bloqués entre les deux) et `forcerVictoire` (raccourci de
// test). `window.__lsmash` : aides de test des règles v2 (%, BRO SMASH, éjection, bords), jamais utilisées en jeu.
import type { Ctx, PlayerId, StartMatchOptions, Vec3 } from '../core/types';
import { createPlayer } from '../core/state';
import { getSpawnPoints } from '../scene/maps/api';
import { getArena, measureArena } from './arena';
import { forceSuperReady } from './bro';
import { isGroundReady } from './fallback-ground';
import { ensureAllPlayerBodies, teleport } from './character';
import { launchVector } from './formulas';
import { predictLaunch, startLaunch } from './launch';
import { resetParryState } from './parry';
import { beginTurn, finishMatch, playersSettled, setPhase } from './phases';
import { getRuntime, resetRuntime } from './runtime';
import {
  CRATE_INTERVAL_TURNS, FIRST_TURN_BANNER_S, GO_MAX_WAIT_MS, READY_GO_S, STOCKS_DEFAULT, STOCKS_DEMO, SUDDEN_DEATH_PCT,
  defaultArsenal, defaultFighters,
} from './tuning';

function startMatch(ctx: Ctx, opts: StartMatchOptions = {}): void {
  if (opts.seed != null) { ctx.rng.setSeed(opts.seed); ctx.state.seed = opts.seed; }
  if (opts.map) ctx.state.mapId = opts.map;
  if (opts.vsAI !== undefined) ctx.state.vsAI = opts.vsAI;
  if (opts.difficulty !== undefined) ctx.state.difficulty = opts.difficulty;

  resetRuntime(ctx);
  resetParryState();

  const fighters = opts.fighters ?? defaultFighters();
  const weapons = opts.weapons ?? [defaultArsenal(), defaultArsenal()];
  const stocks = Math.max(1, Math.round(opts.stocks ?? (ctx.demo ? STOCKS_DEMO : STOCKS_DEFAULT)));

  ctx.state.players = [createPlayer(0), createPlayer(1)];
  for (const p of [0, 1] as const) {
    const state = ctx.state.players[p];
    state.fighter = fighters[p];
    state.hp = fighters[p].hpMax;
    // Copie à recharge 0 : une revanche avec les mêmes armes n'hérite pas des recharges du match précédent.
    state.weapons = weapons[p].map((w) => ({ ...w, cooldown: 0 }));
    state.pct = 0;
    state.stocks = stocks;
    state.onLedge = false;
  }
  ctx.state.suddenDeath = false;
  ctx.state.winner = null;
  ctx.state.crate = null;
  ctx.state.turn = 0;
  ctx.state.active = 0;

  ensureAllPlayerBodies(ctx);
  getRuntime().nextCrateWarnTurn = 1 + ctx.rng.int(CRATE_INTERVAL_TURNS[0], CRATE_INTERVAL_TURNS[1]);

  setPhase(ctx, 'turn-intro'); // contrôles bloqués jusqu'au « GO! »
  ctx.bus.emit('match:start', { mapId: ctx.state.mapId, seed: ctx.state.seed });
  // La map (lot LM) a pris `current` en synchrone au match:start : on place les persos tout de suite.
  const spawns = getSpawnPoints();
  if (spawns) for (const p of [0, 1] as const) teleport(ctx, p, [...spawns[p]] as Vec3);
  ctx.bus.emit('match:banner', { kind: 'ready' });
  // « GO! » au plus tôt READY_GO_S après « READY? », et seulement une fois le sol de la map posé (chargement
  // asynchrone) : personne ne tombe avant de pouvoir jouer. Plafond GO_MAX_WAIT_MS : le jeu ne se bloque jamais.
  const seq = getRuntime().matchSeq;
  const t0 = performance.now();
  const poll = () => {
    if (getRuntime().matchSeq !== seq) return;
    const elapsed = performance.now() - t0;
    if ((isGroundReady() && elapsed >= READY_GO_S * 1000) || elapsed > GO_MAX_WAIT_MS) {
      measureArena(ctx);
      ctx.bus.emit('match:banner', { kind: 'go' });
      beginTurn(ctx, 1, 0, FIRST_TURN_BANNER_S);
      return;
    }
    setTimeout(poll, 50);
  };
  setTimeout(poll, 50);
}

/** Raccourci de test (agents du harnais) : termine le match tout de suite, sans passer par une éjection réelle. */
function forcerVictoire(ctx: Ctx, player: PlayerId = 0): void {
  if (ctx.state.winner != null) return;
  const loser = ctx.state.players[player === 0 ? 1 : 0];
  if (loser.alive) {
    loser.alive = false;
    loser.stocks = 0;
    ctx.bus.emit('ko', { player: loser.id, cause: 'ringout' });
  }
  finishMatch(ctx, player);
}

declare global {
  interface Window {
    __lsmash?: {
      setPct(player: PlayerId, pct: number): void;
      superReady(player: PlayerId): void;
      /** Éjecte `player` à `speed` m/s vers (dx, dz) ; renvoie l'issue prévue. */
      launch(player: PlayerId, dx: number, dz: number, speed: number): string;
      /** Issue prévue d'une éjection, sans la lancer : 'land' | 'ledge' | 'ko'. */
      predict(player: PlayerId, dx: number, dz: number, speed: number): string;
      arena(): unknown;
      settled(): boolean;
      runtime(player: PlayerId): unknown;
    };
  }
}

export function install(ctx: Ctx): void {
  ctx.hooks.startMatch = (opts) => startMatch(ctx, opts);
  ctx.hooks.forcerVictoire = (player) => forcerVictoire(ctx, player);
  // Régie de démo (?demo=1), F4 = « KO au ralenti » du script : le défenseur passe à 150 % (le prochain coup
  // qui touche l'éjecte, zoom KO compris). Rien d'autre ne change.
  if (ctx.demo) {
    ctx.bus.on('demo:cue', ({ key }) => {
      if (key !== 'F4' || ctx.state.winner != null) return;
      const defender = ctx.state.players[ctx.state.active === 0 ? 1 : 0];
      defender.pct = Math.max(defender.pct, SUDDEN_DEATH_PCT);
    });
  }
  window.__lsmash = {
    setPct: (player, pct) => { ctx.state.players[player].pct = Math.max(0, pct); },
    superReady: (player) => forceSuperReady(ctx, player),
    launch: (player, dx, dz, speed) => {
      const v = launchVector([dx, 0, dz], speed);
      const outcome = predictLaunch(ctx, ctx.state.players[player].pos, v);
      startLaunch(ctx, player, v, player === 0 ? 1 : 0);
      return outcome.kind;
    },
    predict: (player, dx, dz, speed) => predictLaunch(ctx, ctx.state.players[player].pos, launchVector([dx, 0, dz], speed)).kind,
    arena: () => getArena(ctx),
    settled: () => playersSettled(ctx),
    runtime: (player) => {
      const rt = getRuntime().players[player];
      return {
        grounded: rt.grounded, vy: rt.vy, launch: rt.launch, jumpsUsed: rt.jumpsUsed, teetering: rt.teetering,
        ledge: rt.ledge, dead: rt.dead, invulnUntilTurn: rt.invulnUntilTurn, bro: rt.bro, superReady: rt.superReady,
        aimLocked: rt.aimLocked, aimPoint: rt.aimPoint, aimDir: rt.aimDir, charging: rt.charging,
      };
    },
  };
}
