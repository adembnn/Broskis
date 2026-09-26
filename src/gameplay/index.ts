// Gameplay temps réel (lot RTCORE, plan/PIVOT-TEMPS-REEL.md ; règles v2 façon Smash du lot LSMASH). Ce fichier
// n'assemble QUE les sous-modules et fixe l'ordre des systèmes de chaque image :
// entrées + contrôle + armes (40) → gravité/chutes (50) → vols d'éjection (60) → projectiles (65) → physique (100).
import type { Install } from '../core/types';
import { installBro } from './bro';
import { stepCombat, stepShields } from './combat';
import { installControls, pollInputs } from './controls';
import { install as installCrate, stepCrate } from './crate';
import { installFallbackGround } from './fallback-ground';
import { install as installHooks } from './hooks';
import { stepLaunches } from './launch';
import { stepBodies, stepPlayerControl } from './movement';
import { stepMatchClock } from './phases';
import { stepProjectiles } from './projectiles';
import { installSelftest } from './selftest';
import { installStocks } from './stocks';
import { installDebugColliders } from './debug-colliders';
import { install as installAI } from './ai/index';

export const install: Install = (ctx) => {
  installFallbackGround(ctx);
  installDebugColliders(ctx);
  installStocks();
  installBro(ctx);
  installControls();
  installCrate(ctx);
  installHooks(ctx);
  installSelftest(ctx);
  installAI(ctx); // bot au tour par tour : inactif en temps réel (il sera refait)

  ctx.loop.addSystem('gameplay-input', (dt) => {
    stepMatchClock(ctx, dt);
    const inputs = pollInputs();
    for (const p of [0, 1] as const) {
      stepPlayerControl(ctx, p, inputs[p], dt);
      stepCombat(ctx, p, inputs[p], dt);
    }
    stepShields(ctx);
    stepCrate(ctx);
  }, 40);
  ctx.loop.addSystem('gameplay-bodies', (dt) => stepBodies(ctx, dt), 50);
  ctx.loop.addSystem('gameplay-launch', (dt) => stepLaunches(ctx, dt), 60);
  ctx.loop.addSystem('gameplay-projectiles', (dt) => stepProjectiles(ctx, dt), 65);
};
