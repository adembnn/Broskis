import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';

const OUT = 'captures/lsmash-fx';
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(`${OUT}/${f}`);

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

let server;
const port = 5342;
const url = `http://localhost:${port}`;
if (!(await up(url))) {
  console.log('Serveur absent : lancement de Vite…');
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', port.toString(), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);
  
  // start match
  await page.evaluate(() => {
    window.gameHooks.startMatch({ map: 'archipel' });
  });
  await page.waitForTimeout(1000);
  
  // 1. Éjection (hit avec launch)
  await page.evaluate(() => {
    window.ctx.bus.emit('hit', { target: 0, attacker: 1, weapon: window.ctx.state.players[1].weapons[0], damage: 10, knockback: [0,0,0], crit: false, pos: [0, 1, 0], launch: [15, 10, 0] });
  });
  await page.waitForTimeout(50); // vrille et etincelles (speed > 12)
  await page.screenshot({ path: `${OUT}/01-ejection.png` });
  
  await page.waitForTimeout(2000); // Wait for landing / reset
  
  // 2. Zoom KO
  await page.evaluate(() => {
    window.ctx.bus.emit('hit', { target: 1, attacker: 0, weapon: window.ctx.state.players[0].weapons[0], damage: 50, knockback: [0,0,0], crit: true, pos: [2, 1, 0], willKo: true });
  });
  await page.waitForTimeout(150); // Wait 120ms freeze + some ms to see lines/flash
  await page.screenshot({ path: `${OUT}/02-zoom-ko.png` });
  await page.waitForTimeout(1000);
  
  // 3. Explosion de sortie (stock:lost side)
  await page.evaluate(() => {
    window.ctx.bus.emit('stock:lost', { player: 0, stocksLeft: 1, exitPos: [-12, 1, 0], side: 'side' });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/03-stock-lost-side.png` });
  
  await page.waitForTimeout(1000);
  
  // 3b. Star KO (stock:lost top)
  await page.evaluate(() => {
    // Need a player alive for this to visually work or just emit event
    window.ctx.bus.emit('respawn', { player: 1, pos: [0, 5, 0] });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.ctx.bus.emit('stock:lost', { player: 1, stocksLeft: 0, exitPos: [0, 15, 0], side: 'top' });
  });
  await page.waitForTimeout(500); // 0.5s into star KO
  await page.screenshot({ path: `${OUT}/04-star-ko.png` });
  
  await page.waitForTimeout(1000);
  
  // 4. Réapparition (respawn)
  await page.evaluate(() => {
    window.ctx.bus.emit('respawn', { player: 0, pos: [-2, 0.2, -2] });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/05-respawn.png` });
  
  await page.waitForTimeout(1000);
  
  // 5. Ledge grab
  await page.evaluate(() => {
    window.ctx.bus.emit('ledge:grab', { player: 0, pos: [-4, -0.5, 0] });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/06-ledge-grab.png` });
  
  await page.waitForTimeout(1000);
  
  // 6. BRO SMASH
  await page.evaluate(() => {
    window.ctx.bus.emit('super:fire', { player: 0 });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/07-bro-smash.png` });
  
  await page.waitForTimeout(1000);
  
  // 7. GAME!
  await page.evaluate(() => {
    window.ctx.bus.emit('match:banner', { kind: 'game' });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/08-game-banner.png` });
  
  // Create Planche
  await page.setContent('<body style="margin:0;background:#111;color:#ccc;font:14px sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">' +
    [1,2,3,4,5,6,7,8].map(i => {
      const f = readdirSync(OUT).find(x => x.startsWith('0'+i));
      if (!f) return '';
      return '<div><div>' + f + '</div><img src="http://localhost:' + port + '/../captures/lsmash-fx/' + f + '" style="width:100%"></div>';
    }).join('') +
  '</body>');
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/planche.png', fullPage: true });
  console.log('Planche created at captures/lsmash-fx/planche.png');
  
} catch (e) {
  console.error(e);
} finally {
  await context.close();
  await browser.close();
  if (server) {
    server.kill();
  }
}
