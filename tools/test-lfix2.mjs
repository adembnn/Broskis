import { chromium } from 'playwright';
import fs from 'fs';

const mapNames = ['archipel', 'galion', 'cuisine'];

(async () => {
  if (!fs.existsSync('captures/lfix2')) {
    fs.mkdirSync('captures/lfix2', { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  const runTest = async (mapIndex, vsAi) => {
    const map = mapNames[mapIndex];
    console.log(`Starting run for map: ${map}, vsAi: ${vsAi}`);
    await page.goto('http://localhost:5350/?demo=1'); 
    
    // Wait for the game to be loaded
    await page.waitForFunction(() => window.gameHooks !== undefined);
    
    // Bypass UI completely
    await page.evaluate(({ mapId, isAi }) => {
      window.gameHooks.startMatch({ map: mapId, vsAI: isAi, difficulty: 'medium' });
    }, { mapId: map, isAi: vsAi });
    
    console.log("Match started, waiting for Turn 1...");
    await page.waitForFunction(() => window.gameState && window.gameState.turn === 1);
    
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `captures/lfix2/${map}${vsAi ? '-vsai' : ''}-deplacement.png` });
    
    await page.evaluate(() => {
      window.gameHooks.move(1, 0);
      window.gameHooks.pickWeapon(0);
      window.gameHooks.aim(90, 0);
      window.gameHooks.fire(0.5);
    });
    
    await page.waitForTimeout(350); 
    await page.screenshot({ path: `captures/lfix2/${map}${vsAi ? '-vsai' : ''}-bascule.png` });
    
    console.log("Waiting for Turn 2...");
    await page.waitForFunction(() => window.gameState.turn === 2);
    
    await page.waitForTimeout(200);
    await page.screenshot({ path: `captures/lfix2/${map}${vsAi ? '-vsai' : ''}-impact.png` });
  };

  for (let i = 0; i < 3; i++) {
    await runTest(i, false);
  }
  await runTest(0, true);

  console.log("Test finished.");
  if (errors.length > 0) {
    console.error("Encountered errors:");
    errors.forEach(e => console.error(e));
    fs.writeFileSync('captures/lfix2/errors.txt', errors.join('\n'));
  }
  await browser.close();
})();
