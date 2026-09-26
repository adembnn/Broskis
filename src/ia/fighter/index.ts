// Photo d'une personne → combattant (lots LP puis LFACE) : attributs Gemini + portrait Nano Banana Pro (grosse tête).
// Cache en mémoire par photo, délai maximum 25 s, puis secours. Rien n'est écrit sur disque.
import type { Accessory, FighterDef, ModelId, Trait } from '../../core/types';
import { postJson } from '../fetch-json';
import { isDataUrl, toResizedJpegBase64 } from '../image';
import { getRuntimeCtx } from '../runtime';

let counter = 0;
function makeId(): string {
  counter += 1;
  return `custom-fighter-${Date.now().toString(36)}-${counter.toString(36)}`;
}

const FALLBACK_FIGHTER: FighterDef = {
  id: 'stub-fighter',
  name: 'Mystery Bro',
  model: 'rogue_hooded',
  hpMax: 100,
  power: 5,
  agility: 5,
  catchphrase: 'Who, me?'
};

/** Délai maximum côté joueur (plan/lots/LFACE) : au-delà, l'écran se débloque avec la tête de secours. */
const SCAN_FIGHTER_TIMEOUT_MS = 25_000;
/** Lot LE2E : la requête du portrait n'est PAS abandonnée au délai d'écran (le serveur tente 2 modèles puis un repli,
 *  23 s chacun) ; un portrait tardif est posé sur le perso, même en plein match (`fighter:portrait`). */
const PORTRAIT_REQUEST_MS = 75_000;

/** Portrait arrivé après le délai d'écran : complète LE MÊME FighterDef (déjà dans l'état du match) et prévient la scène. */
function portraitTardif(fighter: FighterDef, faceUrl: string): void {
  fighter.portraitUrl = faceUrl;
  if (fighter.look) fighter.look.faceUrl = faceUrl;
  getRuntimeCtx()?.bus.emit('fighter:portrait', { fighterId: fighter.id, faceUrl });
}

interface ScanFighterApiResult {
  faceFound?: boolean;
  nickname: string;
  hairColor: string;
  skinColor?: string;
  hairStyle: string;
  outfitPrimary: string;
  outfitSecondary: string;
  accessory: Accessory;
  stats: { hpMax: number; power: number; agility: number };
  trait: Trait;
  catchphrase: string;
  faceUrl?: string;
  imageReason?: string | null;
  timings?: { textMs: number; imageMs: number; imageModel?: string };
}

/** Ce qui a coincé, pour un message clair à l'écran (null = tout va bien). */
export type FighterScanIssue = null | 'no-face' | 'no-portrait' | 'blocked' | 'timeout';

export interface FighterScanReport {
  fighter: FighterDef;
  issue: FighterScanIssue;
  /** Temps mesurés (ms) : préparation de la photo, aller-retour serveur, et côté serveur texte / portrait. */
  ms: { resize: number; total: number; text?: number; image?: number };
  /** Modèle qui a dessiné le portrait (Nano Banana Pro, ou Nano Banana 2 en secours rapide). */
  portraitModel?: string;
}

/** Message joueur (anglais) pour chaque problème. */
export const SCAN_ISSUE_TEXT: Record<Exclude<FighterScanIssue, null>, string> = {
  'no-face': "We couldn't find a face. Face the camera in good light and try again.",
  'no-portrait': "Your cartoon head didn't come out this time. Try again, or fight as is.",
  blocked: "That photo can't be used. Try another one.",
  timeout: 'The AI took too long. Try again, or fight as is.',
};

const cache = new Map<string, Promise<FighterScanReport>>();

/** Empreinte rapide (FNV-1a) d'une photo encodée : même photo = même combattant, sans nouvel appel. */
function empreinte(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

function modelePour(raw: ScanFighterApiResult): ModelId {
  if (raw.stats?.hpMax >= 110 || raw.trait === 'heavy') return 'barbarian';
  if (raw.stats?.agility >= 5 || raw.trait === 'slippery') return 'rogue_hooded';
  if (raw.trait === 'healing' || raw.trait === 'explosive') return 'mage';
  return 'knight';
}

/** Le texte arrive vers 3 s : au-delà de ce délai, on n'attend plus que le portrait. */
const TEXT_TIMEOUT_MS = 12_000;

interface PortraitApiResult { faceUrl?: string; imageReason?: string | null; timings?: { imageMs: number; imageModel?: string } }

function construire(raw: ScanFighterApiResult): FighterDef {
  return {
    id: makeId(),
    name: raw.nickname || 'Mystery Bro',
    model: modelePour(raw),
    hpMax: raw.stats?.hpMax ?? 100,
    power: raw.stats?.power ?? 3,
    agility: raw.stats?.agility ?? 3,
    trait: raw.trait,
    catchphrase: raw.catchphrase,
    look: {
      primary: raw.outfitPrimary,
      secondary: raw.outfitSecondary,
      hair: raw.hairColor,
      accessory: raw.accessory !== 'none' ? raw.accessory : undefined,
    },
  };
}

/** Réponse en 2 temps (recherche R3) : nom, stats et couleurs (~3 s, `onText`), puis le portrait (~9 s) qui
 * complète LE MÊME objet FighterDef (look.faceUrl, portraitUrl). */
async function scanner(base64: string, mimeType: string, resizeMs: number, onText?: (f: FighterDef) => void): Promise<FighterScanReport> {
  const t0 = performance.now();
  const corps = { imageBase64: base64, mimeType };
  const portraitP = postJson<PortraitApiResult>('/api/scan-fighter', { ...corps, part: 'portrait' }, PORTRAIT_REQUEST_MS);
  const raw = await postJson<ScanFighterApiResult>('/api/scan-fighter', { ...corps, part: 'text' }, TEXT_TIMEOUT_MS);
  const textMs = Math.round(performance.now() - t0);
  let fighter: FighterDef | null = raw && raw.faceFound !== false ? construire(raw) : null;
  if (fighter) onText?.(fighter);
  // L'écran n'attend pas plus que le délai joueur ; la requête, elle, continue (portrait tardif ci-dessous).
  let enRetard = false;
  const delai = new Promise<null>((r) => setTimeout(() => { enRetard = true; r(null); }, Math.max(0, SCAN_FIGHTER_TIMEOUT_MS - (performance.now() - t0))));
  const portrait = await Promise.race([portraitP, delai]);
  if (!portrait && enRetard && fighter) {
    const f = fighter;
    void portraitP.then((tard) => { if (tard?.faceUrl) portraitTardif(f, tard.faceUrl); });
  }
  const total = Math.round(performance.now() - t0);
  const ms = { resize: resizeMs, total, text: textMs, image: portrait?.timings?.imageMs };
  const faceUrl = portrait?.faceUrl;
  if (!fighter && raw && faceUrl) fighter = construire(raw); // « pas de visage » selon Gemini, mais un portrait quand même
  if (!fighter && faceUrl) fighter = { ...FALLBACK_FIGHTER, id: makeId(), look: { primary: '#3b6fd8', secondary: '#2b2b2b' } };
  if (!fighter) {
    const issue: FighterScanIssue = raw?.faceFound === false ? 'no-face' : total >= SCAN_FIGHTER_TIMEOUT_MS - 50 ? 'timeout' : 'no-portrait';
    return { fighter: FALLBACK_FIGHTER, issue, ms };
  }
  if (faceUrl) {
    await appliquerPortrait(fighter, faceUrl);
    return { fighter, issue: null, ms, portraitModel: portrait?.timings?.imageModel };
  }
  const reason = portrait?.imageReason;
  const issue: FighterScanIssue = !portrait ? 'timeout' : reason === 'IMAGE_SAFETY' ? 'blocked' : reason === 'TIMEOUT' ? 'timeout' : 'no-portrait';
  return { fighter, issue, ms };
}

/** Magenta du fond (tolérant au bruit JPEG) : même règle que src/scene/fighter-custom. */
const estFond = (r: number, g: number, b: number) => r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90;

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('planche illisible'));
    img.src = src;
  });
}

/** Planche Nano Banana (tête de face à gauche, même tête de dos à droite, fond magenta) → 2 images recadrées, fond
 * magenta gardé (les détourages en aval ne changent pas). Pas de séparation nette : tout va dans `front`. */
export async function decouperPlanche(url: string): Promise<{ front: string; back?: string }> {
  const img = await chargerImage(url);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (W < H * 1.3) return { front: url }; // portrait simple, pas une planche
  const k = Math.min(1, 400 / W);
  const w = Math.max(1, Math.round(W * k));
  const h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const cols = new Uint16Array(w);
  const plein = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (estFond(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) continue;
    plein[i] = 1;
    cols[i % w]++;
  }
  // Gouttière : la colonne la plus vide au milieu de l'image.
  let coupe = -1;
  for (let x = Math.round(w * 0.3); x <= Math.round(w * 0.7); x++) if (coupe < 0 || cols[x] < cols[coupe]) coupe = x;
  if (coupe < 0 || cols[coupe] > h * 0.02) return { front: url };
  const boite = (x0: number, x1: number) => {
    let minX = x1, maxX = x0, minY = h, maxY = -1, aire = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) {
      if (!plein[y * w + x]) continue;
      aire++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY, aire };
  };
  const a = boite(0, coupe);
  const b = boite(coupe, w);
  if (a.aire < w * h * 0.03 || b.aire < a.aire * 0.3) return { front: url };
  const recadrer = (r: { minX: number; maxX: number; minY: number; maxY: number }) => {
    const pad = Math.round(Math.max(r.maxX - r.minX, r.maxY - r.minY) * 0.04);
    const x0 = Math.max(0, (r.minX - pad) / k), y0 = Math.max(0, (r.minY - pad) / k);
    const x1 = Math.min(W, (r.maxX + 1 + pad) / k), y1 = Math.min(H, (r.maxY + 1 + pad) / k);
    const out = document.createElement('canvas');
    out.width = Math.round(x1 - x0);
    out.height = Math.round(y1 - y0);
    out.getContext('2d')!.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };
  return { front: recadrer(a), back: recadrer(b) };
}

/** Pose un portrait arrivé (planche face + dos) sur le combattant : UI (portraitUrl), tête de face et de dos. À appeler
 * aussi pour un portrait arrivé en retard, pour que les 2 faces arrivent ensemble. */
export async function appliquerPortrait(fighter: FighterDef, planche: string): Promise<void> {
  const { front, back } = await decouperPlanche(planche).catch(() => ({ front: planche, back: undefined }));
  fighter.portraitUrl = front;
  if (fighter.look) {
    fighter.look.backUrl = back;
    fighter.look.faceUrl = front;
  }
}

let prechauffe = false;
/** Charge le module serveur du scan avant la 1re photo (en dev, le 1er appel coûte jusqu'à 30 s de compilation). */
export function prechaufferScanFighter(): void {
  if (prechauffe) return;
  prechauffe = true;
  void fetch('/api/scan-fighter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
}

/** Photo → combattant avec le compte rendu (problème éventuel, temps mesurés). Ne rejette jamais.
 * `onText` : appelé dès que le nom et les couleurs sont connus, avant le portrait. */
export async function scanFighterReport(image: Blob | string, opts: { onText?: (f: FighterDef) => void } = {}): Promise<FighterScanReport> {
  if (typeof image === 'string' && !isDataUrl(image)) return { fighter: FALLBACK_FIGHTER, issue: 'no-face', ms: { resize: 0, total: 0 } };
  try {
    const t0 = performance.now();
    const { base64, mimeType } = await toResizedJpegBase64(image);
    const resize = Math.round(performance.now() - t0);
    const cle = empreinte(base64);
    let p = cache.get(cle);
    if (!p) {
      p = scanner(base64, mimeType, resize, opts.onText);
      cache.set(cle, p);
      // Un échec ne reste pas en cache : « Retry » avec la même photo relance vraiment l'IA.
      void p.then((r) => { if (r.issue) cache.delete(cle); });
    }
    return await p;
  } catch (err) {
    console.error('[scanFighter]', (err as Error)?.message ?? err);
    return { fighter: FALLBACK_FIGHTER, issue: 'no-portrait', ms: { resize: 0, total: 0 } };
  }
}

/** Photo d'une personne → combattant (attributs Gemini + grosse tête au portrait). Secours : perso prédéfini. */
export async function scanFighter(image: Blob | string): Promise<FighterDef> {
  return (await scanFighterReport(image)).fighter;
}
