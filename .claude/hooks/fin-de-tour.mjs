// Hook « Stop » : à chaque fin de réponse de Claude.
// 1) vérifie que le jeu se compile (npm run build) ; sinon empêche Claude de conclure (code 2) et lui montre l'erreur.
// 2) si ça compile, fait un commit automatique des changements.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
if (input.stop_hook_active) process.exit(0); // on a déjà bloqué une fois : pas de boucle infinie

const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'pipe', encoding: 'utf8', shell: true });
const has = (f) => existsSync(join(dir, f));

if (!has('.git')) process.exit(0);
let changes = '';
try { changes = run('git status --porcelain').trim(); } catch { process.exit(0); }
if (!changes) process.exit(0); // rien n'a changé : rien à vérifier
const codeTouche = changes.split('\n').some((l) => /(src\/|index\.html|package\.json|vite\.config|public\/)/.test(l));

let pkg = {};
try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch {}
if (!pkg.scripts?.build) {
  process.stderr.write('Pas de script "build" dans package.json : impossible de vérifier que le jeu compile. Crée le projet Vite (voir LISEZMOI, étape 0).\n');
} else if (codeTouche) {
  try { run('npm run build --silent'); }
  catch (e) {
    const log = `${e.stdout || ''}\n${e.stderr || ''}`.trim().split('\n').slice(-25).join('\n');
    process.stderr.write(`Le build échoue : le jeu ne se compile plus. Corrige avant de conclure (aucun commit n'a été fait).\n${log}\n`);
    process.exit(2);
  }
}

try {
  run('git add -A');
  const files = run('git diff --cached --name-only').trim().split('\n').filter(Boolean);
  if (files.some((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.example'))) {
    run('git reset -q');
    process.stderr.write('Un fichier .env allait être commité : commit annulé. Ajoute .env au .gitignore.\n');
    process.exit(2);
  }
  const heure = new Date().toTimeString().slice(0, 5);
  const resume = files.slice(0, 3).map((f) => f.split('/').pop()).join(', ') + (files.length > 3 ? ` +${files.length - 3}` : '');
  run(`git commit -q -m "auto ${heure} : ${resume.replace(/"/g, '')}"`);
} catch (e) {
  const err = String(e.stderr || e.message);
  if (/identity|user\.email|user\.name/i.test(err)) {
    process.stderr.write('Commit automatique impossible : git ne connaît pas ton nom. Demande à l\'humain de lancer :\n  git config --global user.name "Prénom"\n  git config --global user.email "mail"\n');
    process.exit(2);
  }
  process.stderr.write(`Commit automatique impossible : ${err.slice(0, 300)}\n`);
}
process.exit(0);
