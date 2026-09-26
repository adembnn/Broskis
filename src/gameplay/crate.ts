// Caisse Snap en temps réel : toutes les 35 s de combat, son ombre est annoncée (`crate:warn`), elle tombe 3 s
// plus tard (`crate:land`) ; le premier qui la touche (`crate:grab`) reçoit INSTANTANÉMENT une arme bonus
// (objet déjà scanné ou du cache, via src/ia), qui remplace son arme choisie. Aucune pause.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { scanObject } from '../ia';
import { getCrateSpots } from '../scene/maps/api';
import { getArena, groundYBelow } from './arena';
import { inFight } from './phases';
import { getRuntime } from './runtime';
import { CRATE_PICKUP_RADIUS, RT } from './tuning';

let crateCount = 0;

function pickCratePosition(ctx: Ctx): Vec3 {
  const spots = getCrateSpots();
  if (spots.length) {
    const s = spots[ctx.rng.int(0, spots.length - 1)];
    return [s[0], s[1], s[2]];
  }
  const a = getArena(ctx);
  const ang = ctx.rng.range(0, Math.PI * 2);
  const r = ctx.rng.range(0, a.radius * 0.6);
  const x = a.center[0] + Math.cos(ang) * r, z = a.center[2] + Math.sin(ang) * r;
  const y = groundYBelow(ctx, [x, a.top + 10, z], 20);
  return [x, y ?? a.top, z];
}

function grab(ctx: Ctx, player: PlayerId): void {
  const crate = ctx.state.crate;
  if (!crate || !crate.landed) return;
  ctx.state.crate = null;
  ctx.bus.emit('crate:grab', { player });
  const rt = getRuntime();
  const give = (weapon: Weapon) => {
    if (!inFight(ctx)) return;
    const ps = ctx.state.players[player];
    const slot = ps.selected;
    ps.weapons[slot] = { ...weapon, cooldown: 0 };
    ps.cooldowns[slot] = 0;
    ctx.bus.emit('weapon:pick', { player, index: slot });
    ctx.bus.emit('weapon:ready', { player, index: slot });
  };
  if (rt.crateWeapon) { give(rt.crateWeapon); rt.crateWeapon = null; return; }
  // Sans arme préparée : clé de cache locale, résolue sans réseau (quasi instantané).
  scanObject(`crate:${player}:${crateCount}`, { player }).then(give).catch(() => {});
}

/** Système : minuterie de la caisse (temps de combat) et ramassage au contact. */
export function stepCrate(ctx: Ctx): void {
  if (!inFight(ctx)) return;
  const rt = getRuntime();
  if (!ctx.state.crate && rt.fightTime >= rt.nextCrateAt) {
    rt.nextCrateAt = rt.fightTime + RT.crateEveryS;
    crateCount += 1;
    const pos = pickCratePosition(ctx);
    ctx.state.crate = { pos, landsInTurns: 0, landed: false };
    ctx.bus.emit('crate:warn', { pos });
    // Arme bonus préparée pendant l'annonce : le ramassage sera instantané.
    rt.crateWeapon = null;
    const seq = rt.matchSeq;
    scanObject(`crate:${crateCount}`, {}).then((w) => { if (getRuntime().matchSeq === seq) getRuntime().crateWeapon = w; }).catch(() => {});
    ctx.loop.later(RT.crateWarnS, () => {
      const c = ctx.state.crate;
      if (getRuntime().matchSeq !== seq || !c || c.landed) return;
      c.landed = true;
      ctx.bus.emit('crate:land', { pos: c.pos });
    });
  }
  const crate = ctx.state.crate;
  if (!crate || !crate.landed) return;
  for (const p of [0, 1] as const) {
    if (getRuntime().players[p].dead) continue;
    const pos = ctx.state.players[p].pos;
    if (Math.hypot(pos[0] - crate.pos[0], pos[2] - crate.pos[2]) <= CRATE_PICKUP_RADIUS && Math.abs(pos[1] - crate.pos[1]) < 1.5) {
      grab(ctx, p);
      return;
    }
  }
}

/** Appelé après un déplacement (movement.ts) : ramassage immédiat. */
export function checkCratePickup(ctx: Ctx, player: PlayerId): void {
  const crate = ctx.state.crate;
  if (!crate || !crate.landed) return;
  const pos = ctx.state.players[player].pos;
  if (Math.hypot(pos[0] - crate.pos[0], pos[2] - crate.pos[2]) <= CRATE_PICKUP_RADIUS) grab(ctx, player);
}

export function install(ctx: Ctx): void {
  ctx.bus.on('match:start', () => {
    crateCount = 0;
    getRuntime().nextCrateAt = RT.crateEveryS;
  });
  ctx.hooks.grabCrate = () => {
    // Test : pose la caisse sous les pieds de P1 et la ramasse.
    const pos = ctx.state.players[0].pos;
    ctx.state.crate = { pos: [pos[0], pos[1], pos[2]], landsInTurns: 0, landed: true };
    grab(ctx, 0);
  };
}
