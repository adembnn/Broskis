// POST /api/gradium-token — jeton à usage unique pour la WebSocket Gradium côté navigateur (lot LI).
// La clé d'API elle-même ne quitte jamais le serveur ; seul ce jeton de courte durée part au client.
import type { ApiHandler } from './_types';
import { fail, ok } from './_types';
import { GRADIUM_TOKEN_URL } from './_models';
import { serverTimeout } from './_util';

const handler: ApiHandler<Record<string, never>> = async ({ env }) => {
  const apiKey = env.GRADIUM_API_KEY;
  if (!apiKey) return fail(500, 'missing GRADIUM_API_KEY');

  try {
    const res = await fetch(GRADIUM_TOKEN_URL, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
      signal: serverTimeout(5_000),
    });
    if (!res.ok) return fail(502, `gradium token error: ${res.status}`);
    const data = await res.json();
    return ok(data);
  } catch (err) {
    console.error('[api/gradium-token]', err);
    return fail(502, `gradium token error: ${(err as Error)?.message ?? err}`);
  }
};

export default handler;
