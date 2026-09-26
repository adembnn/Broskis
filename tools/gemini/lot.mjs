// Fait exécuter un lot (plan/lots/*.md) ou un agent (.claude/agents/*.md) par Gemini CLI, avec le meilleur modèle,
// dans une copie séparée du dépôt (worktree), et journalise tout dans le tableau de bord.
//   node tools/gemini/lot.mjs lot   <ID> <plan/lots/fichier.md>      → branche gem/<ID>, à fusionner par Claude
//   node tools/gemini/lot.mjs agent <role> [consigne en plus]        → rapport copié dans reports/<role>-<HHhMM>.md
// La clé vient du .env du dépôt principal : Gemini CLI remonte les dossiers parents et le trouve lui-même.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, DASHBOARD_DIR } from '../dashboard/log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = process.env.GEMINI_LOT_MODEL || 'gemini-3.1-pro-preview-customtools'; // choix par défaut de Google pour les agents de code
const [mode, id, arg] = process.argv.slice(2);
if (!['lot', 'agent'].includes(mode) || !id) {
  console.error('Usage : node tools/gemini/lot.mjs lot <ID> <plan/lots/x.md> | agent <role> [consigne]');
  process.exit(1);
}

const heure = new Date().toTimeString().slice(0, 5).replace(':', 'h');
const nom = mode === 'lot' ? `gem-${id}` : `gem-${id}-${heure}`;
const wt = path.join(ROOT, '.claude', 'worktrees', nom);
const branche = mode === 'lot' ? `gem/${id}` : `gem/agent-${id}-${heure}`;
const sh = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });

const REGLES = `Règles communes (non négociables) :
- Tu es dans une copie séparée du dépôt (worktree git) sur la branche ${branche}. Le projet : jeu web 3D « Broskis » (Vite + TypeScript + three.js + Rapier), hackathon Voodoo × Google DeepMind aujourd'hui.
- Lis d'abord CLAUDE.md, plan/README.md et src/core/types.ts + src/core/events.ts (contrats partagés).
- Tout le texte affiché dans le jeu est en ANGLAIS. Code et commentaires en français, courts.
- Ne touche QUE les chemins que ta consigne t'attribue. N'installe AUCUN paquet npm (dis-le dans ton rendu s'il t'en faut un).
- Ne lis jamais le fichier .env et n'affiche jamais une clé.
- Avant de rendre : \`npm run build\` doit passer.
- Commite tes fichiers en les nommant un par un (jamais git add -A), message en français clair terminé par la ligne « Co-Authored-By: Gemini <noreply@google.com> ». Ne pousse pas.
- Écris ton rendu dans plan/rendus/${id}.md (fait avec chemins et hash · pas fait et pourquoi · décisions prises seul · frictions) et commite-le aussi.`;

let prompt;
if (mode === 'lot') {
  const lotFile = path.join(ROOT, arg);
  if (!fs.existsSync(lotFile)) { console.error(`Lot introuvable : ${arg}`); process.exit(1); }
  prompt = `Tu fais le lot ${id} décrit dans ${arg} (lis-le en entier : c'est ta consigne).\n\n${REGLES}`;
} else {
  const agentFile = path.join(ROOT, '.claude', 'agents', `${id}.md`);
  if (!fs.existsSync(agentFile)) { console.error(`Agent introuvable : ${id}`); process.exit(1); }
  const corps = fs.readFileSync(agentFile, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  prompt = `Tu joues l'agent « ${id} » du harnais. Sa fiche :\n\n${corps}\n\n${arg ? `Consigne en plus : ${arg}\n\n` : ''}Tu ne modifies PAS le code du jeu. Tu peux lancer le jeu, les outils (npm run captures, npm run anim -- --no-gemini, node tools/*.mjs) et écrire des scripts de test dans reports/tmp/. Écris ton rapport complet dans reports/${id}-${heure}.md (en français, preuves à l'appui : fichier:ligne, capture, mesure).`;
}

// 1) Copie de travail + dépendances.
if (!fs.existsSync(wt)) sh(`git worktree add -q "${wt}" -b ${branche} HEAD`);
fs.mkdirSync(path.join(wt, 'plan', 'rendus'), { recursive: true });
fs.mkdirSync(path.join(wt, 'reports', 'tmp'), { recursive: true });
if (!fs.existsSync(path.join(wt, 'node_modules'))) sh('npm ci --silent --no-audit --no-fund', wt);

// 2) Gemini CLI en mode automatique, sortie en flux JSON conservée pour le tableau de bord.
fs.mkdirSync(path.join(DASHBOARD_DIR, 'logs'), { recursive: true });
const fluxFile = path.join(DASHBOARD_DIR, 'logs', `${nom}.jsonl`);
const t0 = Date.now();
log({ source: 'gemini', kind: mode, status: 'en-cours', lot: id, model: MODEL, title: mode === 'lot' ? `Gemini code le lot ${id}` : `Gemini joue l'agent ${id}`, branche, flux: path.relative(ROOT, fluxFile) });
const flux = fs.createWriteStream(fluxFile);
const child = spawn('gemini', ['--skip-trust', '--approval-mode', 'yolo', '-m', MODEL, '-o', 'stream-json', '-p', prompt], {
  cwd: wt, shell: true, env: { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: 'true' },
});
child.stdout.pipe(flux);
child.stderr.on('data', (d) => flux.write(JSON.stringify({ type: 'stderr', text: String(d) }) + '\n'));
child.on('close', (code) => {
  const minutes = ((Date.now() - t0) / 60000).toFixed(1);
  let resume = '';
  try { resume = sh(`git log --oneline HEAD ^main`, wt).trim(); } catch {}
  if (mode === 'agent') {
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    for (const f of fs.readdirSync(path.join(wt, 'reports')).filter((x) => x.endsWith('.md'))) {
      fs.copyFileSync(path.join(wt, 'reports', f), path.join(ROOT, 'reports', f));
    }
  }
  log({ source: 'gemini', kind: mode, status: code === 0 ? 'fait' : 'echec', lot: id, model: MODEL, ms: Date.now() - t0, title: `${mode === 'lot' ? `Lot ${id}` : `Agent ${id}`} terminé par Gemini en ${minutes} min${code ? ` (code ${code})` : ''}`, commits: resume.split('\n').filter(Boolean).length });
  console.log(`[${nom}] fin, code ${code}, ${minutes} min\n${resume}`);
  process.exit(code ?? 0);
});
