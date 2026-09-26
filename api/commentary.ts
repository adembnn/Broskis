// POST /api/commentary — l'animateur de ring solo (lot LI). Appelé une seule fois par prepareCommentary,
// PENDANT la présentation des armes (jamais en direct pendant un tour, skill ia-en-jeu : le direct est
// réservé aux moments rares). Renvoie plusieurs variantes par type de moment, à vocaliser à l'avance.
import { GoogleGenAI, Type } from '@google/genai';
import type { ApiHandler } from './_types';
import { fail, ok } from './_types';
import { GEMINI_COMMENTARY_MODEL } from './_models';
import { capChars, capWords, serverTimeout, stripBannedWords } from './_util';
import { FALLBACK_COMMENTARY } from '../src/ia/presets';
import type { CommentaryKind } from '../src/ia/config';

interface CommentaryRequest {
  kinds: string[];
  variantsPerKind: number;
  weapons?: { name: string; object: string; category: string }[];
}

// Persona : Nigel Crankshaft, animateur de ring. Tic de langage : "—and that's the WHOLE SANDWICH!"
// (rare, pas à chaque ligne). Défaut : il explique avec un aplomb total à quoi servent "vraiment" les
// objets scannés — et se trompe à chaque fois. Jamais de ton d'assistant (skill anti-slop).
const PERSONA = `You are Nigel Crankshaft, the hyperactive solo ring announcer for a cartoon party-fighting game called Broskis.
Catchphrase, used RARELY for a big moment only: "—and that's the WHOLE SANDWICH!"
Your flaw: you confidently explain what everyday objects are "actually" designed for, and you are always wrong, stated with total conviction.
Never sound like an assistant: no greetings, no lists, no apologies, no explanations, never say "as an AI" or "I can help". Every line is shouted live, in the moment.
Rules for every line: English only, at most 14 words, never the words "epic" or "legendary", never a generic fantasy tone.`;

const KIND_DESCRIPTIONS: Partial<Record<CommentaryKind, string>> = {
  hit: 'a clean attack just landed on a fighter',
  crit: 'a critical, extra-hard hit just landed',
  miss: 'an attack completely whiffed, hit nothing',
  'parry-perfect': 'the defender parried with perfect frame-tight timing and reflects the attack back',
  'low-hp': 'a fighter is now dangerously low on health, one hit from losing',
  ko: 'a fighter is knocked out, the match just ended',
  'match-start': 'the duel is about to begin, fighters are squaring up',
  'crate-grab': 'a fighter just grabbed the falling supply crate to scan a new weapon',
};

function describeKind(kind: string): string {
  return KIND_DESCRIPTIONS[kind as CommentaryKind] ?? `the moment "${kind}" is happening`;
}

function buildPrompt(kinds: string[], variantsPerKind: number, weapons: CommentaryRequest['weapons']): string {
  const weaponsLine = weapons?.length
    ? `This match's weapons: ${weapons.map((w) => `${w.name} (really a ${w.object}, played as a ${w.category})`).join(', ')}. You may mangle what these objects are "really" for.`
    : 'You do not know the weapons yet — keep lines generic.';
  const moments = kinds.map((k) => `- "${k}": ${describeKind(k)}.`).join('\n');
  return `${PERSONA}
${weaponsLine}
Write ${variantsPerKind} DISTINCT short commentary lines for EACH of these live moments:
${moments}
Respond with JSON only, matching the schema: one array of strings per moment key, in the exact given key spelling.`;
}

function buildSchema(kinds: string[], variantsPerKind: number) {
  const n = String(variantsPerKind);
  return {
    type: Type.OBJECT,
    properties: Object.fromEntries(
      kinds.map((k) => [k, { type: Type.ARRAY, items: { type: Type.STRING }, minItems: n, maxItems: n }]),
    ),
    required: kinds,
  };
}

function cleanLine(s: unknown, kind: string, i: number): string {
  const fallbackBank = FALLBACK_COMMENTARY[kind as CommentaryKind];
  const fallback = fallbackBank?.[i % fallbackBank.length] ?? 'The crowd goes wild!';
  if (typeof s !== 'string' || !s.trim()) return fallback;
  const cleaned = stripBannedWords(capChars(capWords(s, 14), 90));
  return cleaned || fallback;
}

function fallbackLines(kinds: string[], variantsPerKind: number): Record<string, string[]> {
  const lines: Record<string, string[]> = {};
  for (const kind of kinds) {
    const bank = FALLBACK_COMMENTARY[kind as CommentaryKind] ?? ['The crowd goes wild!'];
    lines[kind] = Array.from({ length: variantsPerKind }, (_, i) => bank[i % bank.length]);
  }
  return lines;
}

const handler: ApiHandler<CommentaryRequest> = async ({ body, env }) => {
  const kinds = Array.isArray(body?.kinds) && body.kinds.length ? body.kinds.filter((k) => typeof k === 'string') : [];
  const variantsPerKind = Number.isFinite(body?.variantsPerKind) && body.variantsPerKind > 0 ? Math.min(8, Math.round(body.variantsPerKind)) : 5;
  if (!kinds.length) return fail(400, 'missing kinds');

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return ok({ lines: fallbackLines(kinds, variantsPerKind) });

  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: GEMINI_COMMENTARY_MODEL,
      contents: [{ role: 'user', parts: [{ text: buildPrompt(kinds, variantsPerKind, body.weapons) }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: buildSchema(kinds, variantsPerKind),
        abortSignal: serverTimeout(38_000),
      },
    });

    const raw = JSON.parse(res.text ?? '{}');
    const lines: Record<string, string[]> = {};
    for (const kind of kinds) {
      const arr = Array.isArray(raw[kind]) ? raw[kind] : [];
      const filled: string[] = [];
      for (let i = 0; i < variantsPerKind; i++) filled.push(cleanLine(arr[i], kind, i));
      lines[kind] = filled;
    }
    return ok({ lines });
  } catch (err) {
    console.error('[api/commentary]', err);
    // L'animateur ne doit jamais faire planter la présentation des armes : banque de secours locale.
    return ok({ lines: fallbackLines(kinds, variantsPerKind) });
  }
};

export default handler;
