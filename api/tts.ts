// POST /api/tts — vocalise une réplique de l'animateur via Gradium (lot LI). Renvoie des octets WAV bruts
// (pas de JSON) : le client en fait un Blob + URL d'objet (src/ia/tts-client.ts).
import type { ApiHandler } from './_types';
import { bytes, fail } from './_types';
import { GRADIUM_TTS_CONFIG, GRADIUM_TTS_MODEL, GRADIUM_TTS_URL, GRADIUM_VOICE_FALLBACK, GRADIUM_VOICE_PRIMARY } from './_models';
import { capChars, serverTimeout } from './_util';

interface TtsRequest {
  text: string;
  voiceId?: string;
}

async function callGradium(apiKey: string, text: string, voiceId: string): Promise<Response> {
  return fetch(GRADIUM_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ text, voice_id: voiceId, output_format: 'wav', only_audio: true, model_name: GRADIUM_TTS_MODEL, json_config: GRADIUM_TTS_CONFIG }),
    signal: serverTimeout(9_000),
  });
}

const handler: ApiHandler<TtsRequest> = async ({ body, env }) => {
  const text = typeof body?.text === 'string' ? capChars(body.text, 300) : '';
  if (!text) return fail(400, 'missing text');
  const apiKey = env.GRADIUM_API_KEY;
  if (!apiKey) return fail(500, 'missing GRADIUM_API_KEY');

  const requestedVoice = typeof body?.voiceId === 'string' && body.voiceId ? body.voiceId : GRADIUM_VOICE_PRIMARY;

  try {
    let res = await callGradium(apiKey, text, requestedVoice);
    if (!res.ok && requestedVoice !== GRADIUM_VOICE_FALLBACK) {
      // Voix de secours (Russell) si la voix demandée échoue (indisponible, quota...).
      res = await callGradium(apiKey, text, GRADIUM_VOICE_FALLBACK);
    }
    if (!res.ok) return fail(502, `gradium tts error: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return bytes(buf, 'audio/wav');
  } catch (err) {
    console.error('[api/tts]', err);
    return fail(502, `gradium tts error: ${(err as Error)?.message ?? err}`);
  }
};

export default handler;
