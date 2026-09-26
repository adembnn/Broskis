import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5330/?demo=1');

  // Wait for the game to load
  await page.waitForFunction(() => window.gameHooks);

  // 1. HUD & Object Name
  await page.evaluate(async () => {
    // Use existing demo files
    const w1 = await window.gameHooks.scanObjectFromUrl('/demo-cache/objects/rubber-duck.json', { player: 0 });
    const w2 = await window.gameHooks.scanObjectFromUrl('/demo-cache/objects/ironing-board.json', { player: 1 });
    window.gameHooks.startMatch({ split: true, weapons: [[w1], [w2]] });
  });

  await page.waitForFunction(() => window.gameState && window.gameState.phase === 'fight', { timeout: 15000 });
  await page.waitForTimeout(1000); // Wait for HUD to settle
  
  if (!fs.existsSync('captures/lpolish')) fs.mkdirSync('captures/lpolish', { recursive: true });
  await page.screenshot({ path: 'captures/lpolish/1-hud.png' });
  console.log('Capture 1-hud.png done.');

  // 2. PERFECT!
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await page.evaluate(() => {
    window.ctx.bus.emit('parry:result', { player: 0, grade: 'perfect', deltaMs: 0 });
  });
  await page.waitForTimeout(200); // Banner animates, voice starts
  await page.screenshot({ path: 'captures/lpolish/2-perfect.png' });
  console.log('Capture 2-perfect.png done.');

  // Wait to avoid overlap
  await page.waitForTimeout(1500);

  // 3. KO with object
  await page.evaluate(() => {
    const w = window.gameState.players[0].weapons[0];
    window.ctx.bus.emit('hit', { target: 1, attacker: 0, weapon: w, crit: false, pos: [0,0,0], knockback: [0,0,0] });
    window.ctx.bus.emit('stock:lost', { player: 1, stocksLeft: 0, exitPos: [0,0,0], side: 'side' });
  });
  await page.waitForTimeout(400); // Banner animates, voice starts
  await page.screenshot({ path: 'captures/lpolish/3-ko.png' });
  console.log('Capture 3-ko.png done.');

  // 4. End screen
  await page.evaluate(() => {
    window.gameHooks.forcerVictoire(0);
  });
  await page.waitForFunction(() => window.gameState.phase === 'end');
  await page.waitForTimeout(500); // Wait for animations
  await page.screenshot({ path: 'captures/lpolish/4-fin.png' });
  console.log('Capture 4-fin.png done.');

  await browser.close();
})().catch(console.error);