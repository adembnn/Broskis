// Poids téléchargé avant le 1er match (lot LPERF) : ce qu'un juré télécharge sur la connexion de la salle.
// Build de production servi par `vite preview` (faire `npx vite build` avant), cache désactivé, profil neuf.
// Compte chaque réponse réseau (octets reçus) par type : à l'écran-titre (préchargements compris), puis jusqu'au
// 1er moment jouable du match. Usage : node tools/perf/poids.mjs [--port 5391] [--titre 10] [--map archipel]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', '5391'));
const TITRE_S = Number(opt('--titre', '10'));
const MAP = opt('--map', 'archipel');
const base = `http://localhost:${PORT}`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));

const type = (url, mime) => {
  const u = url.split('?')[0].toLowerCase();
  if (/\.(js|mjs)$/.test(u)) return 'js';
  if (/\.(glb|gltf|bin)$/.test(u)) return 'modèles 3D';
  if (/\.(mp3|ogg|wav|m4a|webm|opus)$/.test(u) || mime?.startsWith('audio')) return 'audio';
  if (/\.(png|jpe?g|webp|ktx2|svg|avif)$/.test(u) || mime?.startsWith('image')) return 'images';
  if (/\.(woff2?|ttf|otf)$/.test(u) || u.includes('fonts.g')) return 'polices';
  if (/\.json$/.test(u)) return 'json';
  if (u.includes('/api/')) return 'api';
  return 'autre';
};

const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu'] });
try {
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const req = new Map();
  let phase = 'titre';
  const total = { titre: {}, match: {} };
  const gros = [];
  cdp.on('Network.responseReceived', (e) => req.set(e.requestId, { url: e.response.url, mime: e.response.mimeType }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = req.get(e.requestId);
    if (!r) return;
    const t = type(r.url, r.mime);
    const tab = total[phase];
    tab[t] = (tab[t] || 0) + e.encodedDataLength;
    gros.push([e.encodedDataLength, r.url.replace(base, ''), phase]);
  });
  const t0 = Date.now();
  await page.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.gameHooks?.startMatch === 'function', null, { timeout: 120000 });
  const pretMs = Date.now() - t0;
  await page.waitForTimeout(TITRE_S * 1000);
  phase = 'match';
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 1234, split: true }), MAP);
  await page.waitForFunction(() => ['move', 'fight', 'countdown'].includes(window.ctx.state.phase), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const mo = (o) => Math.round(o / 1e4) / 100;
  const somme = (t) => Object.values(t).reduce((a, b) => a + b, 0);
  console.log(`Page prête (jeu démarré) en ${pretMs} ms`);
  for (const ph of ['titre', 'match']) {
    console.log(`\n${ph === 'titre' ? `Écran-titre (${TITRE_S} s, préchargements compris)` : 'Du lancement du match au 1er moment jouable'} : ${mo(somme(total[ph]))} Mo`);
    for (const [k, v] of Object.entries(total[ph]).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${mo(v)} Mo`);
  }
  console.log(`\nTotal avant de jouer : ${mo(somme(total.titre) + somme(total.match))} Mo`);
  const vus = new Map();
  for (const [o, u] of gros) { const e = vus.get(u) || { n: 0, o: 0 }; e.n++; e.o += o; vus.set(u, e); }
  const doublons = [...vus.entries()].filter(([, e]) => e.n > 1).sort((a, b) => b[1].o - a[1].o);
  console.log(`\nTéléchargés plusieurs fois : ${doublons.length} fichiers, ${mo(doublons.reduce((a, [, e]) => a + (e.o * (e.n - 1)) / e.n, 0))} Mo en trop`);
  for (const [u, e] of doublons.slice(0, 8)) console.log(`  ${e.n}×  ${mo(e.o / e.n)} Mo  ${u}`);
  console.log('\nLes 12 plus gros fichiers :');
  for (const [o, u, ph] of gros.sort((a, b) => b[0] - a[0]).slice(0, 12)) console.log(`  ${String(mo(o)).padStart(6)} Mo  ${u} (${ph})`);
} finally {
  await browser.close();
  server.kill();
}
