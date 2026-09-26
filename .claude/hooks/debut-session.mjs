// Hook « SessionStart » : donne à Claude l'heure, le temps restant avant le gel et l'état git.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
// Le JSON reçu par le hook contient le `cwd` réel de la session (utile dans un worktree, où
// CLAUDE_PROJECT_DIR peut pointer ailleurs) : on le préfère quand il est présent.
const dir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const now = new Date();
const JOUR = '2026-09-26'; // date du hackathon
const jourJ = now.toLocaleDateString('sv-SE') === JOUR; // format AAAA-MM-JJ, heure locale
const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d; };
const mins = (d) => Math.round((d - now) / 60000);
const fmt = (m) => (m <= 0 ? 'passé' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
let git = 'pas de dépôt git';
try {
  const n = execSync('git status --porcelain', { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim().split('\n').filter(Boolean).length;
  const last = execSync('git log -1 --format=%s', { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git = `${n} fichier(s) modifié(s) non commités · dernier commit : « ${last} »`;
} catch {}
if (!jourJ) {
  console.log(`Préparation (le hackathon est le ${JOUR}). GIT : ${git}. Pas de compte à rebours hors jour J.`);
  process.exit(0);
}
console.log([
  `HEURE : ${now.toTimeString().slice(0, 5)} · gel des fonctionnalités (18h) dans ${fmt(mins(at(18)))} · opt-in (19h) dans ${fmt(mins(at(19)))} · démo (20h) dans ${fmt(mins(at(20)))}`,
  `GIT : ${git}`,
  mins(at(18)) <= 0 ? 'APRÈS 18H : polish et sécurisation de la démo UNIQUEMENT. Refuse toute nouvelle fonctionnalité.' : 'Rappel : chaque tâche doit servir une seconde de demo/SCRIPT.md.',
].join('\n'));
