// Planificateur de l'adversaire IA, règles v2 : il vise le % et l'éjection (plus les PV). Positions candidates
// sur le budget de déplacement (jamais au ras du vide), puis tirs candidats notés : dégâts en %, + gros bonus
// si l'éjection prévue sort l'humain de l'arène, − malus si l'IA reste près du bord.
import type { Ctx, PlayerId, Vec3 } from '../../core/types';
import { getArena } from '../arena';
import { previewDamage, previewLaunchSpeed } from '../damage';
import { flatAirDistance } from '../formulas';
import { predictTrajectory } from '../trajectory';
import { GRENADE_RANGE_MIN, GRENADE_RANGE_SPAN, LEDGE_GRAB_DIST, SHOT_ORIGIN_HEIGHT } from '../tuning';

export interface AICandidate {
  id: string;
  desc: string;
  pos: Vec3;
  weaponIdx: number;
  yawDeg: number;
  pitchDeg: number;
  power: number;
  score: number;
}

function dist2(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Distance restante jusqu'au bord de l'arène (cercle) depuis `p`, dans la direction `dir` (horizontale). */
function distToEdgeAlong(ctx: Ctx, p: Vec3, dir: [number, number]): number {
  const a = getArena(ctx);
  const ox = p[0] - a.center[0], oz = p[2] - a.center[2];
  const b = ox * dir[0] + oz * dir[1];
  const c = ox * ox + oz * oz - a.radius * a.radius;
  const disc = b * b - c;
  return disc < 0 ? 0 : -b + Math.sqrt(disc);
}

export function planMoves(ctx: Ctx, aiId: PlayerId): AICandidate[] {
  const ai = ctx.state.players[aiId];
  if (!ai.alive) return [];
  const target = ctx.state.players[aiId === 0 ? 1 : 0];
  const arena = getArena(ctx);
  const budget = ai.moveLeft;
  const candidates: AICandidate[] = [];

  const posCandidates: Vec3[] = [ai.pos];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    for (const r of [budget / 2, budget]) {
      posCandidates.push([ai.pos[0] + Math.cos(angle) * r, ai.pos[1], ai.pos[2] + Math.sin(angle) * r]);
    }
  }
  if (ctx.state.crate && ctx.state.crate.landed && dist2(ai.pos, ctx.state.crate.pos) <= budget) {
    posCandidates.push([ctx.state.crate.pos[0], ai.pos[1], ctx.state.crate.pos[2]]);
  }

  let candidateId = 0;
  for (const pos of posCandidates) {
    const fromCenter = Math.hypot(pos[0] - arena.center[0], pos[2] - arena.center[2]);
    const edgeDist = arena.radius - fromCenter;
    if (edgeDist < 0.8) continue; // jamais dans le vide
    // Près du bord = dangereux, d'autant plus que le % de l'IA est haut.
    const dangerScore = edgeDist < 3 ? -(3 - edgeDist) * (8 + ai.pct * 0.15) : 0;
    const crateBonus = ctx.state.crate && ctx.state.crate.landed && dist2(pos, ctx.state.crate.pos) < 1.5 ? 30 : 0;

    candidates.push({
      id: `move_${candidateId++}`, desc: 'Move to a safer spot.',
      pos, weaponIdx: -1, yawDeg: 0, pitchDeg: 0, power: 0, score: dangerScore + crateBonus,
    });

    const origin: Vec3 = [pos[0], pos[1] + SHOT_ORIGIN_HEIGHT, pos[2]];
    const toT: [number, number] = [target.pos[0] - pos[0], target.pos[2] - pos[2]];
    const dist = Math.hypot(toT[0], toT[1]) || 1;
    const baseYaw = Math.atan2(toT[0], toT[1]) * (180 / Math.PI);

    for (let wIdx = 0; wIdx < ai.weapons.length; wIdx++) {
      const weapon = ai.weapons[wIdx];
      if (weapon.cooldown > 0) continue;
      if (weapon.category === 'shield') {
        candidates.push({
          id: `atk_${candidateId++}`, desc: `Raise ${weapon.name} for cover.`,
          pos, weaponIdx: wIdx, yawDeg: baseYaw, pitchDeg: 0, power: 0.5,
          score: dangerScore + crateBonus + 10 + target.pct * 0.05,
        });
        continue;
      }
      const grenade = weapon.category === 'grenade';
      const yaws = grenade ? [baseYaw] : [baseYaw - 4, baseYaw, baseYaw + 4];
      const powers = grenade
        ? [Math.max(0, Math.min(1, (dist - GRENADE_RANGE_MIN) / GRENADE_RANGE_SPAN))]
        : [0.6, 1];
      for (const yaw of yaws) {
        for (const power of powers) {
          const yr = (yaw * Math.PI) / 180;
          const dirVec: Vec3 = [Math.sin(yr), 0, Math.cos(yr)];
          const traj = predictTrajectory(ctx, aiId, weapon, origin, dirVec, power, null);
          let score = dangerScore + crateBonus;
          const lands = grenade
            ? Math.hypot(traj.impact[0] - target.pos[0], traj.impact[2] - target.pos[2]) <= traj.splashRadius + 0.4
            : traj.hitPlayer === target.id;
          if (lands) {
            const mods = { charge: power };
            const dmg = previewDamage(ctx, aiId, weapon, mods);
            score += dmg * 2;
            // Éjection : distance en l'air estimée vs distance au bord dans l'axe du coup.
            const speed = previewLaunchSpeed(ctx, target.id, weapon, dmg, mods);
            const from = grenade ? traj.impact : origin;
            const kx = target.pos[0] - from[0], kz = target.pos[2] - from[2];
            const kl = Math.hypot(kx, kz) || 1;
            const edge = distToEdgeAlong(ctx, target.pos, [kx / kl, kz / kl]);
            if (flatAirDistance(speed) > edge + LEDGE_GRAB_DIST) score += 60;
          }
          candidates.push({
            id: `atk_${candidateId++}`, desc: `Use ${weapon.name} aimed at the target.`,
            pos, weaponIdx: wIdx, yawDeg: yaw, pitchDeg: 0, power, score,
          });
        }
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}
