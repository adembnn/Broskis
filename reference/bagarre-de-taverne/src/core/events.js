// Bus d'événements minimal : on/once/off/emit. Chaque module s'y abonne au lieu de s'appeler directement.
// Noms d'événements : voir la liste en tête de src/main.js.
export function createEvents() {
  const map = new Map();
  const history = []; // 60 derniers événements (débogage, render_game_to_text)
  const api = {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => api.off(name, fn);
    },
    once(name, fn) {
      const off = api.on(name, (p) => { off(); fn(p); });
      return off;
    },
    off(name, fn) { map.get(name)?.delete(fn); },
    emit(name, payload = {}) {
      history.push({ name, t: api.clock ? +api.clock().toFixed(2) : 0 });
      if (history.length > 60) history.shift();
      const set = map.get(name);
      if (set) for (const fn of [...set]) {
        try { fn(payload); } catch (e) { console.error(`[events] ${name}`, e); }
      }
      const all = map.get('*');
      if (all) for (const fn of [...all]) { try { fn(name, payload); } catch (e) { console.error('[events] *', e); } }
    },
    history,
    clock: null,
  };
  return api;
}
