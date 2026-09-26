import type { Ctx } from '../../core/types';
import { planMoves } from './planner';
import { showTauntBubble } from './taunt-bubble';
import { snapshot } from '../../core/state';

const FALLBACK_TAUNTS = [
  "You're not ready for this!",
  "Too easy!",
  "Is that all you got?",
  "Watch and learn!",
  "Your percent is climbing!",
  "Next stop: off the edge!",
];

export function installBrain(ctx: Ctx) {
  ctx.bus.on('phase:change', (evt) => {
    if (evt.to === 'move' && ctx.state.vsAI && ctx.state.active === 1) {
      setTimeout(() => playTurn(ctx), 100);
    }
  });
}

async function playTurn(ctx: Ctx) {
  const aiId = 1;
  const ai = ctx.state.players[aiId];
  if (!ai.alive) return;
  
  // 1. Planifier les coups
  const candidates = planMoves(ctx, aiId);
  const topMoves = candidates.slice(0, 3);
  
  if (topMoves.length === 0) {
    // End turn fallback
    ctx.hooks.pickWeapon(0);
    setTimeout(() => { ctx.hooks.aim(0, 0); ctx.hooks.fire(0); }, 500);
    return;
  }
  
  // 2. Demander à Gemini
  let choice = 0;
  let taunt = FALLBACK_TAUNTS[Math.floor(Math.random() * FALLBACK_TAUNTS.length)];
  
  try {
    const summary = JSON.stringify(snapshot(ctx.state));
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);
    
    // Check if we are running in browser context. In tool test it might fail if the server is not ready.
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    
    const res = await fetch(`${baseUrl}/api/ai-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stateSummary: summary,
        topMoves: topMoves.map((m) => ({ id: m.id, desc: m.desc, score: Math.round(m.score) }))
      }),
      signal: controller.signal
    });
    
    clearTimeout(id);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.choice === 'number' && data.choice >= 0 && data.choice < topMoves.length) {
        choice = data.choice;
      }
      if (typeof data.taunt === 'string') {
        taunt = data.taunt;
      }
    }
  } catch (err) {
    // Timeout or network error, fallback silently
  }
  
  const move = topMoves[choice];
  
  // 3. Exécuter
  showTauntBubble(ctx, aiId, taunt);
  
  // Wait 0.5s for taunt to be readable before moving
  await new Promise(r => setTimeout(r, 500));
  
  // Déplacement
  const dx = move.pos[0] - ai.pos[0];
  const dz = move.pos[2] - ai.pos[2];
  
  if (Math.hypot(dx, dz) > 0.1) {
    ctx.hooks.move(dx, dz);
    // Rough estimate of travel time
    const dist = Math.hypot(dx, dz);
    await new Promise(r => setTimeout(r, dist * 200)); 
  }
  
  if (move.weaponIdx === -1) {
    // Pass turn (maybe just fire power 0 to end)
    ctx.hooks.pickWeapon(0);
    await new Promise(r => setTimeout(r, 100));
    ctx.hooks.aim(0, 0);
    await new Promise(r => setTimeout(r, 800));
    ctx.hooks.fire(0);
    return;
  }
  
  // Selection arme
  ctx.hooks.pickWeapon(move.weaponIdx);
  await new Promise(r => setTimeout(r, 200));
  
  // Visée pendant 0.8s (la trajectoire s'affiche)
  ctx.hooks.aim(move.yawDeg, move.pitchDeg);
  await new Promise(r => setTimeout(r, 800));
  
  // Tir
  ctx.hooks.fire(move.power);
}
