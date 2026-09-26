#!/usr/bin/env node
// Lot LBK · Génère la banque de voix pré-générées ("barks") : répliques écrites par gemini-3.1-pro-preview,
// vocalisées par gemini-3.8-flash-tts. AUCUN paquet npm : seulement fs, path, url, et fetch (natif Node 24).
//
// Étape A : écriture des répliques (JSON contraint) — un appel par rôle (5 rôles), tous les événements et
//           variantes de ce rôle demandés dans un seul appel, pour limiter le nombre de requêtes.
// Étape B : synthèse vocale — un appel par réplique (jusqu'à 4 en parallèle, 3 essais, attente croissante).
//
// Reprise : si public/assets/voices/<role>/<event>-<n>.wav existe déjà, on saute l'appel TTS correspondant.
// Les répliques écrites (étape A) sont mises en cache dans tools/voices/scripts-cache.json pour que le texte
// d'une variante ne change pas d'une relance à l'autre (le manifeste doit rester cohérent avec l'audio déjà sur disque).
//
// Relancer : `node tools/voices/generate-barks.mjs` (à la racine du dépôt). Voir tools/voices/LISEZMOI.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../dashboard/log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_PATH = path.join(ROOT, '.env');
const VOICES_DIR = path.join(ROOT, 'public', 'assets', 'voices');
const MANIFEST_PATH = path.join(VOICES_DIR, 'manifest.json');
const CACHE_PATH = path.join(ROOT, 'tools', 'voices', 'scripts-cache.json');

// ---------------------------------------------------------------------------
// .env — parsé à la main, pas de dépendance `dotenv`.
// ---------------------------------------------------------------------------
function loadEnv(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const ENV = loadEnv(ENV_PATH);
const GEMINI_API_KEY = ENV.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('[generate-barks] GEMINI_API_KEY introuvable dans .env — abandon.');
  process.exit(1);
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-3.1-pro-preview';
const TTS_MODEL = 'gemini-3.8-flash-tts';

// ---------------------------------------------------------------------------
// Rôles, voix, ton (décision d'Adem, 26/09 13h — voir plan/lots/LBK-banque-voix.md).
// ---------------------------------------------------------------------------
const ROLES = {
  announcer: {
    voice: 'Fenrir',
    tone: 'hyped-up stadium announcer SCREAMING into the mic over a roaring crowd, very fast, explosive, stretch the capitalized words, pro wrestling energy',
    persona: 'a hyped-up pro-wrestling-style stadium ring announcer',
    events: ['match_intro', 'weigh_in', 'hit', 'crit', 'perfect', 'feint', 'ringout', 'ko', 'sudden_death', 'crate_drop', 'comeback', 'victory'],
    variants: 5,
  },
  barbarian: {
    voice: 'Algenib',
    tone: 'huge cartoon barbarian ROARING, very deep gravelly, laughs maniacally, aggressive and fast',
    persona: 'a huge cartoon barbarian warrior',
    events: null, // rempli plus bas (FIGHTER_EVENTS)
    variants: 3,
  },
  knight: {
    voice: 'Alnilam',
    tone: 'pompous cartoon British knight SHOUTING heroic lines, booming, theatrical, fired up, fast',
    persona: 'a pompous, theatrical cartoon British knight',
    events: null,
    variants: 3,
  },
  mage: {
    voice: 'Puck',
    tone: 'hyperactive cartoon old wizard SCREECHING with glee, high-pitched, crackly, frantic, cackles',
    persona: 'a hyperactive, cackling old cartoon wizard',
    events: null,
    variants: 3,
  },
  rogue: {
    voice: 'Zephyr',
    tone: 'cocky cartoon trickster YELLING taunts, fast, bratty, mocking laughter',
    persona: 'a cocky, bratty cartoon trickster rogue',
    events: null,
    variants: 3,
  },
};

const FIGHTER_EVENTS = [
  'hit_light', 'hit_heavy', 'crit_taken', 'parry_perfect', 'parry_good', 'whiff', 'dodge',
  'throw_effort', 'jump_effort', 'taunt_turn', 'low_hp', 'ringout_scream', 'ko', 'victory',
  'crate_grab', 'new_weapon',
];
for (const role of ['barbarian', 'knight', 'mage', 'rogue']) ROLES[role].events = FIGHTER_EVENTS;

// Description courte de chaque événement, pour guider l'écriture (anglais, en jeu uniquement).
const EVENT_HINTS = {
  hit_light: 'got hit by a light attack, a short pained grunt/yell',
  hit_heavy: 'got hit hard by a heavy attack, a big pained shout',
  crit_taken: 'just took a brutal critical hit, an over-the-top scream of pain',
  parry_perfect: 'just landed a perfect, frame-tight parry, a triumphant shout',
  parry_good: 'just landed a decent parry, a satisfied grunt of success',
  whiff: 'just completely missed their attack, an annoyed/embarrassed yell',
  dodge: 'just dodged an incoming attack at the last second, a cocky exclamation',
  throw_effort: 'grunting hard with effort while throwing/firing a weapon',
  jump_effort: 'grunting with effort while jumping',
  taunt_turn: 'taunting the opponent at the start of their turn, cocky trash talk',
  low_hp: 'badly hurt, low health, a desperate defiant shout',
  ringout_scream: 'falling off the edge of the arena into the void, a long scream',
  ko: 'just got knocked out, a final defeated groan/yell',
  victory: 'just won the match, a huge triumphant victory shout',
  crate_grab: 'just grabbed the falling supply crate, an excited exclamation',
  new_weapon: 'just got handed a brand new scanned weapon, an excited reaction',

  match_intro: 'hyping up the crowd to introduce the start of a brand new match',
  weigh_in: 'introducing a fighter\'s weapon during the pre-match weapon weigh-in, boxing-style',
  hit: 'reacting to a solid hit landing in the fight',
  crit: 'reacting to a massive critical hit landing',
  perfect: 'losing his mind over a perfectly-timed parry',
  feint: 'reacting to a clever feint or missed attack',
  ringout: 'reacting to a fighter getting knocked clean out of the arena',
  ko: 'reacting to a fighter getting knocked out',
  sudden_death: 'announcing that sudden death has begun, the arena is shrinking',
  crate_drop: 'hyping up a supply crate dropping into the arena',
  comeback: 'reacting to a stunning last-second comeback',
  victory: 'announcing the winner of the match, huge celebratory energy',
};

// ---------------------------------------------------------------------------
// Utilitaires réseau : essais + attente croissante sur 429/5xx.
// ---------------------------------------------------------------------------
const BACKOFFS_MS = [1000, 3000, 9000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, label) {
  let lastErr;
  for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      const bodyText = await res.text().catch(() => '');
      lastErr = new Error(`${label}: HTTP ${res.status} ${bodyText.slice(0, 300)}`);
      if (!retryable || attempt === BACKOFFS_MS.length) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (attempt === BACKOFFS_MS.length) throw lastErr;
    }
    const wait = BACKOFFS_MS[attempt];
    console.warn(`[generate-barks] ${label} : retry dans ${wait}ms (${lastErr.message})`);
    await sleep(wait);
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Petit pool de concurrence (pas de dépendance p-limit).
// ---------------------------------------------------------------------------
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------------------
// Étape A : écriture des répliques (JSON contraint).
// ---------------------------------------------------------------------------
function buildResponseSchema(events) {
  const properties = {};
  for (const ev of events) {
    properties[ev] = { type: 'ARRAY', items: { type: 'STRING' } };
  }
  return { type: 'OBJECT', properties, required: [...events] };
}

function buildTextPrompt(roleKey, role) {
  const lines = role.events.map((ev) => `- "${ev}": ${EVENT_HINTS[ev] ?? ev}`).join('\n');
  return `You are writing short voice-line barks for a cartoon 3D fighting game called BROSKIS, for the character type: ${role.persona}.
Tone/voice direction for this character: ${role.tone}.

For EACH of the following game events, write exactly ${role.variants} DIFFERENT short voice lines this character would SCREAM/SHOUT out loud in the moment described. Rules:
- English only, always in character, NEVER a neutral assistant tone.
- 2 to 8 words per line.
- Write them CRIED OUT: ALL CAPS words for emphasis, "!!!", and stretched vowels for scream effect (e.g. "RAAAH", "NOOOO", "YEEEAH").
- Funny, punchy, varied between the ${role.variants} variants (no near-duplicates).
- No profanity, no slurs, keep it cartoon-friendly.

Events:
${lines}

Return ONLY the JSON object matching the schema, with one array of ${role.variants} strings per event key.`;
}

async function generateRoleLines(roleKey, role) {
  const url = `${GEMINI_BASE}/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildTextPrompt(roleKey, role) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(role.events),
      temperature: 1.1,
    },
  };
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, `texte:${roleKey}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`texte:${roleKey} — JSON illisible: ${err.message} — brut: ${text.slice(0, 200)}`);
  }
  // Normalise et tronque/complète au nombre de variantes attendu.
  const out = {};
  for (const ev of role.events) {
    let arr = Array.isArray(parsed[ev]) ? parsed[ev].filter((s) => typeof s === 'string' && s.trim()) : [];
    while (arr.length < role.variants) arr.push(arr[arr.length % Math.max(arr.length, 1)] || `${ev.toUpperCase()}!!!`);
    out[ev] = arr.slice(0, role.variants);
  }
  return out;
}

async function loadOrGenerateScripts() {
  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { cache = {}; }
  }
  let changed = false;
  for (const [roleKey, role] of Object.entries(ROLES)) {
    const needsAll = cache[roleKey] && role.events.every((ev) => Array.isArray(cache[roleKey][ev]) && cache[roleKey][ev].length >= role.variants);
    if (needsAll) continue;
    console.log(`[generate-barks] écriture des répliques (${roleKey})…`);
    cache[roleKey] = await generateRoleLines(roleKey, role);
    changed = true;
  }
  if (changed) fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

// ---------------------------------------------------------------------------
// Étape B : synthèse vocale (Gemini TTS) + emballage WAV.
// ---------------------------------------------------------------------------

/** Emballe un buffer PCM 16 bits mono en WAV valide (en-tête RIFF 44 octets). */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // taille du sous-bloc fmt
  header.writeUInt16LE(1, 20); // format PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function synthesizeLine(roleKey, role, text) {
  const url = `${GEMINI_BASE}/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  // IMPORTANT (vérifié empiriquement le 26/09) : préfixer le texte envoyé au TTS par la consigne de ton
  // (comme demandé initialement dans le lot) fait que gemini-3.8-flash-tts LIT LA CONSIGNE À VOIX HAUTE au
  // lieu de s'en servir comme simple direction d'acteur — un test A/B direct montre des clips de 10 à 16 s
  // (au lieu de 2 à 4 s) contenant la consigne elle-même déclamée. On envoie donc uniquement la réplique
  // brute (déjà en MAJUSCULES/« !!! »/voyelles étirées, donc porteuse du ton) ; le ton du personnage vient de
  // la voix prébuilt (role.voice) et du style d'écriture, pas d'un préfixe parlé. Voir tools/voices/LISEZMOI.md.
  const spokenText = text;
  const body = {
    contents: [{ role: 'user', parts: [{ text: spokenText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: role.voice } },
      },
    },
  };
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, `tts:${roleKey}`);
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error(`tts:${roleKey} — pas d'audio dans la réponse: ${JSON.stringify(json).slice(0, 300)}`);
  const pcm = Buffer.from(b64, 'base64');
  return pcmToWav(pcm, 24000, 1, 16);
}

// ---------------------------------------------------------------------------
// Orchestration.
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = Date.now();
  log({ source: 'gemini', kind: 'generation', status: 'en-cours', title: 'Banque de voix (barks) : démarrage', lot: 'LBK' });

  fs.mkdirSync(VOICES_DIR, { recursive: true });

  const scripts = await loadOrGenerateScripts();

  // Construit la liste plate de toutes les répliques à synthétiser.
  const jobs = [];
  for (const [roleKey, role] of Object.entries(ROLES)) {
    for (const ev of role.events) {
      const lines = scripts[roleKey][ev];
      lines.forEach((text, i) => {
        const n = i + 1;
        const file = `${ev}-${n}.wav`;
        const rel = path.join(roleKey, file);
        const abs = path.join(VOICES_DIR, roleKey, file);
        jobs.push({ roleKey, role, ev, n, text, rel, abs });
      });
    }
  }

  fs.mkdirSync(path.join(VOICES_DIR), { recursive: true });
  for (const roleKey of Object.keys(ROLES)) fs.mkdirSync(path.join(VOICES_DIR, roleKey), { recursive: true });

  const total = jobs.length;
  console.log(`[generate-barks] ${total} répliques au total (dont déjà présentes : reprise possible).`);

  let done = 0;
  let generated = 0;
  let failed = 0;
  const failures = [];

  await runPool(jobs, 4, async (job) => {
    if (fs.existsSync(job.abs)) {
      done++;
      return;
    }
    try {
      const wav = await synthesizeLine(job.roleKey, job.role, job.text);
      fs.writeFileSync(job.abs, wav);
      generated++;
      done++;
      if (generated % 20 === 0) {
        log({ source: 'gemini', kind: 'generation', status: 'en-cours', title: `Banque de voix : ${done}/${total} (dont ${generated} générées cette session)`, lot: 'LBK' });
        console.log(`[generate-barks] progression : ${done}/${total}`);
      }
    } catch (err) {
      failed++;
      done++;
      failures.push({ role: job.roleKey, event: job.ev, n: job.n, error: String(err?.message ?? err) });
      console.error(`[generate-barks] ÉCHEC ${job.roleKey}/${job.ev}-${job.n} : ${err?.message ?? err}`);
    }
  });

  // Manifeste : ne liste que les fichiers réellement présents sur disque (reprise = cohérence garantie).
  const manifest = {};
  for (const [roleKey, role] of Object.entries(ROLES)) {
    manifest[roleKey] = {};
    for (const ev of role.events) {
      const entries = [];
      const lines = scripts[roleKey][ev];
      lines.forEach((text, i) => {
        const n = i + 1;
        const file = path.join(roleKey, `${ev}-${n}.wav`).replace(/\\/g, '/');
        if (fs.existsSync(path.join(VOICES_DIR, roleKey, `${ev}-${n}.wav`))) {
          entries.push({ file, text });
        }
      });
      manifest[roleKey][ev] = entries;
    }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const fileCount = Object.values(manifest).reduce((sum, events) => sum + Object.values(events).reduce((s, arr) => s + arr.length, 0), 0);
  const ms = Date.now() - startedAt;
  log({
    source: 'gemini', kind: 'generation', status: failed > 0 && fileCount < total ? 'fait' : 'fait',
    title: `Banque de voix (barks) terminée : ${fileCount}/${total} fichiers dans le manifeste (${generated} générés cette session, ${failed} échecs)`,
    lot: 'LBK', ms, details: failures.slice(0, 20),
  });
  console.log(`[generate-barks] terminé. ${fileCount}/${total} fichiers dans le manifeste. ${failed} échec(s).`);
  if (failures.length) {
    console.warn('[generate-barks] échecs (20 max affichés):', failures.slice(0, 20));
  }
}

main().catch((err) => {
  console.error('[generate-barks] erreur fatale', err);
  log({ source: 'gemini', kind: 'generation', status: 'echec', title: 'Banque de voix (barks) : erreur fatale', lot: 'LBK', details: String(err?.message ?? err) });
  process.exit(1);
});
