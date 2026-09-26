// Mode trailer (`?trailer=60` ou `?trailer=15`) : ne charge rien tant que ce paramètre est absent.
// Pilotage par tools/trailer/render.mjs (rendu image par image) ; détail du montage : demo/TRAILER.md.
import type { Install } from '../core/types';

export const install: Install = async (ctx) => {
  const params = new URLSearchParams(location.search);
  const cut = params.get('trailer');
  if (!cut) return;
  const { startTrailer } = await import('./director');
  await startTrailer(ctx, {
    cut,
    fps: Number(params.get('fps')) || 30,
    shots: params.get('shots'),
  });
};
