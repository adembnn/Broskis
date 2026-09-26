// Contrat des fonctions api/*.ts (lot LI). Format proche de Vercel : un handler pur, sans dépendance à
// Express ni à Vite. `vite.config.ts` (dev) l'appelle avec { body, env } ; un adaptateur Vercel pourra
// plus tard appeler la même fonction avec req.body et process.env, sans toucher au code des handlers.
export interface ApiRequest<Body = unknown> {
  body: Body;
  /** Variables lues depuis .env côté serveur (jamais VITE_*). */
  env: Record<string, string>;
}

export interface ApiResponse {
  status: number;
  /** Réponse JSON (sérialisée par le plugin dev / l'adaptateur Vercel). */
  json?: unknown;
  /** Réponse binaire (PNG, WAV...). Prioritaire sur `json` si présent. */
  bytes?: Uint8Array;
  contentType?: string;
}

export type ApiHandler<Body = unknown> = (req: ApiRequest<Body>) => Promise<ApiResponse>;

export function ok(json: unknown, status = 200): ApiResponse {
  return { status, json };
}

export function fail(status: number, message: string): ApiResponse {
  return { status, json: { error: message } };
}

export function bytes(data: Uint8Array, contentType: string, status = 200): ApiResponse {
  return { status, bytes: data, contentType };
}
