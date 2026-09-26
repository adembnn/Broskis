// Lot LI — pipeline IA et serveur. Remplace le stub du lot L0 : signatures inchangées (LG et LU les
// appellent déjà). Voir plan/lots/LI-pipeline-ia.md et le skill ia-en-jeu.
//
// Lot LVOX (une seule voix, 26/09 14h20) : cette installation faisait parler l'animateur (Gemini + Gradium)
// sur hit / parry:result / ko / crate:grab / match:start, EN PLUS des barks pré-générés de src/audio/barks.ts
// sur les mêmes événements — deux voix d'animateur qui se chevauchaient à chaque coup. Ces cinq say() sont
// retirés (déjà couverts par les barks) ; seule reste la révélation d'une arme scannée en plein match
// (Caisse Snap), le seul moment propre à une arme qui n'est pas un bark générique.
import type { Install } from '../core/types';
import { sayScanReveal } from './commentary';
import { scanObject } from './scan';
import { setRuntimeCtx } from './runtime';

export type { ScanOptions } from './scan';
export { scanObject } from './scan';
export { prepareCommentary } from './commentary';

export const install: Install = (ctx) => {
  setRuntimeCtx(ctx);

  // Caisse Snap en plein match : la nouvelle arme est révélée à voix haute par l'animateur (Gemini TTS
  // Fenrir) ; sayScanReveal filtre elle-même les scans qui ont lieu pendant la constitution de l'arsenal
  // initial (déjà couverts par la pesée, weigh_in — voir prepareCommentary).
  ctx.bus.on('scan:result', ({ weapon }) => { void sayScanReveal(ctx, weapon); });

  // window.gameHooks.scan(objectKey) : personne d'autre ne le branche (LG énumère les siens sans lui,
  // voir plan/lots/LG-gameplay.md) — c'est le pont de test headless vers le pipeline IA.
  ctx.hooks.scan = (objectKey: string) => {
    ctx.bus.emit('scan:start', { player: ctx.state.active, source: 'cache' });
    scanObject(objectKey, { player: ctx.state.active }).catch((e) => console.error('[ia] scan', e));
  };
};
