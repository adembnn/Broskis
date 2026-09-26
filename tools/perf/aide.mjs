// Coût de la bascule de la carte de commandes (src/ui/help.ts, touche H) en plein combat : temps du script +
// recalcul de style et mise en page forcés, mesurés 20 fois. Usage : node tools/perf/aide.mjs [--port 5393]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', '5393'));
const base = `http://localhost:${PORT}`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 })).newPage();
  await page.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__preload && window.__preload().rehearsalMs !== -1, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.gameHooks.startMatch({ map: 'galion', seed: 1234, split: true }));
  await page.waitForFunction(() => window.ctx.state.phase === 'fight', null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const ms = await page.evaluate(async () => {
    const out = [];
    // 2 bascules d'échauffement non comptées : la 1re touche du clavier réveille d'autres modules (son…).
    for (let i = 0; i < 2; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h' })); await new Promise((r) => setTimeout(r, 200)); }
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h' }));
      void document.body.getBoundingClientRect(); // force style + mise en page, comme l'image suivante
      out.push(performance.now() - t0);
    }
    return out;
  });
  const s = [...ms].sort((a, b) => a - b);
  console.log(`Valeurs : ${ms.map((x) => x.toFixed(1)).join(" ")}`);
  console.log(`Bascule H (20 fois) : médiane ${s[10].toFixed(2)} ms · pire ${s[19].toFixed(2)} ms · cartes .ctrl dans la page : ${await page.evaluate(() => document.querySelectorAll('.ctrl').length)}`);
} finally {
  await browser.close();
  server.kill();
}
