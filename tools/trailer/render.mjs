// Rendu du trailer image par image, sans enregistrement en temps réel (le conteneur ne rend que ~3 i/s).
// Usage : node tools/trailer/render.mjs [--cut 60|15] [--fps 30|60] [--workers 3] [--shots 0-5]
//                                        [--out captures/trailer] [--no-audio] [--keep-frames]
//                                        [--sample] [--mux-only] [--dev]
//   --sample   : planche seulement (image du milieu de chaque plan), en 2-3 min
//   --mux-only : garde les images déjà rendues (--keep-frames) et refait seulement la bande-son + la vidéo
//   --dev      : rend depuis le serveur Vite de dev (par défaut : build + `vite preview`, insensible aux
//                modifications du code pendant le rendu)
// 1. lance Vite si besoin ; 2. répartit les plans entre plusieurs onglets Chromium ; chaque onglet ouvre
//    `?demo=1&trailer=<cut>` et avance l'horloge virtuelle (virtual-time.js) d'une image à la fois ;
// 3. le jeu dit quelles images garder (window.trailer.capture) ; 4. ffmpeg assemble les JPEG + la bande-son.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planFrames } from '../../src/trailer/timeline.js';
import { renderSoundtrack } from './music.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CUT = opt('--cut', '60');
const FPS = Number(opt('--fps', '30'));
const WORKERS = Math.max(1, Number(opt('--workers', '3')));
const OUT = resolve(ROOT, opt('--out', 'captures/trailer'));
const PX = opt('--px', ''); // brouillon : --px 0.5 (3D en demi-résolution)
// Fenêtre 1280×720 rendue à ×1,5 : vraie image 1920×1080, mais bien moins chère à rendre et à capturer
// qu'une fenêtre 1920×1080 à ×1 (mesuré : 0,77 s par image contre 1,46 s).
const WIDTH = 1280;
const HEIGHT = 720;
const SCALE = 1.5;
const SAMPLE = args.includes('--sample'); // planche seulement : l'image du milieu de chaque plan
const DEV = args.includes('--dev');
const MUX_ONLY = args.includes('--mux-only');
const PORT = DEV ? 5173 : 4174;
const BASE = `http://localhost:${PORT}/`;

const plan = planFrames(CUT, FPS);
const [firstShot, lastShot] = (opt('--shots', `0-${plan.length - 1}`)).split('-').map(Number);
const frameDir = join(OUT, `frames-${CUT}`);
mkdirSync(frameDir, { recursive: true });
if (!args.includes('--resume') && !MUX_ONLY) for (const f of readdirSync(frameDir)) rmSync(join(frameDir, f));

function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, '/tmp/claude-0/trailer-scratch/node_modules/ffmpeg-static/ffmpeg'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  throw new Error('ffmpeg introuvable : installe-le ou mets son chemin dans FFMPEG_PATH (ex. `npm i ffmpeg-static` dans un dossier hors dépôt).');
}

function findChromium() {
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return undefined; // navigateur installé par Playwright
}

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

let server;
if (!MUX_ONLY) {
  if (!DEV) {
    console.log('Build du jeu (vite build)…');
    const b = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-trailer', '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
    if (b.status !== 0) { console.error(b.stderr.slice(-1500)); process.exit(1); }
  }
  if (!(await up(BASE))) {
    console.log(DEV ? 'Lancement de Vite (dev)…' : 'Lancement de vite preview…');
    const cmd = DEV ? ['--port', String(PORT), '--strictPort'] : ['preview', '--outDir', 'dist-trailer', '--port', String(PORT), '--strictPort'];
    server = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), ...cmd], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await up(BASE)); i++) await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = MUX_ONLY ? null : await chromium.launch({
  executablePath: findChromium(),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default', '--autoplay-policy=no-user-gesture-required'],
});
const initScript = readFileSync(join(HERE, 'virtual-time.js'), 'utf8');
// ignoreHTTPSErrors : derrière un proxy d'entreprise/cloud, la police Google passe par un certificat maison.
const CONTEXT = { viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE, ignoreHTTPSErrors: true };

const wanted = plan.filter((s) => s.index >= firstShot && s.index <= lastShot);
const totalFrames = wanted.reduce((n, s) => n + (s.end - s.start), 0);
const events = [];
const t0 = Date.now();

if (!MUX_ONLY) { // ------------------------------------------------------------------ rendu des images
// Échauffement : au premier chargement, Vite pré-compile ses dépendances et invalide les onglets déjà ouverts
// (erreur 504 « Outdated Optimize Dep »). Un seul onglet d'abord, jusqu'à ce que le jeu soit prêt.
{
  const warm = await browser.newContext(CONTEXT);
  const p = await warm.newPage();
  await p.goto(`${BASE}?demo=1&trailer=${CUT}&fps=${FPS}&shots=0-0`, { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.trailer?.ready === true, null, { timeout: 120000 }).catch(() => {});
  await warm.close();
}

// Répartition : des paquets de plans contigus, équilibrés par nombre d'images.
const batches = [];
let current = [];
let acc = 0;
for (const s of wanted) {
  current.push(s);
  acc += s.end - s.start;
  if (acc >= totalFrames / WORKERS && batches.length < WORKERS - 1) { batches.push(current); current = []; acc = 0; }
}
if (current.length) batches.push(current);

let done = 0;

async function runBatch(shots, n) {
  const context = await browser.newContext(CONTEXT);
  await context.addInitScript(initScript);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  page.on('pageerror', (e) => console.error(`[onglet ${n}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[onglet ${n}] ${m.text().slice(0, 300)}`); });
  const range = `${shots[0].index}-${shots[shots.length - 1].index}`;
  await page.goto(`${BASE}?demo=1&trailer=${CUT}&fps=${FPS}&shots=${range}${PX ? `&px=${PX}` : ''}${SAMPLE ? '&sample=1' : ''}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.trailer?.ready === true, null, { timeout: 90000 });
  await page.evaluate(() => window.__vt.freeze());
  const step = 1000 / FPS;
  for (let guard = 0; guard < 200000; guard++) {
    const s = await page.evaluate(async (ms) => {
      await window.__vt.step(ms);
      const t = window.trailer;
      return { capture: t.capture, frame: t.frame, done: t.done };
    }, step);
    if (s.capture) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: SCALE } });
      writeFileSync(join(frameDir, `${String(s.frame).padStart(6, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      done++;
      if (done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${totalFrames} images · ${(done / el).toFixed(1)} i/s · reste ~${Math.round((totalFrames - done) / (done / el))} s`);
      }
    }
    if (s.done) break;
  }
  events.push(...(await page.evaluate(() => window.trailer.events)));
  await context.close();
}

try {
  await Promise.all(batches.map((b, i) => runBatch(b, i)));
} finally {
  await browser.close();
  server?.kill();
}
} // fin du rendu des images

if (SAMPLE) {
  const ffmpegS = findFfmpeg();
  const files = readdirSync(frameDir).filter((f) => f.endsWith('.jpg')).sort();
  const list = join(OUT, 'planche-liste.txt');
  writeFileSync(list, files.map((f) => `file '${join(frameDir, f)}'`).join('\n'));
  const cols = 6;
  const rows = Math.ceil(files.length / cols);
  const sheetPath = join(OUT, `planche-${CUT}-plans${firstShot}-${lastShot}.jpg`);
  spawnSync(ffmpegS, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=4:color=black`, '-frames:v', '1', '-q:v', '3', sheetPath], { stdio: 'ignore' });
  console.log(`Planche : ${sheetPath} (${files.length} plans)`);
  process.exit(0);
}
if (MUX_ONLY) events.push(...JSON.parse(readFileSync(join(OUT, `events-${CUT}.json`), 'utf8')).events);
events.sort((a, b) => a.frame - b.frame);
if (!MUX_ONLY) writeFileSync(join(OUT, `events-${CUT}.json`), JSON.stringify({ fps: FPS, events }, null, 1));
const got = readdirSync(frameDir).filter((f) => f.endsWith('.jpg')).length;
console.log(`Images : ${got} (attendu ${totalFrames}) en ${Math.round((Date.now() - t0) / 1000)} s`);

// Bande-son : musique générée + voix + bruitages posés sur les événements réels du rendu.
const ffmpeg = findFfmpeg();
const firstFrame = wanted[0].start;
const audioPath = join(OUT, `soundtrack-${CUT}.wav`);
if (!args.includes('--no-audio')) {
  renderSoundtrack({ cut: CUT, fps: FPS, events, out: audioPath, fromFrame: firstFrame, toFrame: wanted[wanted.length - 1].end, root: ROOT });
}
const video = join(OUT, `broskis-trailer-${CUT}${firstShot > 0 || lastShot < plan.length - 1 ? `-plans${firstShot}-${lastShot}` : ''}.mp4`);
const ff = [
  '-y', '-framerate', String(FPS), '-start_number', String(firstFrame), '-i', join(frameDir, '%06d.jpg'),
  ...(args.includes('--no-audio') ? [] : ['-i', audioPath]),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  ...(args.includes('--no-audio') ? [] : ['-c:a', 'aac', '-b:a', '256k', '-shortest']),
  '-movflags', '+faststart', video,
];
const enc = spawnSync(ffmpeg, ff, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
if (enc.status !== 0) { console.error(enc.stderr.slice(-2000)); process.exit(1); }
// Planche contact : 1 image par plan (milieu du plan), pour les agents critiques.
const sheet = join(OUT, `planche-${CUT}.jpg`);
const mids = wanted.map((s) => Math.floor((s.start + s.end) / 2) - firstFrame);
const select = mids.map((m) => `eq(n\\,${m})`).join('+');
const cols = Math.min(6, mids.length);
const rows = Math.ceil(mids.length / cols);
spawnSync(ffmpeg, ['-y', '-i', video, '-vf', `select=${select},scale=480:-1,tile=${cols}x${rows}:padding=4:color=black`, '-fps_mode', 'passthrough', '-frames:v', '1', '-q:v', '3', sheet], { stdio: 'ignore' });
console.log(`Vidéo : ${video}\nPlanche : ${sheet}`);
if (!args.includes('--keep-frames') && !args.includes('--resume')) rmSync(frameDir, { recursive: true, force: true });
