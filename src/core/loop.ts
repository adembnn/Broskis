// Boucle de jeu (reprise de bagarre-de-taverne/src/core/loop.js) : temps de jeu, minuteries, ralentis nommés, systèmes ordonnés.
//   loop.later(s, fn) / loop.wait(s)   minuterie en temps de JEU (ralentie par le bullet time)
//   loop.tick(fn(dt) -> boolean)       appelée chaque frame tant qu'elle renvoie true
//   loop.tween(dur, fn(k))             interpolation 0→1, promesse résolue à la fin
//   loop.setSlow(key, f) / clearSlow   ralentis nommés, le plus fort l'emporte
//   loop.addSystem(name, fn, order)    système appelé chaque frame (order croissant ; le rendu est à 1000)
//   loop.hitstop = s                   gel du gameplay en secondes réelles (le rendu continue)
// Hooks de test : window.__fast (multiplicateur de dt).
import * as THREE from 'three';
import type { Bus } from './bus';

type System = { name: string; fn: (dt: number, real: number) => void; order: number };

export interface Loop {
  time: number;
  realTime: number;
  hitstop: number;
  timeScale: number;
  later(s: number, fn: () => void): void;
  wait(s: number): Promise<void>;
  tick(fn: (dt: number) => boolean): void;
  tween(dur: number, fn: (k: number) => void): Promise<void>;
  setSlow(key: string, factor: number): void;
  clearSlow(key: string): void;
  addSystem(name: string, fn: (dt: number, real: number) => void, order?: number): void;
  start(): void;
}

declare global { interface Window { __fast?: number } }

export function createLoop(bus: Bus): Loop {
  const timers: { at: number; fn: () => void }[] = [];
  const tickers: ((dt: number) => boolean)[] = [];
  const systems: System[] = [];
  const slows = new Map<string, number>();
  let slowId = 0;

  const rescale = () => {
    let k = 1;
    for (const f of slows.values()) k = Math.min(k, f);
    loop.timeScale = k;
  };

  const loop: Loop = {
    time: 0,
    realTime: 0,
    hitstop: 0,
    timeScale: 1,
    later(s, fn) { timers.push({ at: loop.time + s, fn }); },
    wait(s) { return new Promise((r) => loop.later(s, r)); },
    tick(fn) { tickers.push(fn); },
    tween(dur, fn) {
      return new Promise((resolve) => {
        let t = 0;
        loop.tick((dt) => {
          t += dt;
          const k = Math.min(1, t / dur);
          fn(k);
          if (k >= 1) { resolve(); return false; }
          return true;
        });
      });
    },
    setSlow(key, factor) { slows.set(key, factor); rescale(); },
    clearSlow(key) { slows.delete(key); rescale(); },
    addSystem(name, fn, order = 0) {
      systems.push({ name, fn, order });
      systems.sort((a, b) => a.order - b.order);
    },
    start() { requestAnimationFrame(frame); },
  };

  // Demande de ralenti par événement : { factor, ms } en temps réel.
  bus.on('slowmo', ({ factor, ms }) => {
    const key = `slowmo-${slowId++}`;
    loop.setSlow(key, factor);
    setTimeout(() => loop.clearSlow(key), ms);
  });
  bus.clock = () => loop.time;

  const clock = new THREE.Clock();
  function frame() {
    const real = Math.min(clock.getDelta(), 0.05) * (window.__fast || 1);
    loop.realTime += real;
    let dt = real * loop.timeScale;
    if (loop.hitstop > 0) { loop.hitstop -= real; dt = 0; }
    loop.time += dt;

    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= loop.time) {
        const t = timers.splice(i, 1)[0];
        try { t.fn(); } catch (e) { console.error(e); }
      }
    }
    for (let i = tickers.length - 1; i >= 0; i--) {
      if (dt <= 0) break;
      let keep = false;
      try { keep = tickers[i](dt); } catch (e) { console.error(e); }
      if (!keep) tickers.splice(i, 1);
    }
    for (const s of systems) {
      try { s.fn(dt, real); } catch (e) { console.error(`[system ${s.name}]`, e); }
    }
    requestAnimationFrame(frame);
  }
  return loop;
}
