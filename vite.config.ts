// Sert les fonctions api/*.ts (format Vercel : export default async function handler({body, env})) en
// développement et sous `vite preview` (build de démo : npm run demo), sans dépendance à Express (lot LI,
// plan/lots/LI-pipeline-ia.md). Les clés viennent de
// .env via loadEnv et ne passent JAMAIS par import.meta.env / VITE_* (elles ne doivent jamais atteindre
// le bundle envoyé au navigateur) : chaque handler les reçoit explicitement dans `env`.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, runnerImport, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import type { ApiHandler, ApiResponse } from './api/_types.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

// Dossier du .env : le plus proche en remontant. Les copies de travail des agents (.claude/worktrees/*) utilisent
// ainsi le .env unique du dépôt principal, sans jamais le recopier.
function envDir(): string {
  let d = process.cwd();
  while (!existsSync(join(d, '.env'))) { const p = dirname(d); if (p === d) return process.cwd(); d = p; }
  return d;
}

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

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

/** /api/<nom> -> charger('<nom>')({ body, env }). Commun au serveur de dev et à `vite preview`. */
function apiMiddleware(env: Record<string, string>, charger: (name: string) => Promise<ApiHandler | undefined>): Middleware {
  return async (req, res, next) => {
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
      const handler = await charger(name);
      if (typeof handler !== 'function') {
        throw new Error(`api/${name}.ts must have a default export function`);
      }
      const result = await handler({ body, env });
      sendResponse(res, result);
    } catch (err) {
      console.error(`[api/${name}]`, err);
      sendResponse(res, { status: 500, json: { error: String((err as Error)?.message ?? err) } });
    }
  };
}

/** Plugin API : ssrLoadModule en dev ; en `vite preview` (build de démo, lot LPERF), runnerImport transpile
 * api/<nom>.ts une seule fois puis garde le gestionnaire en mémoire. */
function apiServerPlugin(env: Record<string, string>): Plugin {
  const enPreview = new Map<string, Promise<ApiHandler | undefined>>();
  return {
    name: 'broskis-api-server',
    configureServer(server: ViteDevServer) {
      // Appelé ici (pas dans la fonction retournée) : on s'installe AVANT les middlewares internes de
      // Vite, pour intercepter /api/* avant qu'un autre gestionnaire ne s'en mêle.
      server.middlewares.use(apiMiddleware(env, async (name) =>
        (await server.ssrLoadModule(`/api/${name}.ts`)).default as ApiHandler | undefined));
    },
    configurePreviewServer(server: PreviewServer) {
      const charger = (name: string) => {
        let p = enPreview.get(name);
        if (!p) {
          p = runnerImport<{ default?: ApiHandler }>(`${ROOT}api/${name}.ts`).then((r) => r.module.default);
          p.catch(() => enPreview.delete(name)); // une erreur de chargement ne reste pas en cache
          enPreview.set(name, p);
        }
        return p;
      };
      // Préchauffe : sans ça, le 1er scan de la démo attend ~0,8 s de transpilation.
      for (const f of readdirSync(`${ROOT}api`)) if (f.endsWith('.ts') && !f.startsWith('_')) void charger(f.slice(0, -3)).catch(() => {});
      server.middlewares.use(apiMiddleware(env, charger));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir(), '');
  return {
    plugins: [apiServerPlugin(env)],
    // Les copies de travail des agents (.claude/worktrees, chacune avec son node_modules et son dist), les captures
    // et les rapports ne font pas partie du jeu : ne pas les surveiller ni les analyser (serveur de dev figé sinon).
    server: {
      watch: { ignored: ['**/.claude/**', '**/captures/**', '**/reports/**', '**/dist/**', '**/dashboard/**'] },
    },
    optimizeDeps: { entries: ['index.html'] },
    build: {
      // Lot LPERF : three.js et Rapier (wasm inclus) dans leurs propres fichiers, à côté du code du jeu.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three', test: /node_modules[\\/]three[\\/]/ },
              { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
            ],
          },
        },
      },
      chunkSizeWarningLimit: 4500, // Rapier -compat embarque son wasm en base64 (4,3 Mo) : voir plan/rendus/LPERF.md
    },
  };
});
