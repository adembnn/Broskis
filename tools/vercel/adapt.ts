// Adaptateur Vercel : appelle un handler api/*.ts (format { body, env } → ApiResponse, voir api/_types.ts)
// depuis une fonction Node de Vercel (req, res), sans toucher au code des handlers.
// Sur Vercel, le mode « flux par relève » (stream: true → jobId, puis relèves) est retiré : les instances ne
// partagent pas leur mémoire, donc une relève pourrait tomber sur une autre instance. Le handler renvoie alors
// le résultat complet d'un coup, ce que le client gère déjà (src/ia/scan.ts, src/ia/fighter/index.ts).
import type { ApiHandler, ApiResponse } from '../../api/_types';

interface NodeRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: unknown): void;
}

export function adapt(handler: ApiHandler<any>) {
  return async (req: { body?: unknown }, res: NodeRes): Promise<void> => {
    let body: unknown = req.body ?? {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const { stream: _stream, ...rest } = body as Record<string, unknown>;
      body = rest;
    }
    let out: ApiResponse;
    try {
      out = await handler({ body, env: process.env as Record<string, string> });
    } catch (e) {
      out = { status: 500, json: { error: e instanceof Error ? e.message : 'server error' } };
    }
    res.statusCode = out.status;
    if (out.bytes) {
      res.setHeader('Content-Type', out.contentType ?? 'application/octet-stream');
      res.end(Buffer.from(out.bytes));
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out.json ?? null));
  };
}
