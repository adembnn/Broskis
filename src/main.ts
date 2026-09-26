// Point d'entrée : il ne fait qu'assembler. Chaque dossier est un lot (plan/lots/) qui exporte install(ctx).
import './style.css';
import { install as installAudio } from './audio';
import { createCtx } from './core/ctx';
import { installPreload } from './core/preload';
import { install as installGameplay } from './gameplay';
import { install as installMapEvents } from './gameplay/map-events';
import { install as installIa } from './ia';
import { install as installScene } from './scene';
import { install as installMaps } from './scene/maps';
import { install as installUi } from './ui';
import type { Install } from './core/types';

const MODULES: [string, Install][] = [
  ['scene', installScene],
  ['maps', installMaps],
  ['map-events', installMapEvents],
  ['gameplay', installGameplay],
  ['ia', installIa],
  ['audio', installAudio],
  ['ui', installUi],
  ['preload', installPreload], // lot LLOAD : charge persos et maps pendant les menus
];

function showBootError(err: unknown) {
  const el = document.querySelector<HTMLElement>('#bootError');
  if (!el) return;
  el.hidden = false;
  el.textContent = `Game error: ${String((err as Error)?.stack ?? err).slice(0, 500)}`;
}
window.addEventListener('error', (e) => showBootError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showBootError(e.reason));

async function boot() {
  const ctx = await createCtx(document.querySelector<HTMLElement>('#app')!);
  for (const [name, install] of MODULES) {
    try { await install(ctx); } catch (e) { console.error(`[install ${name}]`, e); showBootError(e); }
  }
  ctx.loop.start();
}

boot().catch(showBootError);
