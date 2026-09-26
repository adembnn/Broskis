// Charge le .env le plus proche en remontant les dossiers (même règle que vite.config.ts : les copies de
// travail des agents utilisent le .env du dépôt principal). N'affiche JAMAIS une valeur de clé.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function loadEnv() {
  let d = process.cwd();
  while (!existsSync(join(d, '.env'))) {
    const p = dirname(d);
    if (p === d) return false;
    d = p;
  }
  for (const line of readFileSync(join(d, '.env'), 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
  return true;
}
