// Boucle de jeu : temps de jeu (ctx.time), minuteries, tickers, ralentis cumulables, systèmes ordonnés.
//
// Extension :
//   ctx.later(s, fn) / ctx.wait(s)  : minuterie en temps de JEU (ralentie par le bullet time)
//   ctx.tick(fn(dt) -> bool)         : fonction appelée chaque frame tant qu'elle renvoie true
//   ctx.tween(dur, fn(k))            : interpolation 0→1, promesse résolue à la fin
//   ctx.setSlow(key, factor) / ctx.clearSlow(key) : ralentis nommés, le plus fort l'emporte
//   ctx.addSystem(name, fn(dt, real), order) : système appelé chaque frame (order croissant)
//   ctx.hitstop = s                  : gel du gameplay (le rendu continue)
// Hooks de test : window.__fast (multiplicateur de dt), window.__freezeAt (fige ctx.time).
import * as THREE from 'three';

export function installLoop(ctx) {
  const timers = [];
  const tickers = [];
  const systems = [];
  const slows = new Map();
  ctx.time = 0;
  ctx.realTime = 0;
  ctx.hitstop = 0;
  ctx.timeScale = 1;

  ctx.later = (s, fn) => { timers.push({ at: ctx.time + s, fn }); };
  ctx.wait = (s) => new Promise((r) => ctx.later(s, r));
  ctx.tick = (fn) => { tickers.push(fn); };
  ctx.tween = (dur, fn) => new Promise((resolve) => {
    let t = 0;
    ctx.tick((dt) => { t += dt; const k = Math.min(1, t / dur); fn(k); if (k >= 1) { resolve(); return false; } return true; });
  });
  const rescale = () => { let k = 1; for (const f of slows.values()) k = Math.min(k, f); ctx.timeScale = k; };
  ctx.setSlow = (key, factor) => {
    const had = slows.get(key);
    slows.set(key, factor);
    rescale();
    if (had !== factor) ctx.events.emit('time:slow', { key, factor, on: true });
  };
  ctx.clearSlow = (key) => {
    if (!slows.has(key)) return;
    slows.delete(key);
    rescale();
    ctx.events.emit('time:slow', { key, on: false });
  };
  ctx.slows = slows;
  ctx.addSystem = (name, fn, order = 0) => {
    systems.push({ name, fn, order });
    systems.sort((a, b) => a.order - b.order);
  };
  ctx.events.clock = () => ctx.time;

  const clock = new THREE.Clock();
  function frame() {
    const real = Math.min(clock.getDelta(), 0.05) * (window.__fast || 1);
    ctx.realTime += real;
    rescale();
    let dt = real * ctx.timeScale;
    if (ctx.hitstop > 0) { ctx.hitstop -= real; dt = 0; }
    if (window.__freezeAt != null) dt = Math.max(0, Math.min(dt, window.__freezeAt - ctx.time));
    ctx.time += dt;

    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= ctx.time) {
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
  ctx.startLoop = () => requestAnimationFrame(frame);
}
