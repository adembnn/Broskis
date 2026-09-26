// Capture du labo du scan (public/scan-lab.html) avec deux photos, pour vérifier la page de bout en bout.
// Usage : node tools/lscan/lab-shot.mjs <photoA> <photoB> [--url http://localhost:5347] [--out captures/lscan/lab.png]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5347');
const OUT = opt('--out', 'captures/lscan/lab.png');
const photos = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1250 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
await page.goto(`${URL}/scan-lab.html`);
await page.waitForSelector('#slot0');
for (const p of photos) {
  await page.setInputFiles('#file', p);
  await page.waitForTimeout(400);
}
const t0 = Date.now();
await page.waitForFunction(() => document.querySelectorAll('.vis img[src^="blob:"]').length >= 4 || Date.now() < 0, null, { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT, fullPage: true });
console.log(`${OUT} (${Date.now() - t0} ms)`, erreurs.length ? erreurs : 'aucune erreur');
await browser.close();
