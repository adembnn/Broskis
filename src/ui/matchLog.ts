// Journal de combat : lignes de dégâts, meilleur coup, arme MVP, éjections (lus par l'écran de fin).
// Créé UNE SEULE FOIS au démarrage (voir src/ui/index.ts) : il se réinitialise lui-même à chaque `match:start`.
// Il ne fait qu'observer : les PV, le % et la recharge des armes sont arbitrés par le gameplay (plus aucun repli ici,
// qui retirait les PV une deuxième fois).
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
  /** Vies perdues par chaque joueur pendant le match (règles v2). */
  falls: [number, number];
  totalDamageBy(player: PlayerId): number;
  mvpWeapon(): { id: string; name: string; total: number } | null;
}

export function createMatchLog(ctx: Ctx): MatchLog {
  const weaponTotals = new Map<string, { id: string; name: string; total: number }>();
  const log: MatchLog = {
    lines: [],
    bestHit: null,
    lastKo: null,
    falls: [0, 0],
    totalDamageBy(player) {
      return log.lines.filter((l) => l.attacker === player).reduce((s, l) => s + l.damage, 0);
    },
    mvpWeapon() {
      let best: { id: string; name: string; total: number } | null = null;
      for (const w of weaponTotals.values()) if (!best || w.total > best.total) best = w;
      return best;
    },
  };

  ctx.bus.on('match:start', () => {
    log.lines = [];
    log.bestHit = null;
    log.lastKo = null;
    log.falls = [0, 0];
    weaponTotals.clear();
  });

  ctx.bus.on('hit', ({ target, attacker, weapon, damage, crit }) => {
    const line: DamageLine = { attacker, target, weaponName: weapon.name, damage, crit };
    log.lines.push(line);
    if (!log.bestHit || line.damage > log.bestHit.damage) log.bestHit = line;
    const acc = weaponTotals.get(weapon.id) ?? { id: weapon.id, name: weapon.name, total: 0 };
    acc.total += damage;
    weaponTotals.set(weapon.id, acc);
  });

  ctx.bus.on('stock:lost', ({ player }) => {
    log.falls[player] += 1;
  });
  ctx.bus.on('ringout', ({ player }) => {
    log.lastKo = { player, cause: 'ringout' };
  });
  ctx.bus.on('ko', ({ player, cause }) => {
    log.lastKo = { player, cause };
  });

  return log;
}
