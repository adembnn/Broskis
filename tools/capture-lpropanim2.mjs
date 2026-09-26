import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = 'captures/lpropanim2';
mkdirSync(OUT, { recursive: true });

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server;
if (!(await up('http://localhost:5305'))) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5305', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up('http://localhost:5305')); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();

async function runMapTest(mapId) {
  console.log('Testing map:', mapId);
  await page.goto('http://localhost:5305?demo=1', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  
  await page.evaluate((m) => {
    window.gameHooks.startMatch({ map: m, split: true });
  }, mapId);
  
  await page.waitForFunction(() => window.gameState?.phase === 'fight', null, { timeout: 8000 });
  await page.waitForTimeout(1000);

  // Tonneau touché (on tire dessus, il y a forcément des props au milieu)
  await page.evaluate(() => {
     window.gameHooks.aim?.(90, 0); 
     window.gameHooks.fire?.(1); 
  });
  
  const delaysHit = [50, 100, 150, 300];
  let t = 0;
  for (const d of delaysHit) {
    await page.waitForTimeout(d - t);
    t = d;
    await page.screenshot({ path: `${OUT}/${mapId}-tonneau-touche-${d}ms.png` });
  }

  await page.waitForTimeout(1000);

  // Joueur court dans une caisse (avance tout droit)
  await page.evaluate(() => window.gameHooks.input?.(0, 'up', true));
  
  const delaysRun = [50, 100, 150, 300];
  t = 0;
  for (const d of delaysRun) {
    await page.waitForTimeout(d - t);
    t = d;
    await page.screenshot({ path: `${OUT}/${mapId}-joueur-court-${d}ms.png` });
  }
  
  await page.evaluate(() => window.gameHooks.input?.(0, 'up', false));
}

try {
  await runMapTest('archipel');
  await runMapTest('cuisine');
} catch (e) {
  console.error(e);
} finally {
  await browser.close();
  if (server) server.kill();
}
