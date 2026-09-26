// Lot LW (partie Scandex) — magasin de collection. S'abonne à `scan:result` sur le bus et garde chaque arme
// scannée dans localStorage, dédupliquée par l'objet réel photographié (Weapon.object, normalisé), pas par
// Weapon.id (qui change à chaque nouveau scan du même objet). Écriture/lecture toujours défensives : le Scandex
// doit s'afficher (vide) même si localStorage est indisponible (navigation privée, quota).
import type { Ctx, Weapon } from '../../core/types';

const STORAGE_KEY = 'broskis:scandex';

export interface ScandexEntry {
  weapon: Weapon;
  /** Date (Date.now()) de la première capture de cet objet réel. */
  firstCapturedAt: number;
}

type ScandexData = Record<string, ScandexEntry>;

/** Identité de collection : l'objet réel scanné, pas l'id de l'arme (qui change à chaque scan). */
function normalizeKey(object: string): string {
  return object.trim().toLowerCase();
}

function safeRead(): ScandexData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as ScandexData;
    return {};
  } catch {
    return {};
  }
}

function safeWrite(data: ScandexData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Navigation privée, quota dépassé… le jeu continue, seule la persistance est perdue.
  }
}

// Chargé paresseusement une seule fois par session ; toute écriture met aussi à jour ce cache.
let cache: ScandexData | null = null;
function load(): ScandexData {
  if (!cache) cache = safeRead();
  return cache;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Abonnement pour rafraîchir un écran ouvert quand une nouvelle entrée arrive. Retourne le désabonnement. */
export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (e) {
      console.error('[scandex] listener', e);
    }
  }
}

/** Toutes les entrées, triées par ordre de découverte. */
export function getAll(): ScandexEntry[] {
  return Object.values(load()).sort((a, b) => a.firstCapturedAt - b.firstCapturedAt);
}

export function has(objectKey: string): boolean {
  return normalizeKey(objectKey) in load();
}

/** Ajoute l'arme si son objet réel est inédit. Retourne true si une nouvelle entrée a bien été créée. */
export function add(weapon: Weapon): boolean {
  const key = normalizeKey(weapon.object);
  if (!key) return false;
  const data = load();
  if (data[key]) return false;
  data[key] = { weapon, firstCapturedAt: Date.now() };
  cache = data;
  safeWrite(data);
  notify();
  return true;
}

// Armes effectivement ajoutées à la collection depuis le dernier `match:start` (remis à zéro à chaque nouveau match).
let sinceMatchStart: Weapon[] = [];

/** Arme nouvellement collectionnées pendant le match en cours (ou le dernier match terminé). */
export function getNewSinceMatchStart(): Weapon[] {
  return [...sinceMatchStart];
}

/** Branche le Scandex sur le bus (une fois, dans src/ui/index.ts). Retourne le désabonnement. */
export function installScandexCollector(ctx: Ctx): () => void {
  const offScan = ctx.bus.on('scan:result', ({ weapon }) => {
    if (add(weapon)) sinceMatchStart.push(weapon);
  });
  const offStart = ctx.bus.on('match:start', () => {
    sinceMatchStart = [];
  });
  return () => {
    offScan();
    offStart();
  };
}
