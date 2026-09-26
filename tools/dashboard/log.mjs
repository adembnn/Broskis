// Journal partagé du tableau de bord : une ligne JSON par événement dans dashboard/events.jsonl.
// Tout le monde y écrit : hooks Claude, lanceurs Gemini, serveur api/* (appels Gemini et Gradium), scripts de génération.
// Utilisation : import { log } from './log.mjs' ; ou en ligne de commande : node tools/dashboard/log.mjs '{"source":"claude",...}'
// Champs usuels : source (claude|gemini|gradium|git|humain), kind (agent|lot|generation|appel|test|fusion|decision),
//   status (en-cours|fait|echec|info), title (phrase en français clair), model, lot, ms, details.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
export const EVENTS_FILE = path.join(DASHBOARD_DIR, 'events.jsonl');

export function log(event) {
  try {
    fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
    fs.appendFileSync(EVENTS_FILE, `${JSON.stringify({ t: new Date().toISOString(), ...event })}\n`);
  } catch {
    // Le journal ne doit jamais faire échouer le travail qu'il décrit.
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && process.argv[2]) {
  log(JSON.parse(process.argv[2]));
}
