// Photo d'une personne → combattant (lots LP puis LFACE) : attributs Gemini + portrait Nano Banana Pro (grosse tête).
// Cache en mémoire par photo, délai maximum 25 s, puis secours. Rien n'est écrit sur disque.
import type { Accessory, FighterDef, ModelId, Trait } from '../../core/types';
import { postJson } from '../fetch-json';
import { isDataUrl, toResizedJpegBase64 } from '../image';

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

/** Délai maximum côté joueur (plan/lots/LFACE) : au-delà, perso de secours. */
const SCAN_FIGHTER_TIMEOUT_MS = 25_000;

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
  timings?: { textMs: number; imageMs: number };
}

/** Ce qui a coincé, pour un message clair à l'écran (null = tout va bien). */
export type FighterScanIssue = null | 'no-face' | 'no-portrait' | 'blocked' | 'timeout';

export interface FighterScanReport {
  fighter: FighterDef;
  issue: FighterScanIssue;
  /** Temps mesurés (ms) : préparation de la photo, aller-retour serveur, et côté serveur texte / portrait. */
  ms: { resize: number; total: number; text?: number; image?: number };
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

async function scanner(base64: string, mimeType: string, resizeMs: number): Promise<FighterScanReport> {
  const t0 = performance.now();
  const raw = await postJson<ScanFighterApiResult>('/api/scan-fighter', { imageBase64: base64, mimeType }, SCAN_FIGHTER_TIMEOUT_MS);
  const total = Math.round(performance.now() - t0);
  const ms = { resize: resizeMs, total, text: raw?.timings?.textMs, image: raw?.timings?.imageMs };
  if (!raw) return { fighter: FALLBACK_FIGHTER, issue: total >= SCAN_FIGHTER_TIMEOUT_MS - 50 ? 'timeout' : 'no-portrait', ms };
  if (raw.faceFound === false && !raw.faceUrl) return { fighter: FALLBACK_FIGHTER, issue: 'no-face', ms };
  const fighter: FighterDef = {
    id: makeId(),
    name: raw.nickname || 'Mystery Bro',
    model: modelePour(raw),
    hpMax: raw.stats?.hpMax ?? 100,
    power: raw.stats?.power ?? 3,
    agility: raw.stats?.agility ?? 3,
    trait: raw.trait,
    catchphrase: raw.catchphrase,
    portraitUrl: raw.faceUrl,
    look: {
      primary: raw.outfitPrimary,
      secondary: raw.outfitSecondary,
      hair: raw.hairColor,
      accessory: raw.accessory !== 'none' ? raw.accessory : undefined,
      faceUrl: raw.faceUrl,
    },
  };
  let issue: FighterScanIssue = null;
  if (!raw.faceUrl) issue = raw.imageReason === 'IMAGE_SAFETY' ? 'blocked' : raw.imageReason === 'TIMEOUT' ? 'timeout' : 'no-portrait';
  return { fighter, issue, ms };
}

/** Photo → combattant avec le compte rendu (problème éventuel, temps mesurés). Ne rejette jamais. */
export async function scanFighterReport(image: Blob | string): Promise<FighterScanReport> {
  if (typeof image === 'string' && !isDataUrl(image)) return { fighter: FALLBACK_FIGHTER, issue: 'no-face', ms: { resize: 0, total: 0 } };
  try {
    const t0 = performance.now();
    const { base64, mimeType } = await toResizedJpegBase64(image);
    const resize = Math.round(performance.now() - t0);
    const cle = empreinte(base64);
    let p = cache.get(cle);
    if (!p) {
      p = scanner(base64, mimeType, resize);
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
