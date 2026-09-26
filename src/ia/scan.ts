// scanObject : photo -> arme jouable (lot LI, plan/lots/LI-pipeline-ia.md). Signature figée par le stub L0
// (src/ia/index.ts) : ne pas la changer, LG et LU l'appellent déjà.
// JSON et sticker partent EN PARALLÈLE. La promesse se résout dès que le JSON arrive (ou bascule sur la
// banque de secours à 2,5 s) ; le sticker complète `stickerUrl` plus tard et redéclenche `scan:result`
// une seconde fois sur le bus pour quiconque écoute (scène 3D, interface).
import type { Category, PlayerId, Weapon } from '../core/types';
import { createRng } from '../core/rng';
import { getCached, hashImage, setCached } from './cache';
import { ENDPOINTS, TIMEOUTS } from './config';
import { loadDemoObject } from './demo-cache';
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

/**
 * Étapes réelles d'un scan (lot LLOAD), pour une progression honnête à l'écran :
 * 'reading' photo envoyée (stats + sticker partis en parallèle) · 'partial' champs du JSON arrivés au fil de l'eau
 * · 'stats' arme complète · 'sticker' dessin arrivé · 'sticker-failed' pas de dessin (forme de secours).
 */
export type ScanStep = 'reading' | 'partial' | 'stats' | 'sticker' | 'sticker-failed';

export interface ScanOptions {
  category?: Category;
  player?: PlayerId;
  /** Appelé à chaque étape réelle ; `weapon` est partiel pour 'partial', complet ensuite. Ne doit pas jeter. */
  onProgress?: (step: ScanStep, weapon?: Partial<Weapon>) => void;
}

interface ScanObjectApiResult {
  object: string;
  weaponName: string;
  category: string;
  why: string;
  stats: { a: number; b: number; c: number };
  trait: string;
  palette: string[];
  lines: { intro: string; hit: string; miss: string; parried: string };
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

function emitScanResult(player: PlayerId | undefined, weapon: Weapon): void {
  const ctx = getRuntimeCtx();
  if (!ctx) return;
  ctx.bus.emit('scan:result', { player: player ?? activePlayer(), weapon });
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
 * Photo d'un objet → arme (stats JSON + sticker). `image` est soit un Blob/une data URL (vraie photo),
 * soit une chaîne « clé » (nom d'objet, ex. via window.gameHooks.scan('rubber duck')) résolue en local
 * sans réseau — pratique pour les agents de test et la régie de démo.
 */
export async function scanObject(image: Blob | string, opts: ScanOptions = {}): Promise<Weapon> {
  const progress = (step: ScanStep, w?: Partial<Weapon>) => {
    try { opts.onProgress?.(step, w); } catch (e) { console.error('[ia] onProgress', e); }
  };
  const finishKnown = (weapon: Weapon) => {
    emitScanResult(opts.player, weapon);
    progress('stats', weapon);
    progress(weapon.stickerUrl ? 'sticker' : 'sticker-failed', weapon);
    return weapon;
  };

  if (typeof image === 'string' && !isDataUrl(image)) {
    progress('reading');
    return finishKnown(await resolveByKey(image, opts));
  }

  const { base64, mimeType } = await toResizedJpegBase64(image);
  const imgKey = hashImage(base64);
  const cached = getCached(imgKey);
  if (cached) return finishKnown(cached);

  // Les deux appels partent dès que la photo est prête, en parallèle (le sticker n'attend jamais les stats).
  const stickerPromise = postJson<StickerApiResult>(
    ENDPOINTS.sticker,
    { imageBase64: base64, mimeType, category: opts.category },
    TIMEOUTS.sticker,
  );
  progress('reading');

  const raw = await fetchStats(base64, mimeType, opts.category, (partial) => progress('partial', partial));

  const weapon = raw ? fromApiResult(raw, opts.category) : pickPreset(Math.random, opts.category);
  setCached(imgKey, weapon);
  setCached(weapon.object, weapon);
  emitScanResult(opts.player, weapon);
  progress('stats', weapon);

  stickerPromise
    .then((sticker) => {
      if (!sticker?.dataUrl) { progress('sticker-failed', weapon); return; }
      weapon.stickerUrl = sticker.dataUrl;
      setCached(imgKey, weapon);
      setCached(weapon.object, weapon);
      emitScanResult(opts.player, weapon);
      progress('sticker', weapon);
    })
    .catch(() => {
      /* le sticker est un bonus visuel : une scène de secours (lot LS) existe déjà sans lui */
      progress('sticker-failed', weapon);
    });

  return weapon;
}

/** Stats JSON de l'arme. `onPartial` reçoit les champs déjà lisibles quand le serveur les envoie au fil de l'eau. */
async function fetchStats(
  base64: string,
  mimeType: string,
  category: Category | undefined,
  onPartial: (w: Partial<Weapon>) => void,
): Promise<ScanObjectApiResult | null> {
  void onPartial;
  return postJson<ScanObjectApiResult>(ENDPOINTS.scanObject, { imageBase64: base64, mimeType, category }, TIMEOUTS.scan);
}
