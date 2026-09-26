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

export interface ScanOptions {
  category?: Category;
  player?: PlayerId;
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
  if (typeof image === 'string' && !isDataUrl(image)) {
    const weapon = await resolveByKey(image, opts);
    emitScanResult(opts.player, weapon);
    return weapon;
  }

  const { base64, mimeType } = await toResizedJpegBase64(image);
  const imgKey = hashImage(base64);
  const cached = getCached(imgKey);
  if (cached) {
    emitScanResult(opts.player, cached);
    return cached;
  }

  const stickerPromise = postJson<StickerApiResult>(
    ENDPOINTS.sticker,
    { imageBase64: base64, mimeType, category: opts.category },
    TIMEOUTS.sticker,
  );

  const raw = await postJson<ScanObjectApiResult>(
    ENDPOINTS.scanObject,
    { imageBase64: base64, mimeType, category: opts.category },
    TIMEOUTS.scan,
  );

  // Repli réseau coupé sur une VRAIE photo (pas une clé) : en ?demo=1 on tire quand même une arme
  // cohérente, mais avec un tirage stable par image (comme resolveByKey) plutôt que Math.random — une
  // répétition et le live avec la même photo/prop donnent la même arme de secours (règle CLAUDE.md
  // « ?demo=1 : graine aléatoire fixe »). Hors démo, Math.random reste très bien.
  const ctxForFallback = getRuntimeCtx();
  const fallbackRng = ctxForFallback?.demo ? createRng(seedFromString(imgKey)) : Math.random;
  const weapon = raw ? fromApiResult(raw, opts.category) : pickPreset(fallbackRng, opts.category);
  setCached(imgKey, weapon);
  setCached(weapon.object, weapon);
  emitScanResult(opts.player, weapon);

  stickerPromise
    .then((sticker) => {
      if (!sticker?.dataUrl) return;
      weapon.stickerUrl = sticker.dataUrl;
      setCached(imgKey, weapon);
      setCached(weapon.object, weapon);
      emitScanResult(opts.player, weapon);
    })
    .catch(() => {
      /* le sticker est un bonus visuel : une scène de secours (lot LS) existe déjà sans lui */
    });

  return weapon;
}
