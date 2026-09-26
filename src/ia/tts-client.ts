// Vocalise une réplique via api/tts et la garde en mémoire (URL d'objet blob) : lot LI, appelé une seule
// fois par ligne pendant prepareCommentary, jamais en direct pendant un tour (skill ia-en-jeu : le direct
// est réservé aux moments rares).
// Concurrence bornée : les API de synthèse vocale tolèrent rarement un grand nombre d'appels simultanés
// (files d'attente, quotas) — un sémaphore global limite les requêtes réellement en vol, quel que soit le
// nombre d'appelants (prepareCommentary lance plusieurs dizaines de lignes en même temps).
import { ENDPOINTS, TIMEOUTS } from './config';
import { postForBytes } from './fetch-json';

const MAX_CACHED = 200;
const MAX_CONCURRENT = 2; // défensif : mieux vaut une file un peu plus lente qu'une rafale qui échoue
const MAX_ATTEMPTS = 3;

const memo = new Map<string, string>(); // "voix::texte" -> URL d'objet blob
let inFlight = 0;
const waiters: (() => void)[] = [];

function cacheKey(text: string, voiceId?: string): string {
  return `${voiceId ?? ''}::${text}`;
}

function evictIfNeeded() {
  while (memo.size > MAX_CACHED) {
    const oldestKey = memo.keys().next().value;
    if (!oldestKey) break;
    const url = memo.get(oldestKey);
    if (url) URL.revokeObjectURL(url);
    memo.delete(oldestKey);
  }
}

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight -= 1;
  const next = waiters.shift();
  if (next) next();
}

async function requestOnce(text: string, voiceId: string | undefined): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  await acquireSlot();
  try {
    return await postForBytes(ENDPOINTS.tts, { text, voiceId }, TIMEOUTS.tts);
  } finally {
    releaseSlot();
  }
}

/** Pose directement une URL jouable dans le cache (voix pré-enregistrée de la banque de secours), sans
 *  appeler le réseau : voir src/ia/presets.ts (voiceUrl de public/assets/presets/presets.json sur main). */
export function primeAudioUrl(text: string, url: string, voiceId?: string): void {
  memo.set(cacheKey(text, voiceId), url);
}

/** Renvoie une URL blob jouable, ou undefined si Gradium est injoignable/trop lent (jamais de throw). */
export async function synthesizeLine(text: string, voiceId?: string): Promise<string | undefined> {
  const key = cacheKey(text, voiceId);
  const cached = memo.get(key);
  if (cached) return cached;

  let result: { bytes: ArrayBuffer; contentType: string } | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !result; attempt++) {
    result = await requestOnce(text, voiceId);
  }
  if (!result) return undefined;

  const blob = new Blob([result.bytes], { type: result.contentType || 'audio/wav' });
  const url = URL.createObjectURL(blob);
  memo.set(key, url);
  evictIfNeeded();
  return url;
}

/** Vocalise plusieurs répliques « en parallèle » : le sémaphore global de synthesizeLine fait le vrai
 *  plafonnement, ceci ne fait que lancer tous les appels sans attendre les uns les autres. */
export async function synthesizeMany(texts: string[], voiceId?: string): Promise<(string | undefined)[]> {
  return Promise.all(texts.map((text) => synthesizeLine(text, voiceId)));
}
