// window.gameHooks : pilotage du jeu par script. Valeurs par défaut minimales ; chaque lot remplace les siennes
// (ex. LG : ctx.hooks.fire = (p) => …). window.gameHooks pointe sur le même objet, donc les remplacements sont visibles.
import type { Bus } from './bus';
import type { Rng } from './rng';
import type { GameHooks, GameState } from './types';

declare global { interface Window { gameHooks: GameHooks } }

export function createHooks(bus: Bus, getState: () => GameState, rng: Rng): GameHooks {
  const warned = new Set<string>();
  const notReady = (name: string) => {
    if (warned.has(name)) return;
    warned.add(name);
    console.warn(`[gameHooks] ${name} n'est pas encore branché (voir plan/lots/).`);
  };
  const hooks: GameHooks = {
    startMatch(opts = {}) {
      const state = getState();
      if (opts.seed != null) { rng.setSeed(opts.seed); state.seed = opts.seed; }
      if (opts.map) state.mapId = opts.map;
      state.turn = 1;
      state.active = 0;
      const from = state.phase;
      state.phase = 'turn-intro';
      bus.emit('match:start', { mapId: state.mapId, seed: state.seed });
      bus.emit('phase:change', { from, to: 'turn-intro' });
      bus.emit('turn:start', { turn: 1, active: 0 });
    },
    move: () => notReady('move'),
    jump: () => notReady('jump'),
    pickWeapon: () => notReady('pickWeapon'),
    aim: () => notReady('aim'),
    fire: () => notReady('fire'),
    parry: () => notReady('parry'),
    grabCrate: () => notReady('grabCrate'),
    scan: () => notReady('scan'),
    skipCamera: () => notReady('skipCamera'),
    forcerVictoire(player = 0) {
      const state = getState();
      state.winner = player;
      state.phase = 'end';
      bus.emit('match:end', { winner: player });
    },
    setSeed(n) { rng.setSeed(n); getState().seed = n; },
    action(text) { hooks.scan(text); },
    animCamera: () => notReady('animCamera'),
    animPlay: () => notReady('animPlay'),
  };
  window.gameHooks = hooks;
  return hooks;
}
