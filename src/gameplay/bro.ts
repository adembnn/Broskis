// Jauge BRO (lot LK, jamais branchée avant les règles v2) : PERFECT +25, GOOD +10, NICE +10, et un peu à
// chaque % reçu ou infligé (façon jauge de Final Smash). Pleine → `super:ready` ; le prochain tir offensif
// de ce joueur est un BRO SMASH (projectiles.ts : `super:fire`, recul ×1,8, dégâts ×1,5).
// `bro:gauge.value` est entre 0 et 1 (le HUD de parade affiche value × 100 %).
import type { Ctx, PlayerId } from '../core/types';
import { getRuntime } from './runtime';
import { BRO_GAIN } from './tuning';

function gain(ctx: Ctx, player: PlayerId, amount: number): void {
  const rt = getRuntime().players[player];
  if (rt.superReady || amount <= 0 || ctx.state.winner != null) return;
  rt.bro = Math.min(100, rt.bro + amount);
  ctx.bus.emit('bro:gauge', { player, value: rt.bro / 100 });
  if (rt.bro >= 100) {
    rt.superReady = true;
    ctx.bus.emit('super:ready', { player });
  }
}

/** Arme le BRO SMASH pour le tir en cours s'il était prêt ; remet la jauge à zéro. */
export function consumeSuper(ctx: Ctx, player: PlayerId): boolean {
  const rt = getRuntime().players[player];
  if (!rt.superReady) return false;
  rt.superReady = false;
  rt.bro = 0;
  ctx.bus.emit('bro:gauge', { player, value: 0 });
  return true;
}

/** Test/démo : remplit la jauge d'un coup (`window.__lsmash.superReady(p)`). */
export function forceSuperReady(ctx: Ctx, player: PlayerId): void {
  gain(ctx, player, 100);
}

export function installBro(ctx: Ctx): void {
  ctx.bus.on('match:start', () => {
    for (const p of [0, 1] as const) ctx.bus.emit('bro:gauge', { player: p, value: 0 });
  });
  ctx.bus.on('parry:result', ({ player, grade }) => {
    if (grade === 'perfect') gain(ctx, player, BRO_GAIN.perfect);
    else if (grade === 'good') gain(ctx, player, BRO_GAIN.good);
  });
  ctx.bus.on('attack:nice', ({ player }) => gain(ctx, player, BRO_GAIN.nice));
  ctx.bus.on('hit', ({ target, attacker, damage }) => {
    gain(ctx, target, damage * BRO_GAIN.perPctTaken);
    if (attacker !== target) gain(ctx, attacker, damage * BRO_GAIN.perPctDealt);
  });
}
