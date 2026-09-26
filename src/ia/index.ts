// Lot LI — pipeline IA et serveur. Remplace le stub du lot L0 : signatures inchangées (LG et LU les
// appellent déjà). Voir plan/lots/LI-pipeline-ia.md et le skill ia-en-jeu.
import type { Install } from '../core/types';
import { primeWeapon, say, warmGenericBank } from './commentary';
import { scanObject } from './scan';
import { setRuntimeCtx } from './runtime';

export type { ScanOptions, ScanStep } from './scan';
export { scanObject } from './scan';
export { prepareCommentary, primeWeapon, say, warmGenericBank, weaponIntro } from './commentary';
export type { PreparedLine } from './commentary';

export const install: Install = (ctx) => {
  setRuntimeCtx(ctx);

  // L'animateur commente ces moments (les autres restent silencieux : « moments rares » selon le skill).
  ctx.bus.on('hit', (data) => say('hit', data));
  ctx.bus.on('parry:result', (data) => say('parry:result', data));
  ctx.bus.on('ko', (data) => say('ko', data));
  ctx.bus.on('crate:grab', (data) => say('crate:grab', data));
  ctx.bus.on('match:start', (data) => say('match:start', data));

  // Lot LLOAD : appels spéculatifs. Une arme scannée est vocalisée dès son arrivée (pas à la fin de l'arsenal),
  // et la banque générique de l'animateur part dès l'écran d'arsenal (Gemini Pro met 12 à 33 s).
  ctx.bus.on('scan:result', ({ weapon }) => { void primeWeapon(weapon); });
  ctx.bus.on('phase:change', ({ to }) => { if (to === 'arsenal') void warmGenericBank([]); });

  // window.gameHooks.scan(objectKey) : personne d'autre ne le branche (LG énumère les siens sans lui,
  // voir plan/lots/LG-gameplay.md) — c'est le pont de test headless vers le pipeline IA.
  ctx.hooks.scan = (objectKey: string) => {
    ctx.bus.emit('scan:start', { player: ctx.state.active, source: 'cache' });
    scanObject(objectKey, { player: ctx.state.active }).catch((e) => console.error('[ia] scan', e));
  };
};
