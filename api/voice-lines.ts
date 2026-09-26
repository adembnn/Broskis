import type { ApiHandler } from './_types';
import { fail, ok } from './_types';
import { GRADIUM_TTS_URL, GRADIUM_TTS_MODEL } from './_models';
import { serverTimeout } from './_util';

interface VoiceLinesReq {
  voiceId: string;
  lines: { id: string; text: string }[];
}

const handler: ApiHandler<VoiceLinesReq> = async ({ body, env }) => {
  const apiKey = env.GRADIUM_API_KEY;
  if (!apiKey) return fail(500, 'missing GRADIUM_API_KEY');
  if (!body.voiceId || !body.lines) return fail(400, 'missing args');

  const results: Record<string, string> = {};
  const queue = [...body.lines];
  let hasError = false;

  async function worker() {
    while (queue.length > 0 && !hasError) {
      const line = queue.shift()!;
      let retry = 1;
      let success = false;
      
      while (retry >= 0 && !success) {
        try {
          const res = await fetch(GRADIUM_TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ 
              text: line.text, 
              voice_id: body.voiceId, 
              output_format: 'wav', 
              only_audio: true, 
              model_name: GRADIUM_TTS_MODEL, 
              json_config: { cfg_coef: 2.6, temp: 1.2, padding_bonus: -1.5 } 
            }),
            signal: serverTimeout(15000),
          });
          
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            results[line.id] = Buffer.from(buffer).toString('base64');
            success = true;
          } else {
            const text = await res.text();
            if (text.includes('Embeddings not found') && retry > 0) {
              await new Promise(r => setTimeout(r, 2000));
              retry--;
            } else {
              throw new Error(`Gradium TTS Error ${res.status}: ${text}`);
            }
          }
        } catch (e) {
          if (retry > 0) {
            await new Promise(r => setTimeout(r, 2000));
            retry--;
          } else {
            hasError = true;
            break;
          }
        }
      }
    }
  }

  await Promise.all([worker(), worker()]);

  if (Object.keys(results).length === 0) {
    return fail(500, 'Generation failed');
  }

  return ok({ results });
};

export default handler;
