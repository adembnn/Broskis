// État central du jeu + window.gameState (instantané JSON lu par les agents de test et capture.mjs).
import type { GameState, PlayerId, PlayerState } from './types';

export const MOVE_BUDGET = 6;
export const JUMP_COST = 1.5;

export function createPlayer(id: PlayerId): PlayerState {
  return {
    id,
    fighter: null,
    hp: 100,
    pos: [id === 0 ? -5 : 5, 0, 0],
    moveLeft: MOVE_BUDGET,
    jumpUsed: false,
    weapons: [],
    selected: 0,
    alive: true,
    parryStreak: 0,
  };
}

export function createState(seed: number, demo: boolean): GameState {
  return {
    phase: 'title',
    turn: 0,
    active: 0,
    players: [createPlayer(0), createPlayer(1)],
    mapId: 'archipel',
    seed,
    suddenDeath: false,
    timerLeft: 15,
    crate: null,
    winner: null,
    lastEvent: null,
    demo,
    vsAI: false,
    difficulty: 'medium',
  };
}

/** Copie sérialisable : les longues chaînes (images en data URL) sont tronquées. */
export function snapshot(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state, (_k, v) =>
    typeof v === 'string' && v.length > 200 ? `${v.slice(0, 40)}…(${v.length} car.)` : v));
}

declare global { interface Window { gameState: GameState } }

export function exposeState(getState: () => GameState) {
  Object.defineProperty(window, 'gameState', { get: () => snapshot(getState()), configurable: true });
}
