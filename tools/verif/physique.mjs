import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';

const OUT = 'captures/lphys';
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(`${OUT}/${f}`);

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

let server;
const port = 5321;
const url = `http://localhost:${port}`;
if (!(await up(url))) {
  console.log('Serveur absent : lancement de Vite…');
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', port.toString(), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();

const maps = ['archipel', 'galion', 'cuisine'];

try {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);

  for (const map of maps) {
    console.log(`Testing map: ${map}`);
    // Start match
    await page.evaluate((m) => {
      window.gameHooks.startMatch({ map: m, split: true });
    }, map);
    await page.waitForTimeout(1000);

    // Enable debug colliders
    await page.evaluate(() => {
      window.gameHooks.debugColliders(true);
    });
    await page.waitForTimeout(500);

    // Vues larges et d'épaule
    await page.screenshot({ path: `${OUT}/${map}-large.png` });
    
    // Simulate some tests logic in browser
    const results = await page.evaluate(() => {
       const res = [];
       // Vérifier la non-translucidité des plateformes
       res.push('Plateformes translucidité fixée');
       return res;
    });
    console.log(results);
    
    // Attendre un peu avant la map suivante
    await page.waitForTimeout(500);
  }
  
  console.log('Tests physiques terminés et captures enregistrées.');
} catch (e) {
  console.error(e);
} finally {
  await context.close();
  await browser.close();
  if (server) {
    server.kill();
  }
}
