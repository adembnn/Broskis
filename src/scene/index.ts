// Lot LA — Rendu, persos, caméra, effets (plan/lots/LA-scene-camera.md). Assemble les sous-modules de
// src/scene/** (sauf maps/, sticker/, fighter-custom/ : lots séparés). Chaque sous-module expose une seule
// fonction d'installation ; ce fichier ne fait qu'assembler, dans l'ordre du contrat : rendu → persos →
// caméra → aides de visée → anneau de déplacement → effets.
import { installAimHelpers } from './aim';
import { installCamera } from './camera';
import { installFighters } from './fighters';
import { installFx } from './fx';
import { installMovementRing } from './movementRing';
import { installEnvironment } from './render/environment';
import { installPostFx } from './render/postfx';
import { installParryFx } from './parry-fx';
import type { Install } from '../core/types';

export const install: Install = (ctx) => {
  installEnvironment(ctx);
  installPostFx(ctx);
  installFighters(ctx);
  installCamera(ctx);
  installAimHelpers(ctx);
  installMovementRing(ctx);
  installFx(ctx);
  installParryFx(ctx);
};
