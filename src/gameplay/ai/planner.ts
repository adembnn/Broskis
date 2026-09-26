import type { Ctx, PlayerId, Vec3 } from '../../core/types';
import { predictTrajectory } from '../trajectory';
import { computeDamage, computeKnockbackMagnitude } from '../damage';

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

function normalize(v: Vec3): Vec3 {
  const d = Math.hypot(v[0], v[1], v[2]);
  if (d < 0.0001) return [0, 0, 1];
  return [v[0] / d, v[1] / d, v[2] / d];
}

export function planMoves(ctx: Ctx, aiId: PlayerId): AICandidate[] {
  const ai = ctx.state.players[aiId];
  if (!ai.alive) return [];
  const target = ctx.state.players[aiId === 0 ? 1 : 0];
  
  const budget = ai.moveLeft;
  const candidates: AICandidate[] = [];
  
  // 1. Generate positions
  const posCandidates: Vec3[] = [ai.pos]; // Current pos
  // Circle around
  const numAngles = 8;
  for (let i = 0; i < numAngles; i++) {
    const angle = (i / numAngles) * Math.PI * 2;
    for (const r of [budget / 2, budget]) {
      const p: Vec3 = [ai.pos[0] + Math.cos(angle) * r, ai.pos[1], ai.pos[2] + Math.sin(angle) * r];
      posCandidates.push(p);
    }
  }
  
  if (ctx.state.crate && !ctx.state.crate.landed && ctx.state.crate.landsInTurns <= 2) {
    // Try to get near the crate
    const d = dist2(ai.pos, ctx.state.crate.pos);
    if (d <= budget) {
      posCandidates.push([ctx.state.crate.pos[0], ai.pos[1], ctx.state.crate.pos[2]]);
    }
  }

  // 2. Generate actions for each position
  let candidateId = 0;
  for (const pos of posCandidates) {
    const isEdge = Math.hypot(pos[0], pos[2]) > 15; // rough edge heuristic
    const dangerScore = isEdge ? -20 : 0; // Penalize being near edge
    
    let crateBonus = 0;
    if (ctx.state.crate) {
      const dCrate = dist2(pos, ctx.state.crate.pos);
      if (dCrate < 2) crateBonus = 30;
    }

    // Default action (just move)
    candidates.push({
      id: `move_${candidateId++}`,
      desc: `Move to safe spot.`,
      pos, weaponIdx: -1, yawDeg: 0, pitchDeg: 0, power: 0,
      score: dangerScore + crateBonus
    });

    for (let wIdx = 0; wIdx < ai.weapons.length; wIdx++) {
      const weapon = ai.weapons[wIdx];
      if (weapon.cooldown > 0) continue; // Not ready
      
      const dirToTarget = normalize([target.pos[0] - pos[0], 0, target.pos[2] - pos[2]]);
      const baseYaw = Math.atan2(dirToTarget[0], dirToTarget[2]) * (180 / Math.PI);
      
      // Some angles and powers
      const pitches = weapon.category === 'grenade' ? [30, 45, 60] : [0, 10];
      const yaws = [baseYaw - 15, baseYaw, baseYaw + 15];
      const powers = [0.5, 1.0];
      
      for (const pitch of pitches) {
        for (const yaw of yaws) {
          for (const power of powers) {
            const yawRad = yaw * Math.PI / 180;
            const pitchRad = pitch * Math.PI / 180;
            const dirVec: Vec3 = [
              Math.sin(yawRad) * Math.cos(pitchRad),
              Math.sin(pitchRad),
              Math.cos(yawRad) * Math.cos(pitchRad)
            ];
            
            const traj = predictTrajectory(ctx, aiId, weapon, pos, dirVec, power);
            
            let score = dangerScore + crateBonus;
            
            // Expected damage
            if (traj.hitPlayer === target.id || (weapon.category === 'grenade' && dist2(traj.impact, target.pos) < traj.splashRadius)) {
              const baseDmg = computeDamage(ctx, aiId, weapon).damage; // rough avg
              score += baseDmg * 2;
              
              // Ejection chance
              const kb = computeKnockbackMagnitude(ctx, target.id, weapon, baseDmg);
              const kbDir = normalize([target.pos[0] - traj.impact[0], 0, target.pos[2] - traj.impact[2]]);
              const pushPos: Vec3 = [target.pos[0] + kbDir[0] * kb * 0.1, target.pos[1], target.pos[2] + kbDir[2] * kb * 0.1];
              if (Math.hypot(pushPos[0], pushPos[2]) > 18) {
                score += 50; // high chance of ringout
              }
            } else if (weapon.category === 'shield') {
              score += 15; // cover
            }
            
            candidates.push({
              id: `atk_${candidateId++}`,
              desc: `Use ${weapon.name} aimed at target.`,
              pos, weaponIdx: wIdx, yawDeg: yaw, pitchDeg: pitch, power,
              score
            });
          }
        }
      }
    }
  }
  
  return candidates.sort((a, b) => b.score - a.score);
}
