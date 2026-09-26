// Lot LG · Gameplay (règles v2 façon Smash : lot LSMASH). Ce fichier n'assemble QUE les sous-modules ;
// toute la logique vit dans les modules voisins (chacun < 300 lignes, un rôle par fichier).
import type { Install } from '../core/types';
import { install as installAim } from './aim';
import { installAutofire } from './autofire';
import { installBro } from './bro';
import { install as installCrate } from './crate';
import { installDamageSystems } from './damage';
import { installFallbackGround } from './fallback-ground';
import { install as installHooks } from './hooks';
import { install as installMovement } from './movement';
import { install as installParry } from './parry';
import { installSelftest } from './selftest';
import { installStocks } from './stocks';
import { install as installAI } from './ai/index';

export const install: Install = (ctx) => {
  installFallbackGround(ctx);
  installDamageSystems(ctx);
  installStocks(ctx);
  installBro(ctx);
  installParry(ctx);
  installMovement(ctx);
  installAim(ctx);
  installAutofire(ctx);
  installCrate(ctx);
  installHooks(ctx);
  installSelftest(ctx);
  installAI(ctx);
};
