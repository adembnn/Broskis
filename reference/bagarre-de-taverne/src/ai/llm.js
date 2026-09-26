// Enveloppe LLM pour les modules IA « d'ambiance » (commentateur, foule, metteur en scène, résumé de manche).
// Principe : l'IA propose, le code décide. On ne demande QUE du JSON court, avec délai strict ; la réponse est
// ensuite filtrée par l'appelant (listes fermées, longueur bornée). Rien ici ne bloque la boucle de rendu :
// tout est asynchrone, et en cas d'échec ou de retard la promesse se résout à `null` (jamais de rejet).
//
//   import { llm } from './llm.js'
//   llm.available()                    → true si un fournisseur est prêt (Claude en artifact, sinon Gemini)
//   await llm.json(prompt, { timeoutMs, tag }) → objet JSON ou null
//   llm.stats                          → compteurs (appels, réussites, délais dépassés, abandons)
//
// Fournisseurs : Claude via window.claude.use('sample') (modelTier 'quick'), Gemini via VITE_GEMINI_API_KEY.
// On n'importe pas l'état interne de oracle.js : l'Oracle garde sa propre logique ; ici on ouvre notre propre poignée.

const GEMINI_KEY = import.meta.env?.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = import.meta.env?.VITE_GEMINI_MODEL || 'gemini-3.8-flash';
const MAX_IN_FLIGHT = 2;

let sample = null;
let state = 'pending'; // pending | ready | off
let initP = null;
let inFlight = 0;
const stats = { calls: 0, ok: 0, timeouts: 0, errors: 0, dropped: 0, lastMs: 0 };

function init() {
  if (initP) return initP;
  if (typeof window === 'undefined' || !window.claude?.use) { state = GEMINI_KEY ? 'ready' : 'off'; initP = Promise.resolve(); return initP; }
  initP = Promise.resolve()
    .then(() => window.claude.use('sample'))
    .then((s) => { sample = s || null; state = sample || GEMINI_KEY ? 'ready' : 'off'; })
    .catch(() => { sample = null; state = GEMINI_KEY ? 'ready' : 'off'; });
  return initP;
}

async function askGemini(prompt, signal) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 200 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}');
}

// Dans un artifact claude.ai, chaque appel à Claude coûte au joueur et le premier demande son accord :
// on n'y autorise que les appels « au premier plan » (déclenchés par une action du joueur ou entre deux manches).
// Les appels d'ambiance (barde, foule, metteur en scène) restent en local, sinon ils saturent la file et bloquent l'Oracle.
async function json(prompt, { timeoutMs = 1500, foreground = false } = {}) {
  await init();
  if (state !== 'ready' || window.__noLLM) return null;
  if (sample && !foreground) { stats.dropped++; return null; }
  if (inFlight >= MAX_IN_FLIGHT) { stats.dropped++; return null; } // file pleine : on abandonne plutôt que d'accumuler du retard
  inFlight++; stats.calls++;
  const t0 = performance.now();
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = 0;
  try {
    const call = sample
      ? sample.json(prompt, { modelTier: 'quick', cache: false, ...(ctrl ? { signal: ctrl.signal } : {}) })
      : askGemini(prompt, ctrl?.signal);
    const out = await Promise.race([call, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), timeoutMs); })]);
    stats.ok++; stats.lastMs = Math.round(performance.now() - t0);
    return out && typeof out === 'object' ? out : null;
  } catch (e) {
    if (e?.message === 'timeout') { stats.timeouts++; try { ctrl?.abort(); } catch { /* déjà terminé */ } } else stats.errors++;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(e?.code)) { sample = null; state = GEMINI_KEY ? 'ready' : 'off'; }
    return null;
  } finally { clearTimeout(timer); inFlight--; }
}

// Nettoie une ligne de texte proposée par un LLM (pas de balises, longueur bornée, une seule ligne).
export function cleanLine(s, max = 110) {
  if (typeof s !== 'string') return '';
  return s.replace(/[<>{}\[\]`*_#]/g, '').replace(/\s+/g, ' ').replace(/^["«\s]+|["»\s]+$/g, '').trim().slice(0, max);
}

export const llm = { json, init, available: (opts = {}) => state === 'ready' && !window.__noLLM && (!sample || !!opts.foreground), stats, get name() { return sample ? 'Claude' : GEMINI_KEY ? 'Gemini' : 'local'; } };
