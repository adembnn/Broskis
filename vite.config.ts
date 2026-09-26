// Sert les fonctions api/*.ts (format Vercel : export default async function handler({body, env})) en
// développement, sans dépendance à Express (lot LI, plan/lots/LI-pipeline-ia.md). Les clés viennent de
// .env via loadEnv et ne passent JAMAIS par import.meta.env / VITE_* (elles ne doivent jamais atteindre
// le bundle envoyé au navigateur) : chaque handler les reçoit explicitement dans `env`.
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import type { ApiHandler, ApiResponse } from './api/_types.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const API_ROUTE = /^\/api\/([a-zA-Z0-9_-]+)$/;

function readRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendResponse(res: ServerResponse, result: ApiResponse) {
  res.statusCode = result.status;
  if (result.bytes) {
    res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
    res.end(Buffer.from(result.bytes));
  } else {
    res.setHeader('Content-Type', result.contentType || 'application/json');
    res.end(result.json !== undefined ? JSON.stringify(result.json) : '{}');
  }
}

/** Plugin dev-only : /api/<nom> -> ssrLoadModule('/api/<nom>.ts').default({ body, env }). */
function apiDevServerPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'broskis-api-dev-server',
    configureServer(server: ViteDevServer) {
      // Appelé ici (pas dans la fonction retournée) : on s'installe AVANT les middlewares internes de
      // Vite, pour intercepter /api/* avant qu'un autre gestionnaire ne s'en mêle.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost') : null;
        const match = url ? API_ROUTE.exec(url.pathname) : null;
        if (!match) return next();
        const name = match[1];
        if (name.startsWith('_') || !existsSync(`${ROOT}api/${name}.ts`)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        try {
          const body = await readRequestBody(req);
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const handler = mod.default as ApiHandler | undefined;
          if (typeof handler !== 'function') {
            throw new Error(`api/${name}.ts must have a default export function`);
          }
          const result = await handler({ body, env });
          sendResponse(res, result);
        } catch (err) {
          console.error(`[api/${name}]`, err);
          sendResponse(res, { status: 500, json: { error: String((err as Error)?.message ?? err) } });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [apiDevServerPlugin(env)],
  };
});
