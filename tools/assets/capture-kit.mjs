// Capture la page d'aperçu du kit d'arène (public/arena-kit.html) : vue « arène » et vue « pièces ».
// Lance son PROPRE serveur Vite sur un port libre 5300-5399 et n'arrête que celui-là.
// Usage : node tools/assets/capture-kit.mjs [--out captures/lkit] [--vues arene,kit] [--suffixe -v2]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'captures/lkit');
const VUES = opt('--vues', 'arene-archipel,arene-galion,arene-cuisine,kit').split(',');
const SUFFIXE = opt('--suffixe', '');
mkdirSync(OUT, { recursive: true });

const libre = (p) => new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(false)); s.listen(p, '127.0.0.1', () => s.close(() => ok(true))); });
let port = 5300;
while (port < 5400 && !(await libre(port))) port++;
const serveur = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
console.log(`Vite PID ${serveur.pid} sur le port ${port}`);
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/arena-kit.html')).ok) break; } catch { /* pas encore prêt */ } await new Promise((r) => setTimeout(r, 500)); }

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  for (const vue of VUES) {
    const [v, map, cam] = vue.split('-'); // « arene-galion-basse » -> ?vue=arene&map=galion&cam=basse
    await page.goto(`${base}/arena-kit.html?vue=${v}${map ? `&map=${map}` : ''}${cam ? `&cam=${cam}` : ''}&fixe=1`);
    await page.waitForFunction(() => window.kitPret === true, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => window.kitInfo());
    const nom = vue;
    await page.screenshot({ path: `${OUT}/${nom}${SUFFIXE}.png` });
    console.log(`${OUT}/${nom}${SUFFIXE}.png · appels de dessin ${info.appels} · triangles ${info.triangles}`);
  }
  if (erreurs.length) console.log('Erreurs :', erreurs.join('\n'));
} finally {
  await browser.close();
  serveur.kill();
}
