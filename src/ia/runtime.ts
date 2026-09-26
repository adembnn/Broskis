// Petit état partagé du module IA : le Ctx capturé par install(ctx) (lot L0), relu par scan.ts et
// commentary.ts sans import circulaire avec index.ts.
import type { Ctx, PlayerId } from '../core/types';

let ctx: Ctx | null = null;

export function setRuntimeCtx(c: Ctx): void {
  ctx = c;
}

export function getRuntimeCtx(): Ctx | null {
  return ctx;
}

/** Joueur actif par défaut quand l'appelant ne précise pas explicitement qui a scanné/joué. */
export function activePlayer(fallback: PlayerId = 0): PlayerId {
  return ctx?.state.active ?? fallback;
}
