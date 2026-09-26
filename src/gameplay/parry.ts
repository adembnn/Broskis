// Parade — module ISOLÉ et facile à régler (cadrage Adem du 26/09) : timing en millisecondes réelles
// (performance.now()/event.timeStamp), jamais en images. J1 = Space, J2 = Enter (event.code), chacun avec
// sa propre touche. `gameHooks.parry(offsetMs)` reste utilisable par script (agents de test, sans clavier).
// Plusieurs attaques peuvent menacer le même défenseur en même temps (rafale du blaster) : une LISTE par
// joueur, on pare toujours celle qui arrive le plus tôt.
// Repères visuels, combos, jauge BRO, feintes : PAS ICI, ce sera un lot dédié après fusion (voir la table
// PARRY_WINDOWS ci-dessous, déjà prête à recevoir des paliers par tour).
import type { Ctx, ParryGrade, PlayerId, Weapon } from '../core/types';
import { getParryWindow, PARRY_KEY_CODE, PARRY_OFFSET_MS, PARRY_REWARD_SLOWMO } from './tuning';

export interface ParryOutcome { grade: ParryGrade; deltaMs: number }

export interface IncomingAttack {
  /** Identifiant du projectile (repris dans `projectile:incoming`). */
  id: string;
  /** Le défenseur : celui qui peut parer cette attaque. */
  player: PlayerId;
  attacker: PlayerId;
  weapon: Weapon;
  /** Index dans la rafale. */
  index?: number;
  /** Taille de la rafale. */
  count?: number;
  /** Temps de vol total restant, EN MILLISECONDES RÉELLES, depuis l'appel de `registerIncoming`. */
  totalTravelMs: number;
  /** Délai avant l'émission de `projectile:incoming` (fin de la bascule caméra, voir tuning.ts). */
  incomingDelayMs: number;
  /** Appelé une seule fois, à la résolution (touche pressée, script, ou délai écoulé sans réaction). */
  onResolve(outcome: ParryOutcome): void;
}

interface PendingEntry {
  id: string;
  tImpactMs: number;
  attacker: PlayerId;
  weapon: Weapon;
  index: number;
  count: number;
  onResolve: (outcome: ParryOutcome) => void;
  incomingTimer: ReturnType<typeof setTimeout>;
  impactTimer: ReturnType<typeof setTimeout>;
}

const pending: [PendingEntry[], PendingEntry[]] = [[], []];
const stunnedUntil: [number, number] = [0, 0]; // anti-martelage

/** À appeler par hooks.ts au `startMatch` : oublie toute parade en attente d'un match précédent. */
export function resetParryState(): void {
  for (const list of pending) {
    for (const entry of list) { clearTimeout(entry.incomingTimer); clearTimeout(entry.impactTimer); }
    list.length = 0;
  }
  stunnedUntil[0] = 0;
  stunnedUntil[1] = 0;
}

function getAdjustedWindows(ctx: Ctx, defenderId: PlayerId, weapon: Weapon): { perfect: number, good: number } {
  const turn = ctx.state.turn;
  const baseWin = getParryWindow(turn);
  
  const defender = ctx.state.players[defenderId];
  const agility = defender.fighter?.agility ?? 5;
  const agilityMod = (agility - 5) * 10;

  const isHeavy = weapon.trait === 'heavy';
  const isFast = weapon.category === 'blaster' || (weapon.category === 'throwable' && weapon.stats.b > 3);
  let weaponMod = isHeavy ? 15 : (isFast ? -10 : 0);

  const defenderWeapon = defender.weapons[defender.selected];
  const shieldMod = defenderWeapon?.category === 'shield' ? 20 : 0;

  let perfect = baseWin.perfectMs + agilityMod + weaponMod + shieldMod;
  perfect = Math.max(40, Math.min(110, perfect));
  const good = Math.round(perfect * 2.2);
  
  return { perfect, good };
}

function gradeFromDelta(ctx: Ctx, entry: PendingEntry, defenderId: PlayerId, deltaMs: number): ParryGrade {
  const { perfect, good } = getAdjustedWindows(ctx, defenderId, entry.weapon);
  const abs = Math.abs(deltaMs);
  if (abs <= perfect) return 'perfect';
  if (abs <= good) return 'good';
  return 'miss';
}

/** Retire et résout une entrée précise (jamais deux fois la même, même si deux minuteurs se chevauchent). */
function finalizeEntry(ctx: Ctx, player: PlayerId, entry: PendingEntry, grade: ParryGrade, deltaMs: number): void {
  const list = pending[player];
  const i = list.indexOf(entry);
  if (i < 0) return; // déjà résolue
  list.splice(i, 1);
  clearTimeout(entry.incomingTimer);
  clearTimeout(entry.impactTimer);
  
  const state = ctx.state.players[player];
  if (grade === 'miss') {
    state.parryStreak = 0;
  } else {
    state.parryStreak++;
  }
  
  let multiplier = 1;
  if (state.parryStreak >= 3) multiplier = 2;
  else if (state.parryStreak >= 2) multiplier = 1.5;

  ctx.bus.emit('parry:result', { player, grade, deltaMs: Math.round(deltaMs) });
  
  if (grade !== 'miss') {
    ctx.bus.emit('parry:streak', { player, streak: state.parryStreak, multiplier });
  }

  entry.onResolve({ grade, deltaMs });
}

/** Enregistre une attaque parable. Émet elle-même `projectile:incoming` au bon moment (voir tuning.ts). */
export function registerIncoming(ctx: Ctx, attack: IncomingAttack): void {
  const tImpactMs = performance.now() + attack.totalTravelMs;
  const entry: PendingEntry = {
    id: attack.id,
    tImpactMs,
    attacker: attack.attacker,
    weapon: attack.weapon,
    index: attack.index ?? 1,
    count: attack.count ?? 1,
    onResolve: attack.onResolve,
    incomingTimer: setTimeout(() => {
      ctx.bus.emit('projectile:incoming', {
        id: attack.id, target: attack.player, etaMs: Math.max(0, Math.round(tImpactMs - performance.now())),
      });
      const { perfect, good } = getAdjustedWindows(ctx, attack.player, attack.weapon);
      ctx.bus.emit('parry:window', { 
        defender: attack.player, 
        tImpact: tImpactMs, 
        perfectMs: perfect, 
        goodMs: good,
        index: attack.index ?? 1,
        count: attack.count ?? 1
      });
    }, attack.incomingDelayMs),
    impactTimer: setTimeout(() => {
      finalizeEntry(ctx, attack.player, entry, 'miss', tImpactMs - performance.now());
    }, attack.totalTravelMs),
  };
  pending[attack.player].push(entry);
}

/** Celle qui doit atterrir le plus tôt : c'est elle qu'un joueur cherche à parer. */
function earliestEntry(player: PlayerId): PendingEntry | undefined {
  return pending[player].reduce<PendingEntry | undefined>(
    (best, e) => (!best || e.tImpactMs < best.tImpactMs ? e : best), undefined,
  );
}

function handleKeyParry(ctx: Ctx, player: PlayerId, timeStampMs: number): void {
  const now = performance.now();
  if (now < stunnedUntil[player]) return; // sonné, on ignore l'appui

  const entry = earliestEntry(player);
  if (!entry) {
    // Appui dans le vide (hors fenêtre d'une attaque)
    stunnedUntil[player] = now + 250;
    return;
  }
  
  const deltaMs = timeStampMs - entry.tImpactMs - PARRY_OFFSET_MS;
  const { good } = getAdjustedWindows(ctx, player, entry.weapon);
  
  if (Math.abs(deltaMs) > good) {
    // Appui hors fenêtre de la plus proche (trop tôt ou trop tard)
    stunnedUntil[player] = now + 250;
  }
  
  finalizeEntry(ctx, player, entry, gradeFromDelta(ctx, entry, player, deltaMs), deltaMs);
}

/** `gameHooks.parry(offsetMs)` : agit sur le premier défenseur en attente (utilisable sans clavier). */
function handleHookParry(ctx: Ctx, offsetMs: number): void {
  const player: PlayerId | null = pending[0].length > 0 ? 0 : pending[1].length > 0 ? 1 : null;
  if (player == null) return;
  const entry = earliestEntry(player);
  if (!entry) return;
  finalizeEntry(ctx, player, entry, gradeFromDelta(ctx, entry, player, offsetMs), offsetMs);
}

/** Récompense (pas de pénalité) : ralenti bref sur le renvoi qui suit une parade PARFAITE (voir projectiles.ts). */
export function emitPerfectReflectReward(ctx: Ctx): void {
  ctx.bus.emit('slowmo', PARRY_REWARD_SLOWMO);
}

export function install(ctx: Ctx): void {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === PARRY_KEY_CODE[0]) { e.preventDefault(); handleKeyParry(ctx, 0, e.timeStamp); }
    else if (e.code === PARRY_KEY_CODE[1]) { e.preventDefault(); handleKeyParry(ctx, 1, e.timeStamp); }
  });
  ctx.hooks.parry = (offsetMs) => handleHookParry(ctx, offsetMs ?? 0);
}
