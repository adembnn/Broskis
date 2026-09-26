// POST /api/tts — vocalise une réplique de l'animateur (lot LI, refait par le lot LVOX). Voix UNIQUE de
// l'animateur : Gemini 3.8 Flash TTS, voix Fenrir (même appel que tools/voices/generate-barks.mjs), texte
// envoyé SANS préfixe de ton (voir api/_models.ts). Gradium (Marcus) reste le plan B si Gemini échoue ou
// dépasse GEMINI_DEADLINE_MS, ET le chemin pris quand `voiceId` est un identifiant de voix CLONÉE d'un
// joueur (lot LW2, en cours en parallèle) : Gemini n'a que des voix prébuilt nommées, il ne sait pas cloner,
// donc un `voiceId` fourni saute Gemini et va droit sur Gradium.
// Renvoie des octets WAV bruts (pas de JSON) : le client en fait un Blob + URL d'objet (src/ia/tts-client.ts).
import { GoogleGenAI, Modality } from '@google/genai';
import type { ApiHandler } from './_types';
import { bytes, fail } from './_types';
import {
  GEMINI_TTS_MODEL,
  GEMINI_TTS_VOICE,
  GRADIUM_TTS_CONFIG,
  GRADIUM_TTS_MODEL,
  GRADIUM_TTS_URL,
  GRADIUM_VOICE_FALLBACK,
  GRADIUM_VOICE_PRIMARY,
} from './_models';
import { capChars, serverTimeout } from './_util';

interface TtsRequest {
  text: string;
  /** Identifiant de voix Gradium (voix clonée d'un joueur, lot LW2). Absent = voix Fenrir de l'animateur. */
  voiceId?: string;
}

/** Au-delà, on bascule sur Gradium plutôt que de laisser un sous-titre sans voix (décision d'Adem, LVOX). */
const GEMINI_DEADLINE_MS = 6_000;

async function callGradium(apiKey: string, text: string, voiceId: string): Promise<Response> {
  return fetch(GRADIUM_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ text, voice_id: voiceId, output_format: 'wav', only_audio: true, model_name: GRADIUM_TTS_MODEL, json_config: GRADIUM_TTS_CONFIG }),
    signal: serverTimeout(9_000),
  });
}

async function gradiumBytes(apiKey: string, text: string, voiceId: string): Promise<Uint8Array> {
  let res = await callGradium(apiKey, text, voiceId);
  if (!res.ok && voiceId !== GRADIUM_VOICE_FALLBACK) {
    // Voix de secours (Russell) si la voix demandée échoue (indisponible, quota...).
    res = await callGradium(apiKey, text, GRADIUM_VOICE_FALLBACK);
  }
  if (!res.ok) throw new Error(`gradium tts error: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Emballe un buffer PCM 16 bits mono (sortie Gemini TTS) en WAV valide — même recette que
 *  tools/voices/generate-barks.mjs (pcmToWav), réécrite ici sans Buffer (ce fichier tourne aussi côté edge). */
function pcmToWav(pcm: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Uint8Array {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function callGeminiTts(apiKey: string, text: string): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model: GEMINI_TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } } },
      abortSignal: serverTimeout(GEMINI_DEADLINE_MS),
    },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error('gemini tts: pas d\'audio dans la réponse');
  return pcmToWav(base64ToBytes(b64));
}

const handler: ApiHandler<TtsRequest> = async ({ body, env }) => {
  const text = typeof body?.text === 'string' ? capChars(body.text, 300) : '';
  if (!text) return fail(400, 'missing text');

  const voiceId = typeof body?.voiceId === 'string' && body.voiceId ? body.voiceId : undefined;
  const gradiumKey = env.GRADIUM_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;

  // Voix clonée d'un joueur (lot LW2) : Gemini ne clone pas de voix, on va direct sur Gradium.
  if (voiceId) {
    if (!gradiumKey) return fail(500, 'missing GRADIUM_API_KEY');
    try {
      return bytes(await gradiumBytes(gradiumKey, text, voiceId), 'audio/wav');
    } catch (err) {
      console.error('[api/tts] gradium (voix clonée)', err);
      return fail(502, `gradium tts error: ${(err as Error)?.message ?? err}`);
    }
  }

  // Voix de l'animateur : Gemini 3.8 Flash TTS / Fenrir en priorité, Gradium (Marcus) en secours si Gemini
  // échoue ou dépasse GEMINI_DEADLINE_MS (décision d'Adem, plan/lots/LVOX-une-seule-voix.md).
  if (geminiKey) {
    try {
      return bytes(await callGeminiTts(geminiKey, text), 'audio/wav');
    } catch (err) {
      console.warn('[api/tts] gemini a échoué, secours Gradium :', (err as Error)?.message ?? err);
    }
  }

  if (!gradiumKey) return fail(500, geminiKey ? 'gemini tts error and missing GRADIUM_API_KEY fallback' : 'missing GEMINI_API_KEY');
  try {
    return bytes(await gradiumBytes(gradiumKey, text, GRADIUM_VOICE_PRIMARY), 'audio/wav');
  } catch (err) {
    console.error('[api/tts]', err);
    return fail(502, `gradium tts error: ${(err as Error)?.message ?? err}`);
  }
};

export default handler;
