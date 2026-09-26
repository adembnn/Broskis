// Adaptateur Vercel des fonctions api/*.ts. En dev, vite.config.ts appelle le handler avec { body, env } ;
// sur Vercel, la fonction reçoit (req, res) Node : sans cet adaptateur, `env` était indéfini et toutes les
// fonctions plantaient au démarrage (FUNCTION_INVOCATION_FAILED, vu en ligne à 19h56).
// Sur Vercel, le mode « flux + relève » (tâches gardées en mémoire, relevées par polling) ne tient pas entre
// deux instances sans état : on le coupe (`stream` retiré) et le client reçoit la réponse entière d'un coup
// (chemin déjà prévu côté client quand la réponse n'a pas de jobId).
import type { ApiHandler, ApiRequest, ApiResponse } from './_types';

interface NodeRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(data?: string | Uint8Array): void;
}

export function adapt<Body>(handler: ApiHandler<Body>) {
  return async (req: ApiRequest<Body> | { body?: unknown; method?: string }, res?: NodeRes): Promise<ApiResponse | void> => {
    if (!res || typeof res.setHeader !== 'function') return handler(req as ApiRequest<Body>);
    let body: unknown = (req as { body?: unknown }).body;
    if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
    if (body && typeof body === 'object') delete (body as Record<string, unknown>).stream;
    let out: ApiResponse;
    try {
      out = await handler({ body: (body ?? {}) as Body, env: process.env as Record<string, string> });
    } catch (e) {
      out = { status: 500, json: { error: String((e as Error)?.message ?? e) } };
    }
    res.statusCode = out.status;
    if (out.bytes) {
      res.setHeader('content-type', out.contentType ?? 'application/octet-stream');
      res.end(out.bytes);
    } else {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out.json ?? null));
    }
  };
}
