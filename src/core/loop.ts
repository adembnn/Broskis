// Boucle de jeu (reprise de bagarre-de-taverne/src/core/loop.js) : temps de jeu, minuteries, ralentis nommés, systèmes ordonnés.
//   loop.later(s, fn) / loop.wait(s)   minuterie en temps de JEU (ralentie par le bullet time)
//   loop.tick(fn(dt) -> boolean)       appelée chaque frame tant qu'elle renvoie true
//   loop.tween(dur, fn(k))             interpolation 0→1, promesse résolue à la fin
//   loop.setSlow(key, f) / clearSlow   ralentis nommés, le plus fort l'emporte
//   loop.addSystem(name, fn, order)    système appelé chaque frame (order croissant ; le rendu est à 1000)
//   loop.hitstop = s                   gel du gameplay en secondes réelles (le rendu continue)
// Hooks de test : window.__fast (multiplicateur de dt). Plafond ~60 i/s (voir frame), ?fps=max pour l'enlever.
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

declare global { interface Window { __fast?: number; __perfSys?: Record<string, number>; __perfTick?: (t: number) => void } }

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

  // Plafond ~60 i/s (portables des jurés : moins de chauffe, et autant de GPU pour tenir 60) : sur un écran à
  // 120/144 Hz on ne traite qu'une image d'écran sur 2 (72 i/s à 144 Hz), à 240 Hz une sur 4. La période de
  // l'écran est estimée en continu (10e centile des intervalles de requestAnimationFrame). ?fps=max : sans plafond.
  const plafond = new URLSearchParams(location.search).get('fps') !== 'max';
  const intervalles: number[] = [];
  let periode = 1000 / 60;
  let dernierRaf = 0;
  let dernierTraite = 0;

  const clock = new THREE.Clock();
  function frame(t: number) {
    if (plafond) {
      if (dernierRaf) {
        intervalles.push(t - dernierRaf);
        if (intervalles.length >= 60) {
          intervalles.sort((a, b) => a - b);
          periode = Math.max(2, intervalles[6]);
          intervalles.length = 0;
        }
      }
      dernierRaf = t;
      const saut = Math.max(1, Math.floor(1000 / 60 / periode + 0.05));
      if (saut > 1 && t - dernierTraite < (saut - 0.5) * periode) { requestAnimationFrame(frame); return; }
      dernierTraite = t;
    }
    window.__perfTick?.(t); // banc tools/perf : images réellement traitées
    const real = Math.min(clock.getDelta(), 0.05) * (window.__fast || 1);
    loop.realTime += real;
    let dt = real * loop.timeScale;
    if (loop.hitstop > 0) { loop.hitstop -= real; dt = 0; }
    loop.time += dt;

    // Banc tools/perf : ms cumulées et pire frame par système (window.__perfSys absent en jeu normal).
    const prof = window.__perfSys;
    let t0 = prof ? performance.now() : 0;
    const note = (nom: string) => {
      if (!prof) return;
      const t = performance.now(); const d = t - t0; t0 = t;
      prof[nom] = (prof[nom] ?? 0) + d;
      prof[`${nom} (pire)`] = Math.max(prof[`${nom} (pire)`] ?? 0, d);
    };

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
    note('minuteries+tweens');
    for (const s of systems) {
      try { s.fn(dt, real); } catch (e) { console.error(`[system ${s.name}]`, e); }
      note(s.name);
    }
    requestAnimationFrame(frame);
  }
  return loop;
}
