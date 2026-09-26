// Vocalise une réplique via api/tts et la garde en mémoire (URL d'objet blob) : lot LI, appelé une seule
// fois par ligne pendant prepareCommentary, jamais en direct pendant un tour (skill ia-en-jeu : le direct
// est réservé aux moments rares).
// Concurrence bornée : les API de synthèse vocale tolèrent rarement un grand nombre d'appels simultanés
// (files d'attente, quotas) — un sémaphore global limite les requêtes réellement en vol, quel que soit le
// nombre d'appelants (prepareCommentary lance plusieurs dizaines de lignes en même temps).
// Lot LLOAD : la file est triée par priorité (la réplique qu'on va entendre passe devant la banque de fond) et
// un même texte demandé deux fois ne part qu'une fois.
import { ENDPOINTS, TIMEOUTS } from './config';
import { postForBytes } from './fetch-json';

const MAX_CACHED = 200;
const MAX_CONCURRENT = 2; // défensif : mieux vaut une file un peu plus lente qu'une rafale qui échoue
const MAX_ATTEMPTS = 3;

/** Plus grand = plus urgent. `now` : la carte est à l'écran ; `background` : banque préparée d'avance. */
export const TTS_PRIORITY = { now: 30, soon: 20, normal: 10, background: 0 } as const;

const memo = new Map<string, string>(); // "voix::texte" -> URL d'objet blob
const pending = new Map<string, Promise<string | undefined>>(); // "voix::texte" -> appel en cours
let inFlight = 0;
interface Waiter { key: string; priority: number; resolve: () => void }
const waiters: Waiter[] = [];

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

async function acquireSlot(key: string, priority: number): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return;
  }
  // La place est transmise directement par releaseSlot : inFlight ne redescend pas entre les deux.
  await new Promise<void>((resolve) => {
    waiters.push({ key, priority, resolve });
    waiters.sort((a, b) => b.priority - a.priority);
  });
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next.resolve();
  else inFlight -= 1;
}

/** Remonte dans la file une réplique déjà demandée en fond et maintenant attendue à l'écran. */
function bump(key: string, priority: number): void {
  const w = waiters.find((x) => x.key === key);
  if (w && w.priority < priority) {
    w.priority = priority;
    waiters.sort((a, b) => b.priority - a.priority);
  }
}

async function requestOnce(key: string, text: string, voiceId: string | undefined, priority: number): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  await acquireSlot(key, priority);
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

/** URL déjà prête, sans aucun appel réseau (undefined sinon). */
export function cachedLine(text: string, voiceId?: string): string | undefined {
  return memo.get(cacheKey(text, voiceId));
}

/** Renvoie une URL blob jouable, ou undefined si Gradium est injoignable/trop lent (jamais de throw). */
export async function synthesizeLine(text: string, voiceId?: string, priority: number = TTS_PRIORITY.normal): Promise<string | undefined> {
  const key = cacheKey(text, voiceId);
  const cached = memo.get(key);
  if (cached) return cached;
  const inflight = pending.get(key);
  if (inflight) {
    bump(key, priority);
    return inflight;
  }

  const job = (async () => {
    let result: { bytes: ArrayBuffer; contentType: string } | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !result; attempt++) {
      result = await requestOnce(key, text, voiceId, priority);
    }
    if (!result) return undefined;
    const blob = new Blob([result.bytes], { type: result.contentType || 'audio/wav' });
    const url = URL.createObjectURL(blob);
    memo.set(key, url);
    evictIfNeeded();
    return url;
  })();
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

/** Vocalise plusieurs répliques « en parallèle » : le sémaphore global de synthesizeLine fait le vrai
 *  plafonnement, ceci ne fait que lancer tous les appels sans attendre les uns les autres. */
export async function synthesizeMany(texts: string[], voiceId?: string, priority: number = TTS_PRIORITY.normal): Promise<(string | undefined)[]> {
  return Promise.all(texts.map((text) => synthesizeLine(text, voiceId, priority)));
}
