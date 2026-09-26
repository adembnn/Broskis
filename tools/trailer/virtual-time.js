// Horloge virtuelle injectée AVANT tout script de la page (page.addInitScript) par tools/trailer/render.mjs.
// Tant que la page charge, le temps est réel. Dès que `__vt.freeze()` est appelé, le temps ne bouge plus
// que quand le rendu le demande (`await __vt.step(ms)`) : minuteries, requestAnimationFrame, performance.now,
// Date.now et animations CSS/Web Animations avancent exactement de `ms`. Résultat : chaque image est
// identique d'une prise à l'autre, même si le conteneur ne rend que 3 images par seconde en vrai.
(() => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCancelRAF = window.cancelAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);

  let frozen = false;
  let vNow = 0;
  let dateOffset = 0;
  let nextId = 1_000_000; // hors de la plage des identifiants natifs
  const timers = new Map(); // id -> { at, fn, args, every }
  let rafs = new Map(); // id -> callback
  const seen = new WeakSet(); // animations déjà mises sous contrôle

  performance.now = () => (frozen ? vNow : realNow());
  Date.now = () => (frozen ? Math.round(dateOffset + vNow) : realDateNow());

  window.requestAnimationFrame = (cb) => {
    if (!frozen) return realRAF(cb);
    const id = nextId++;
    rafs.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => { if (!rafs.delete(id)) realCancelRAF(id); };

  const addTimer = (fn, delay, args, every) => {
    const id = nextId++;
    const d = Math.max(0, Number(delay) || 0);
    timers.set(id, { at: vNow + d, fn, args, every: every ? Math.max(1, d) : null });
    return id;
  };
  window.setTimeout = (fn, delay, ...args) => (frozen && typeof fn === 'function' ? addTimer(fn, delay, args, false) : realSetTimeout(fn, delay, ...args));
  window.setInterval = (fn, delay, ...args) => (frozen && typeof fn === 'function' ? addTimer(fn, delay, args, true) : realSetInterval(fn, delay, ...args));
  window.clearTimeout = (id) => { if (!timers.delete(id)) realClearTimeout(id); };
  window.clearInterval = (id) => { if (!timers.delete(id)) realClearInterval(id); };

  const flush = () => new Promise((r) => realSetTimeout(r, 0));

  function runTimersUntil(target) {
    for (let guard = 0; guard < 10_000; guard++) {
      let nextKey = null;
      let next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next.at)) { nextKey = id; next = t; }
      if (!next) return;
      vNow = Math.max(vNow, next.at);
      if (next.every != null) next.at += next.every; else timers.delete(nextKey);
      try { next.fn(...next.args); } catch (e) { console.error(e); }
    }
  }

  function controlAnimations(ms) {
    for (const a of document.getAnimations()) {
      try {
        if (!seen.has(a)) { seen.add(a); a.pause(); continue; } // née pendant cette image : part de ~0
        if (a.playState === 'idle') continue;
        a.pause();
        a.currentTime = (Number(a.currentTime) || 0) + ms;
      } catch { /* animation détachée entre-temps */ }
    }
  }

  window.__vt = {
    get frozen() { return frozen; },
    get now() { return vNow; },
    realNow, // horloge réelle : attendre un vrai chargement (modèles, maps) pendant la préparation d'un plan
    freeze() {
      if (frozen) return;
      vNow = realNow();
      dateOffset = realDateNow() - vNow;
      frozen = true;
    },
    async step(ms) {
      if (!frozen) window.__vt.freeze();
      const target = vNow + ms;
      runTimersUntil(target);
      vNow = target;
      controlAnimations(ms);
      const cbs = rafs;
      rafs = new Map();
      for (const cb of cbs.values()) { try { cb(vNow); } catch (e) { console.error(e); } }
      await flush(); // laisse passer les promesses (chargements de textures, awaits du jeu)
      runTimersUntil(vNow); // minuteries à 0 ms posées par les rAF
      controlAnimations(0);
    },
  };
})();
