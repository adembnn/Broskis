// Même image en qualité haute puis basse (jeu figé entre les deux) : vérifie que la bascule automatique
// (src/core/quality.ts) ne change que le bloom, pas les couleurs. Sorties : tools/perf/out/qualite-<map>-*.png
// Usage : node tools/perf/compare-qualite.mjs [--map galion] [--port 5379] [--lumiere]
//   --lumiere : compare plutôt 2 piles de lumières (LA + map, actuel) et 1 seule (map, intensités ×2).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAP = opt('--map', 'galion');
const PORT = Number(opt('--port', '5379'));
const base = `http://localhost:${PORT}`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
mkdirSync('tools/perf/out', { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 })).newPage();
  await page.goto(`${base}/?demo=1&q=haute`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.gameHooks?.startMatch === 'function', null, { timeout: 120000 });
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 1234 }), MAP);
  await page.waitForFunction(() => window.ctx.state.phase === 'move', null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.ctx.loop.hitstop = 1e9; }); // gameplay figé, le rendu continue
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tools/perf/out/qualite-${MAP}-haute.png` });
  if (args.includes('--lumiere')) {
    await page.evaluate(() => {
      const scene = window.ctx.three.scene;
      const map = scene.children.find((o) => o.name?.startsWith('map-'));
      for (const o of scene.children) if (o.isLight) o.visible = false;
      map.traverse((o) => { if (o.isLight) o.intensity *= 2; });
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `tools/perf/out/qualite-${MAP}-unelumiere.png` });
    console.log(`tools/perf/out/qualite-${MAP}-haute.png / -unelumiere.png`);
  } else {
    await page.evaluate(() => window.__qualite.set('basse'));
    await page.waitForFunction(() => window.__qualite.niveau === 'basse', null, { timeout: 20000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `tools/perf/out/qualite-${MAP}-basse.png` });
    console.log(`tools/perf/out/qualite-${MAP}-haute.png / -basse.png`);
  }
} finally {
  await browser.close();
  server.kill();
}
