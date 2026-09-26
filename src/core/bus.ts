// Bus d'événements typé (repris de bagarre-de-taverne/src/core/events.js). Les modules s'écoutent au lieu de s'appeler.
import type { EventMap, EventName } from './events';

type Handler<K extends EventName> = (payload: EventMap[K]) => void;
type AnyHandler = (name: EventName, payload: unknown) => void;

export interface Bus {
  on<K extends EventName>(name: K, fn: Handler<K>): () => void;
  once<K extends EventName>(name: K, fn: Handler<K>): () => void;
  off<K extends EventName>(name: K, fn: Handler<K>): void;
  emit<K extends EventName>(name: K, payload: EventMap[K]): void;
  onAny(fn: AnyHandler): () => void;
  /** 60 derniers événements, pour le débogage et les agents de test. */
  history: { name: EventName; t: number }[];
  clock: (() => number) | null;
}

export function createBus(): Bus {
  const handlers = new Map<EventName, Set<Handler<EventName>>>();
  const anyHandlers = new Set<AnyHandler>();
  const bus: Bus = {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(fn as Handler<EventName>);
      return () => bus.off(name, fn);
    },
    once(name, fn) {
      const off = bus.on(name, (p) => { off(); fn(p); });
      return off;
    },
    off(name, fn) { handlers.get(name)?.delete(fn as Handler<EventName>); },
    emit(name, payload) {
      bus.history.push({ name, t: bus.clock ? +bus.clock().toFixed(2) : 0 });
      if (bus.history.length > 60) bus.history.shift();
      const set = handlers.get(name);
      if (set) for (const fn of [...set]) {
        try { fn(payload); } catch (e) { console.error(`[bus] ${name}`, e); }
      }
      for (const fn of [...anyHandlers]) {
        try { fn(name, payload); } catch (e) { console.error('[bus] *', e); }
      }
    },
    onAny(fn) { anyHandlers.add(fn); return () => anyHandlers.delete(fn); },
    history: [],
    clock: null,
  };
  return bus;
}
