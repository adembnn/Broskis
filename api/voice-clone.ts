import { adapt } from './_vercel';
import type { ApiHandler } from './_types';
import { fail, ok } from './_types';
import { GRADIUM_BASE_URL } from './_models';
import { serverTimeout } from './_util';

interface CloneReq {
  action: 'clone' | 'delete';
  voiceId?: string;
  audioBase64?: string;
  mime?: string;
  playerId?: number;
}

const handler: ApiHandler<CloneReq> = async ({ body, env }) => {
  const apiKey = env.GRADIUM_API_KEY;
  if (!apiKey) return fail(500, 'missing GRADIUM_API_KEY');

  if (body.action === 'delete') {
    if (!body.voiceId) return fail(400, 'missing voiceId');
    try {
      const res = await fetch(`${GRADIUM_BASE_URL}/api/voices/${body.voiceId}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
        signal: serverTimeout(5000),
      });
      return ok({ success: true, status: res.status });
    } catch (err) {
      return fail(500, String(err));
    }
  }

  if (body.action === 'clone') {
    if (!body.audioBase64) return fail(400, 'missing audioBase64');

    // Nettoyage des vieilles voix
    try {
      const listRes = await fetch(`${GRADIUM_BASE_URL}/api/voices/`, {
        headers: { 'x-api-key': apiKey },
        signal: serverTimeout(5000),
      });
      if (listRes.ok) {
        const data = await listRes.json();
        const voices = Array.isArray(data) ? data : data.voices || [];
        const now = Date.now();
        const threeHours = 3 * 3600 * 1000;
        
        for (const v of voices) {
          if (v.name && v.name.startsWith('broskis-')) {
            const parts = v.name.split('-');
            if (parts.length >= 2) {
              const ts = parseInt(parts[1], 10);
              if (!isNaN(ts) && now - ts > threeHours) {
                await fetch(`${GRADIUM_BASE_URL}/api/voices/${v.uid}`, {
                  method: 'DELETE',
                  headers: { 'x-api-key': apiKey },
                }).catch(() => {});
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[voice-clone] cleanup failed', e);
    }

    const ext = body.mime && body.mime.includes('wav') ? 'wav' : 'webm';
    const buffer = Buffer.from(body.audioBase64, 'base64');
    const blob = new Blob([buffer], { type: body.mime || 'audio/webm' });
    
    const form = new FormData();
    form.append('audio_file', blob, `sample.${ext}`);
    form.append('name', `broskis-${Date.now()}-p${(body.playerId ?? 0) + 1}`);
    form.append('language', 'en');
    form.append('start_s', '0.5');

    try {
      const res = await fetch(`${GRADIUM_BASE_URL}/api/voices/`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: form,
        signal: serverTimeout(30000),
      });
      const data: any = await res.json();
      
      // Gradium renvoie souvent 201 même avec "error: Please wait a bit till the voice is ready".
      if (data.uid) {
        return ok({ voiceId: data.uid });
      }
      return fail(res.status, 'Clone failed');
    } catch (err) {
      return fail(500, String(err));
    }
  }

  return fail(400, 'invalid action');
};

export default adapt(handler);
