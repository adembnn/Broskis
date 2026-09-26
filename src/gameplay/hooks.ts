// Cycle de vie du match temps réel : `startMatch({ fighters, weapons, map, split, stocks, seed })` (persos + 3
// armes par défaut si rien n'est fourni, 2 vies, 1 en démo, puis READY? 3-2-1 GO!) et les hooks de test :
// `input(player, action, down)` (même chemin que le clavier et la manette), `forcerVictoire`, et des raccourcis
// hérités (`move`, `jump`, `pickWeapon`, `fire`, `parry`) qui agissent sur P1 (ou bloquent pour P2 : `parry`).
// `window.__lsmash` : aides de test des règles v2 (%, BRO SMASH, éjection), jamais utilisées en jeu.
import type { Ctx, PlayerId, StartMatchOptions, Vec3 } from '../core/types';
import { createPlayer } from '../core/state';
import { getSpawnPoints } from '../scene/maps/api';
import { getArena } from './arena';
import { forceSuperReady } from './bro';
import { ensureAllPlayerBodies, oneWayBoxes, teleport } from './character';
import { fireWeapon } from './combat';
import { clearInputs, setHookInput } from './controls';
import { launchVector } from './formulas';
import { predictLaunch, startLaunch } from './launch';
import { jump, moveBy } from './movement';
import { finishMatch, startCountdown } from './phases';
import { clearProjectiles, liveProjectiles } from './projectiles';
import { getRuntime, resetRuntime } from './runtime';
import { RT, STOCKS_DEFAULT, STOCKS_DEMO, SUDDEN_DEATH_PCT, defaultArsenal, defaultFighters } from './tuning';

function startMatch(ctx: Ctx, opts: StartMatchOptions = {}): void {
  if (opts.seed != null) { ctx.rng.setSeed(opts.seed); ctx.state.seed = opts.seed; }
  if (opts.map) ctx.state.mapId = opts.map;
  if (opts.vsAI !== undefined) ctx.state.vsAI = opts.vsAI;
  if (opts.difficulty !== undefined) ctx.state.difficulty = opts.difficulty;
  // Écran scindé à 2 humains ; contre l'IA, plein écran pour l'humain.
  ctx.state.split = opts.split ?? !ctx.state.vsAI;

  resetRuntime(ctx);
  clearProjectiles();
  clearInputs();

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
    state.cooldowns = state.weapons.map(() => 0);
    state.pct = 0;
    state.stocks = stocks;
  }
  ctx.state.suddenDeath = false;
  ctx.state.winner = null;
  ctx.state.crate = null;
  ctx.state.turn = 0;
  ctx.state.active = 0;
  ctx.state.timerLeft = RT.suddenDeathS;

  ensureAllPlayerBodies(ctx);
  ctx.bus.emit('match:start', { mapId: ctx.state.mapId, seed: ctx.state.seed });
  // La map (lot LMAP2) construit sa physique en synchrone au match:start : on place les persos tout de suite.
  const spawns = getSpawnPoints();
  if (spawns) for (const p of [0, 1] as const) { teleport(ctx, p, [...spawns[p]] as Vec3); getRuntime().players[p].prevPos = [...spawns[p]] as Vec3; }
  startCountdown(ctx);
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
      runtime(player: PlayerId): unknown;
      projectiles(): unknown;
      /** Test : pose un perso à (x, y, z) ; et liste des plateformes traversables. */
      place(player: PlayerId, x: number, y: number, z: number): void;
      oneWay(): unknown;
    };
  }
}

export function install(ctx: Ctx): void {
  ctx.hooks.startMatch = (opts) => startMatch(ctx, opts);
  ctx.hooks.forcerVictoire = (player) => forcerVictoire(ctx, player);
  ctx.hooks.input = (player, action, down) => setHookInput(player, action, down);
  // Raccourcis hérités du tour par tour, gardés pour les scripts : ils agissent sur P1.
  ctx.hooks.move = (dx, dz) => moveBy(ctx, 0, dx, dz, 0, true);
  ctx.hooks.jump = () => jump(ctx, 0);
  ctx.hooks.pickWeapon = (index) => {
    const ps = ctx.state.players[0];
    if (index < 0 || index >= ps.weapons.length) return;
    ps.selected = index;
    ctx.bus.emit('weapon:pick', { player: 0, index });
  };
  ctx.hooks.aim = () => {}; // visée verrouillée sur l'adversaire
  ctx.hooks.fire = (power) => { fireWeapon(ctx, 0, power); };
  ctx.hooks.parry = () => { setHookInput(1, 'parry', true); setTimeout(() => setHookInput(1, 'parry', false), 400); };
  // Régie de démo (?demo=1), F4 = « KO au ralenti » du script : P2 passe à 150 % (le prochain coup l'éjecte).
  if (ctx.demo) {
    ctx.bus.on('demo:cue', ({ key }) => {
      if (key !== 'F4' || ctx.state.winner != null) return;
      const p2 = ctx.state.players[1];
      p2.pct = Math.max(p2.pct, SUDDEN_DEATH_PCT);
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
    runtime: (player) => {
      const rt = getRuntime().players[player];
      return {
        grounded: rt.grounded, vy: rt.vy, launch: rt.launch, jumpsUsed: rt.jumpsUsed, teetering: rt.teetering,
        ledge: rt.ledge, dead: rt.dead, invulnUntil: rt.invulnUntil, bro: rt.bro, superReady: rt.superReady,
        charging: rt.charging, vel: rt.vel, fightTime: getRuntime().fightTime,
      };
    },
    projectiles: () => liveProjectiles().map((p) => ({ id: p.id, owner: p.owner, pos: p.pos })),
    place: (player, x, y, z) => {
      teleport(ctx, player, [x, y, z]);
      const rt = getRuntime().players[player];
      rt.prevPos = [x, y, z]; rt.grounded = false; rt.vy = 0; rt.launch = null; rt.ledge = null;
    },
    oneWay: () => oneWayBoxes(ctx),
  };
}
