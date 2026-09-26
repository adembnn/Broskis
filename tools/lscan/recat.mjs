// Diagnostic du changement de catégorie sur la carte d'arme (lot LSCAN) : importe une photo, clique une autre
// catégorie et relève l'état de la carte chaque seconde.
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5347';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
const t0 = Date.now();
await page.goto(URL);
await page.locator('.title-play').click({ force: true, timeout: 90000 });
console.log(`titre en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.locator('.fighter-tile').nth(0).click({ force: true });
await page.locator('.fighter-tile').nth(1).click({ force: true });
await page.locator('.ready-bar:not([disabled])').click({ force: true });
await page.locator('.snap-tile').first().click({ force: true, timeout: 30000 });
await page.setInputFiles('.capture input[type=file]', resolve('captures/lscan/photos/banana.jpg'));
await page.locator('.weapon-card').first().waitFor({ timeout: 30000 });
const etat = () => page.evaluate(() => ({
  cartes: [...document.querySelectorAll('.weapon-card')].map((c) => c.querySelector('.wc-category')?.textContent),
  pills: [...document.querySelectorAll('.cat-pill')].map((p) => `${p.textContent}${p.disabled ? '*' : ''}`).join(' '),
  scans: (window.__scans || []).map((s) => `${s.object}:${s.json}`),
}));
console.log('avant', JSON.stringify(await etat()));
await page.locator('.cat-pill', { hasText: 'blaster' }).first().click({ force: true });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1000);
  console.log(`+${i + 1} s`, JSON.stringify(await etat()));
}
await page.screenshot({ path: 'captures/lscan/recat.png' });
await browser.close();
