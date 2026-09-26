// Cache par nom d'objet (lot LI) : évite de rescanner le même objet deux fois pendant les répétitions.
// Mémoire (Map, instantané) + localStorage (survit au rechargement de la page). Jamais de throw : un
// cache cassé ne doit pas empêcher un scan.
import type { Weapon } from '../core/types';

const LS_KEY = 'broskis:ia:scan-cache:v1';
const MAX_ENTRIES = 64;

const mem = new Map<string, Weapon>();
let loaded = false;

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Petite empreinte non cryptographique : assez pour détecter « même photo » d'une répétition à l'autre. */
export function hashImage(base64: string): string {
  let h = 0;
  const step = Math.max(1, Math.floor(base64.length / 2000)); // échantillonne, la chaîne peut être longue
  for (let i = 0; i < base64.length; i += step) h = (h * 31 + base64.charCodeAt(i)) | 0;
  return `img:${h}:${base64.length}`;
}

function loadFromLocalStorage() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, Weapon>;
    for (const [k, v] of Object.entries(obj)) mem.set(k, v);
  } catch {
    // localStorage indisponible (navigation privée, quota...) : le cache reste juste en mémoire.
  }
}

function persist() {
  try {
    const obj: Record<string, Weapon> = {};
    let i = 0;
    // on ne garde que les plus récentes (Map conserve l'ordre d'insertion)
    const entries = [...mem.entries()].slice(-MAX_ENTRIES);
    // Un sticker en data URL pèse 1 à 2 Mo : il ferait déborder localStorage (5 Mo) et tout le cache avec.
    // Il reste en mémoire pour la session ; seul un chemin de fichier (/demo-cache/...) est sauvegardé.
    for (const [k, v] of entries) {
      obj[k] = v.stickerUrl?.startsWith('data:') ? { ...v, stickerUrl: undefined } : v;
      i++;
    }
    if (i) localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {
    // quota dépassé ou stockage désactivé : tant pis, le cache mémoire suffit pour cette session.
  }
}

export function getCached(key: string): Weapon | undefined {
  loadFromLocalStorage();
  return mem.get(normalizeKey(key));
}

export function setCached(key: string, weapon: Weapon): void {
  loadFromLocalStorage();
  mem.set(normalizeKey(key), weapon);
  if (mem.size > MAX_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
  persist();
}
