// Lot LI — pipeline IA et serveur. Remplace le stub du lot L0 : signatures inchangées (LG et LU les
// appellent déjà). Voir plan/lots/LI-pipeline-ia.md et le skill ia-en-jeu.
//
// Lot LVOX (une seule voix, 26/09 14h20) : cette installation faisait parler l'animateur (Gemini + Gradium)
// sur hit / parry:result / ko / crate:grab / match:start, EN PLUS des barks pré-générés de src/audio/barks.ts
// sur les mêmes événements — deux voix d'animateur qui se chevauchaient à chaque coup. Ces cinq say() sont
// retirés (déjà couverts par les barks) ; seule reste la révélation d'une arme scannée en plein match
// (Caisse Snap), le seul moment propre à une arme qui n'est pas un bark générique.
import type { Ctx, Install, PlayerId } from '../core/types';
import { sayScanReveal } from './commentary';
import { scanObject } from './scan';
import { setRuntimeCtx } from './runtime';

export type { ScanOptions } from './scan';
export { scanObject } from './scan';
export { prepareCommentary } from './commentary';

/**
 * Le sticker Nano Banana arrive en retard (jusqu'à 25 s, voir TIMEOUTS.sticker) : souvent APRÈS que le
 * joueur ait confirmé son arsenal. Or `screenArsenal.assign()` clone l'arme au moment du clic (id suffixé
 * `-p<joueur>-<slot>`) et `applyPicksToState` la clone encore au lancement du match — deux copies qui ne
 * partagent plus la référence mutée par `scanObject` (scan.ts:147). Sans ce correctif, le sticker généré
 * n'atteint jamais la main du perso : la scène retombe silencieusement sur `makeFallbackSticker` pour tout
 * le match, même si l'IA a fini son travail à temps. On repère les clones par préfixe d'id et on patche
 * `stickerUrl` en place ; si l'arme est équipée en ce moment (match en cours), on réémet `weapon:pick`
 * (index inchangé) pour que src/scene/fighters/index.ts réattache le vrai sticker sur-le-champ.
 */
function patchLateSticker(ctx: Ctx, sourceId: string, stickerUrl: string): void {
  for (const player of [0, 1] as PlayerId[]) {
    const ps = ctx.state.players[player];
    ps.weapons.forEach((w, index) => {
      if (w.stickerUrl || w.id === sourceId) return;
      if (!w.id.startsWith(`${sourceId}-p`)) return;
      w.stickerUrl = stickerUrl;
      if (ps.selected === index) ctx.bus.emit('weapon:pick', { player, index });
    });
  }
}

export const install: Install = (ctx) => {
  setRuntimeCtx(ctx);

  // Caisse Snap en plein match : la nouvelle arme est révélée à voix haute par l'animateur (Gemini TTS
  // Fenrir) ; sayScanReveal filtre elle-même les scans qui ont lieu pendant la constitution de l'arsenal
  // initial (déjà couverts par la pesée, weigh_in — voir prepareCommentary).
  ctx.bus.on('scan:result', ({ weapon }) => {
    void sayScanReveal(ctx, weapon);
    if (weapon.stickerUrl) patchLateSticker(ctx, weapon.id, weapon.stickerUrl);
  });

  // window.gameHooks.scan(objectKey) : personne d'autre ne le branche (LG énumère les siens sans lui,
  // voir plan/lots/LG-gameplay.md) — c'est le pont de test headless vers le pipeline IA.
  ctx.hooks.scan = (objectKey: string) => {
    ctx.bus.emit('scan:start', { player: ctx.state.active, source: 'cache' });
    scanObject(objectKey, { player: ctx.state.active }).catch((e) => console.error('[ia] scan', e));
  };

  // window.gameHooks.scanObjectFromUrl(url) : pont de test headless pour le VRAI parcours photo -> arme
  // (lot LSCAN-OBJ). Récupère l'image (fichier public/, data URL...) en Blob et repasse par scanObject,
  // donc par le réseau (api/scan-object + api/sticker) comme une vraie photo webcam/import le ferait.
  ctx.hooks.scanObjectFromUrl = async (url, opts = {}) => {
    ctx.bus.emit('scan:start', { player: opts.player ?? ctx.state.active, source: 'upload' });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`scanObjectFromUrl: fetch ${url} failed (${res.status})`);
    const blob = await res.blob();
    return scanObject(blob, { category: opts.category, player: opts.player ?? ctx.state.active });
  };
};
