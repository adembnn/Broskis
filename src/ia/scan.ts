// scanObject : photo -> arme jouable (lot LI, plan/lots/LI-pipeline-ia.md). Signature figée par le stub L0
// (src/ia/index.ts) : ne pas la changer, LG et LU l'appellent déjà.
// JSON et sticker partent EN PARALLÈLE. La promesse se résout dès que le JSON arrive ; le sticker complète
// `stickerUrl` plus tard et redéclenche `scan:result` une seconde fois sur le bus (scène 3D, interface).
// Lot LSCAN : le sticker est partagé par photo (changer de catégorie ne redessine rien), le JSON a droit à une
// relance et à 9 s au total (au lieu d'un repli silencieux à 4 s qui collait un nain de jardin sur la photo
// d'un mug), et chaque arme de secours porte une note (`scanNote`) pour que l'interface explique pourquoi.
import type { Category, PlayerId, Weapon } from '../core/types';
import { createRng } from '../core/rng';
import { getCached, hashImage, setCached } from './cache';
import { ENDPOINTS, TIMEOUTS } from './config';
import { loadDemoFallback, loadDemoObject } from './demo-cache';
import { postJson } from './fetch-json';
import { isDataUrl, toResizedJpegBase64 } from './image';
import { findPresetByObjectName, pickPreset } from './presets';
import { activePlayer, getRuntimeCtx } from './runtime';
import {
  clampCategory,
  clampLines,
  clampObject,
  clampPalette,
  clampStats,
  clampTrait,
  clampWeaponName,
  clampWhy,
} from './sanitize';

export interface ScanOptions {
  category?: Category;
  player?: PlayerId;
}

/** Pourquoi une arme n'est pas la lecture directe de la photo (affiché sur la carte, lot LSCAN). */
export type ScanNote = 'offline' | 'substituted';

interface ScanObjectApiResult {
  object: string;
  weaponName: string;
  category: string;
  why: string;
  stats: { a: number; b: number; c: number };
  trait: string;
  palette: string[];
  lines: { intro: string; hit: string; miss: string; parried: string };
  /** Le serveur a remplacé l'objet (vraie arme, personne seule) par une arme de secours. */
  substituted?: boolean;
}

interface StickerApiResult {
  dataUrl: string | null;
  reason?: string | null;
}

let counter = 0;
function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Seed déterministe à partir d'un texte : deux appels avec le même objectKey donnent la même arme de secours. */
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const notes = new Map<string, ScanNote>();

/** Note d'une arme rendue par scanObject (ou d'un de ses clones `<id>-p0-1`). */
export function scanNote(weaponId: string): ScanNote | undefined {
  for (const [id, note] of notes) if (weaponId === id || weaponId.startsWith(`${id}-`)) return note;
  return undefined;
}

/** Chronologie des scans photo (débogage et tools/lscan) : window.__scans. */
interface ScanTiming {
  id: string;
  object?: string;
  note?: ScanNote;
  json?: number;
  sticker?: number | 'failed';
  tries: number;
}
const timings: ScanTiming[] = [];
if (typeof window !== 'undefined') (window as unknown as { __scans: ScanTiming[] }).__scans = timings;

function emitScanResult(player: PlayerId | undefined, weapon: Weapon): void {
  const ctx = getRuntimeCtx();
  if (!ctx) return;
  ctx.bus.emit('scan:result', { player: player ?? activePlayer(), weapon });
}

/** Étape réelle d'un scan photo, pour l'affichage « en direct » (lot LUX). */
function emitScanProgress(player: PlayerId | undefined, step: 'reading' | 'stats' | 'sticker' | 'sticker-failed', weaponId?: string): void {
  const ctx = getRuntimeCtx();
  if (!ctx) return;
  ctx.bus.emit('scan:progress', { player: player ?? activePlayer(), step, weaponId });
}

function fromApiResult(raw: ScanObjectApiResult | null | undefined, forcedCategory: Category | undefined): Weapon {
  const category = clampCategory(raw?.category, forcedCategory);
  return {
    id: makeId('scan'),
    object: clampObject(raw?.object),
    name: clampWeaponName(raw?.weaponName),
    category,
    why: clampWhy(raw?.why),
    stats: clampStats(raw?.stats),
    trait: clampTrait(raw?.trait, category.length),
    palette: clampPalette(raw?.palette),
    lines: clampLines(raw?.lines),
    source: 'scan',
    cooldown: 0,
  };
}

/** Un objet déjà connu (nom tapé au clavier par un agent de test, ou clé de démo) : tout se résout en local. */
async function resolveByKey(key: string, opts: ScanOptions): Promise<Weapon> {
  const cached = getCached(key);
  if (cached) return cached;

  const ctx = getRuntimeCtx();
  const demo = ctx?.demo ? await loadDemoObject(key) : null;
  if (demo) {
    const weapon: Weapon = { ...demo, id: makeId('cache'), source: 'cache' };
    setCached(key, weapon);
    return weapon;
  }

  // Le nom tapé correspond pile à un objet de la banque (ex. tests manuels) : on le renvoie tel quel
  // plutôt qu'un tirage pseudo-aléatoire, plus prévisible pour qui teste au clavier.
  const exact = findPresetByObjectName(key);
  const weapon = exact ? { ...exact, id: makeId('preset') } : pickPreset(createRng(seedFromString(key)), opts.category);
  setCached(key, weapon);
  return weapon;
}

/**
 * Un vrai sticker a un fond magenta tout autour ; un raté du modèle (toute la scène redessinée, gens compris,
 * vu en test sur une photo webcam avec une foule derrière) n'en a presque pas. Lecture du pourtour en 64 px.
 */
async function looksLikeSticker(dataUrl: string): Promise<boolean> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = 64;
    const h = Math.max(8, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return true;
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let border = 0;
    let magenta = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > 1 && x < w - 2 && y > 1 && y < h - 2) continue;
        const i = (y * w + x) * 4;
        border++;
        if (Math.hypot(d[i] - 255, d[i + 1], d[i + 2] - 255) / 441.7 < 0.4) magenta++; // même tolérance que le détourage
      }
    }
    return magenta / border > 0.6;
  } catch {
    return true; // image illisible ici : le détourage tranchera
  }
}

/** Un seul sticker par photo : relancer en catégorie imposée réutilise le dessin en cours (ou fini). Un dessin
 *  raté (pas de fond magenta) est redemandé une fois s'il reste le temps d'un second essai (~10 s). */
const stickerByImage = new Map<string, Promise<string | null>>();
function stickerFor(imgKey: string, imageBase64: string, mimeType: string): Promise<string | null> {
  let p = stickerByImage.get(imgKey);
  if (!p) {
    p = (async () => {
      const t0 = performance.now();
      for (let tries = 0; tries < 2; tries++) {
        const left = TIMEOUTS.sticker - (performance.now() - t0);
        if (tries && left < 9000) break;
        const r = await postJson<StickerApiResult>(ENDPOINTS.sticker, { imageBase64, mimeType }, left);
        if (r?.dataUrl && (await looksLikeSticker(r.dataUrl))) return r.dataUrl;
        if (r?.reason === 'IMAGE_SAFETY') break; // refus du modèle : redemander ne changera rien
      }
      return null;
    })();
    stickerByImage.set(imgKey, p);
    void p.then((url) => {
      if (!url) stickerByImage.delete(imgKey); // échec : une nouvelle tentative redemandera
    });
  }
  return p;
}

/** JSON de l'objet : une relance si le premier appel échoue vite, jamais plus de TIMEOUTS.scan au total. */
async function scanJson(body: object, timing: ScanTiming): Promise<ScanObjectApiResult | null> {
  const t0 = performance.now();
  for (;;) {
    timing.tries += 1;
    const left = TIMEOUTS.scan - (performance.now() - t0);
    const raw = await postJson<ScanObjectApiResult>(ENDPOINTS.scanObject, body, left);
    if (raw || timing.tries >= 2 || TIMEOUTS.scan - (performance.now() - t0) < 1500) return raw;
  }
}

/** Démo (?demo=1) sans réseau : les objets de demo/OBJETS.md dans l'ordre du script, puis la banque. */
let demoFallbackIndex = 0;
async function offlineWeapon(imgKey: string, category: Category | undefined): Promise<Weapon> {
  const ctx = getRuntimeCtx();
  if (ctx?.demo) {
    const demo = await loadDemoFallback(demoFallbackIndex++);
    if (demo && (!category || demo.category === category)) return { ...demo, id: makeId('cache'), source: 'cache' };
    return pickPreset(createRng(seedFromString(imgKey)), category);
  }
  return pickPreset(Math.random, category);
}

/**
 * Photo d'un objet → arme (stats JSON + sticker). `image` est soit un Blob/une data URL (vraie photo),
 * soit une chaîne « clé » (nom d'objet, ex. via window.gameHooks.scan('rubber duck')) résolue en local
 * sans réseau — pratique pour les agents de test et la régie de démo.
 */
export async function scanObject(image: Blob | string, opts: ScanOptions = {}): Promise<Weapon> {
  if (typeof image === 'string' && !isDataUrl(image)) {
    const weapon = await resolveByKey(image, opts);
    emitScanResult(opts.player, weapon);
    return weapon;
  }

  const { base64, mimeType } = await toResizedJpegBase64(image);
  const imgKey = hashImage(base64);
  const jsonKey = `${imgKey}:${opts.category ?? 'auto'}`; // une catégorie imposée = une autre arme
  const cached = getCached(jsonKey);
  if (cached) {
    emitScanResult(opts.player, cached);
    return cached;
  }

  const t0 = performance.now();
  const timing: ScanTiming = { id: '', tries: 0 };
  timings.push(timing);
  emitScanProgress(opts.player, 'reading');
  const stickerPromise = stickerFor(imgKey, base64, mimeType);
  const raw = await scanJson({ imageBase64: base64, mimeType, category: opts.category }, timing);

  let weapon: Weapon;
  let note: ScanNote | undefined;
  if (!raw) {
    weapon = await offlineWeapon(imgKey, opts.category);
    note = 'offline';
  } else if (raw.substituted) {
    // Vraie arme ou personne seule : l'arme de secours garde SON sticker (celui de la photo montrerait l'original).
    weapon = pickPreset(Math.random, opts.category);
    note = 'substituted';
  } else {
    weapon = fromApiResult(raw, opts.category);
    // Même objet déjà scanné (autre photo, répétition) : son sticker s'affiche tout de suite.
    const known = getCached(weapon.object);
    if (known?.stickerUrl && known.source === 'scan') weapon.stickerUrl = known.stickerUrl;
  }
  if (note) notes.set(weapon.id, note);
  timing.id = weapon.id;
  timing.object = weapon.object;
  timing.note = note;
  timing.json = Math.round(performance.now() - t0);

  if (!note) {
    setCached(jsonKey, weapon);
    setCached(weapon.object, weapon);
  }
  emitScanProgress(opts.player, 'stats', weapon.id);
  emitScanResult(opts.player, weapon);

  // Le sticker de la photo ne vaut que pour une vraie lecture de la photo (pas pour une arme de secours).
  if (note || weapon.stickerUrl) {
    if (note && !weapon.stickerUrl) emitScanProgress(opts.player, 'sticker-failed', weapon.id);
    return weapon;
  }
  stickerPromise
    .then((url) => {
      timing.sticker = url ? Math.round(performance.now() - t0) : 'failed';
      if (!url) {
        emitScanProgress(opts.player, 'sticker-failed', weapon.id);
        return;
      }
      weapon.stickerUrl = url;
      setCached(jsonKey, weapon);
      setCached(weapon.object, weapon);
      emitScanProgress(opts.player, 'sticker', weapon.id);
      emitScanResult(opts.player, weapon);
    })
    .catch(() => {
      /* le sticker est un bonus visuel : une scène de secours (lot LS) existe déjà sans lui */
      timing.sticker = 'failed';
      emitScanProgress(opts.player, 'sticker-failed', weapon.id);
    });

  return weapon;
}
