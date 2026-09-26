// Mode démo (?demo=1) : graine fixe, IA lue en cache, régie au clavier F1–F5 + F9 (panique).
// La régie ne fait qu'émettre `demo:cue` ; chaque lot décide de ce que fait sa touche (voir plan/lots/LD-demo-video.md).
import type { Bus } from './bus';
import type { EventMap } from './events';

export const DEMO_SEED = 1234;

export function isDemo(): boolean {
  return new URLSearchParams(location.search).get('demo') === '1';
}

const KEYS = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F9']);

export function installDemoKeys(bus: Bus) {
  window.addEventListener('keydown', (e) => {
    if (!KEYS.has(e.key)) return;
    e.preventDefault(); // F5 rechargerait la page en pleine démo
    bus.emit('demo:cue', { key: e.key as EventMap['demo:cue']['key'] });
  });
}
