// Journal de combat : lignes de dégâts, meilleur coup, arme MVP (lus par l'écran de fin « Damage Report »).
//
// Décision de lot (à signaler à LG-gameplay, encore un stub qui ne fait rien) : tant que personne d'autre n'arbitre
// les PV et le cooldown des armes, ce module le fait ici — sinon le HUD n'aurait jamais rien à montrer. Créé UNE
// SEULE FOIS au démarrage (voir src/ui/index.ts) : il se réinitialise lui-même à chaque `match:start`.
import type { Ctx, PlayerId } from '../core/types';

export interface DamageLine {
  attacker: PlayerId;
  target: PlayerId;
  weaponName: string;
  damage: number;
  crit: boolean;
}

export interface MatchLog {
  lines: DamageLine[];
  bestHit: DamageLine | null;
  lastKo: { player: PlayerId; cause: 'hp' | 'ringout' } | null;
  totalDamageBy(player: PlayerId): number;
  mvpWeapon(): { name: string; total: number } | null;
}

export function createMatchLog(ctx: Ctx): MatchLog {
  const weaponTotals = new Map<string, { name: string; total: number }>();
  const log: MatchLog = {
    lines: [],
    bestHit: null,
    lastKo: null,
    totalDamageBy(player) {
      return log.lines.filter((l) => l.attacker === player).reduce((s, l) => s + l.damage, 0);
    },
    mvpWeapon() {
      let best: { name: string; total: number } | null = null;
      for (const w of weaponTotals.values()) if (!best || w.total > best.total) best = w;
      return best;
    },
  };

  ctx.bus.on('match:start', () => {
    log.lines = [];
    log.bestHit = null;
    log.lastKo = null;
    weaponTotals.clear();
  });

  ctx.bus.on('hit', ({ target, attacker, weapon, damage, crit }) => {
    const line: DamageLine = { attacker, target, weaponName: weapon.name, damage, crit };
    log.lines.push(line);
    if (!log.bestHit || line.damage > log.bestHit.damage) log.bestHit = line;
    const acc = weaponTotals.get(weapon.id) ?? { name: weapon.name, total: 0 };
    acc.total += damage;
    weaponTotals.set(weapon.id, acc);
    // Fallback d'arbitrage (voir en-tête) : sans ça, state.players[].hp ne bougerait jamais.
    const p = ctx.state.players[target];
    p.hp = Math.max(0, p.hp - damage);
  });

  ctx.bus.on('fire', ({ player, weapon }) => {
    const w = ctx.state.players[player].weapons.find((x) => x.id === weapon.id);
    if (w) w.cooldown = 1;
  });
  ctx.bus.on('turn:start', ({ active }) => {
    for (const w of ctx.state.players[active].weapons) w.cooldown = Math.max(0, w.cooldown - 1);
  });
  ctx.bus.on('ringout', ({ player }) => {
    log.lastKo = { player, cause: 'ringout' };
  });
  ctx.bus.on('ko', ({ player, cause }) => {
    log.lastKo = { player, cause };
  });

  return log;
}
