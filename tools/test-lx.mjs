import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  if (!fs.existsSync('captures/lx')) {
    fs.mkdirSync('captures/lx', { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5300/?demo=1');
  
  // Attendre le chargement (par exemple la création de window.gameHooks)
  await page.waitForFunction(() => window.gameHooks !== undefined);
  
  // Lancer le match
  await page.evaluate(() => {
    window.gameHooks.startMatch({ vsAI: true, difficulty: 'hard', map: 'archipel' });
  });
  
  console.log("Match started vs AI");
  
  // Attendre le tour 1 (joueur humain)
  await page.waitForFunction(() => window.gameState.turn === 1 && window.gameState.active === 0, { timeout: 5000 });
  console.log("Turn 1 - Human");
  
  let parries = 0;
  page.on('console', msg => {
    if (msg.text().includes('parry:result')) parries++;
  });
  
  // Humain joue
  await page.evaluate(() => {
    window.gameHooks.move(1, 0);
    window.gameHooks.pickWeapon(0);
    window.gameHooks.aim(90, 0);
    window.gameHooks.fire(0.5);
  });
  
  // Wait for AI to play and finish its turn (turn 2)
  await page.waitForFunction(() => window.gameState.turn === 2 && window.gameState.active === 1, { timeout: 10000 });
  console.log("Turn 2 - AI started");
  
  // Wait for taunt bubble
  await page.waitForTimeout(600); 
  await page.screenshot({ path: 'captures/lx/taunt-bubble.png' });
  console.log("Captured taunt bubble");

  await page.waitForTimeout(1000); // Wait for aim
  await page.screenshot({ path: 'captures/lx/aiming.png' });
  console.log("Captured aiming");

  // Wait for Human turn (turn 3)
  await page.waitForFunction(() => window.gameState.turn === 3 && window.gameState.active === 0, { timeout: 15000 });
  console.log("Turn 3 - Human started");
  
  await page.evaluate(() => {
    window.gameHooks.move(1, 0);
    window.gameHooks.pickWeapon(0);
    window.gameHooks.aim(90, 0);
    window.gameHooks.fire(0.5);
  });
  
  // Wait for AI to play and finish its turn (turn 4)
  await page.waitForFunction(() => window.gameState.turn === 4 && window.gameState.active === 1, { timeout: 10000 });
  console.log("Turn 4 - AI started");
  
  // Wait for Human turn (turn 5)
  await page.waitForFunction(() => window.gameState.turn === 5 && window.gameState.active === 0, { timeout: 15000 });
  console.log("Turn 5 - Human started");
  
  await browser.close();
  console.log("Test passed!");
})().catch(err => {
  console.error(err);
  process.exit(1);
});