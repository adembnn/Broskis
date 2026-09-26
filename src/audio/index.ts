// Lot LV · Audio : bruitages synthétisés, musique de fond, voix de l'animateur, touche M pour couper le son.
// Voir plan/lots/LV-audio.md. Rien ici ne dépend d'un fichier son : tout est synthétisé en WebAudio
// (repris de reference/bagarre-de-taverne/src/audio.js) pour que le build reste léger et sans asset.
import type { Install } from '../core/types';
import { installCommentary } from './commentary';
import { AudioEngine } from './engine';
import { installMusic } from './music';
import { installSfx } from './sfx';
import { installParryCues } from './parry-cues';

export const install: Install = (ctx) => {
  const engine = new AudioEngine(ctx.rng);

  // Les navigateurs bloquent l'audio tant qu'il n'y a pas eu de geste utilisateur : on démarre le
  // contexte au premier clic/touche, une seule fois (AudioEngine.start() est idempotent).
  const unlock = () => engine.start();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  installSfx(ctx.bus, engine);
  const music = installMusic(ctx.bus, engine, () => ctx.state);
  const commentary = installCommentary(ctx.bus, engine, music);
  installParryCues(ctx.bus, engine);

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'm' && e.key !== 'M') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const muted = engine.toggleMuted();
    commentary.setMuted(muted);
  });
};
