// Ouvre le jeu dans Chrome sur la carte NVIDIA (lot LPERF). Sur ce PC portable, Chrome choisit tout seul la
// puce Intel intégrée : 12 à 28 i/s au lieu de 85 à 130 (mesures dans plan/rendus/LPERF.md).
// Usage : npm run demo:chrome [-- URL]   (défaut http://localhost:4173/?demo=1, attend que le serveur réponde)
// Profil Chrome séparé (dossier broskis-chrome) : sinon, si Chrome est déjà ouvert, le drapeau est ignoré.
// Solution durable sans ce script : Paramètres Windows > Affichage > Graphiques > Chrome > Hautes performances.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:4173/?demo=1';
const local = process.env.LOCALAPPDATA || '';
const candidats = [
  join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];
const exe = candidats.find((c) => existsSync(c));
if (!exe) { console.error('Chrome introuvable : ouvre le jeu à la main (voir le réglage Windows ci-dessus).'); process.exit(1); }

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
for (let i = 0; i < 120 && !(await up(url)); i++) {
  if (i === 0) console.log(`En attente de ${url} (lance « npm run demo » dans un autre terminal)…`);
  await new Promise((r) => setTimeout(r, 1000));
}

const args = [
  '--force_high_performance_gpu', // la carte NVIDIA plutôt que la puce Intel
  '--ignore-gpu-blocklist',
  `--user-data-dir=${join(local || '.', 'broskis-chrome')}`,
  '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', // voix de l'animateur dès la 1re réplique
  '--start-maximized', `--app=${url}`,
];
spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
console.log(`Chrome ouvert sur la carte NVIDIA : ${url}\nVérifier : chrome://gpu doit afficher « NVIDIA » dans GL_RENDERER. F11 = plein écran.`);
