// Robustesse du parcours d'arsenal (lot LSCAN) : 1) pas de caméra -> message clair et import possible ;
// 2) réseau lent (api/scan-object retardé de 12 s) -> arme de secours expliquée après 9 s ; 3) photo d'une vraie
// arme (couteau) -> arme de secours « Nice try ». Captures dans captures/lscan/robustesse/.
// Usage : node tools/lscan/robustesse.mjs [--url http://localhost:5347]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5347');
const OUT = 'captures/lscan/robustesse';
mkdirSync(OUT, { recursive: true });

// Aucun faux périphérique : Chromium sans caméra, comme un PC sans webcam.
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
let slow = false;
await page.route('**/api/scan-object', async (route) => {
  if (slow) await new Promise((r) => setTimeout(r, 12000));
  await route.continue().catch(() => {});
});
const log = (...a) => console.log(...a);

await page.goto(URL);
await page.locator('.title-play').click({ force: true, timeout: 60000 });
await page.locator('.fighter-tile').nth(0).click({ force: true });
await page.locator('.fighter-tile').nth(1).click({ force: true });
await page.locator('.ready-bar:not([disabled])').click({ force: true });

// 1) Pas de caméra
await page.locator('.snap-tile').first().click({ force: true, timeout: 30000 });
await page.locator('.capture-error:not([hidden])').waitFor({ timeout: 10000 });
log('1) pas de caméra :', await page.locator('.capture-error').first().textContent());
await page.screenshot({ path: `${OUT}/1-pas-de-camera.png` });

// 2) Réseau lent : l'import marche toujours, arme de secours expliquée
slow = true;
const t0 = Date.now();
await page.setInputFiles('.capture input[type=file]', resolve('captures/lscan/photos/banana.jpg'));
await page.locator('.weapon-card').first().waitFor({ timeout: 30000 });
log(`2) réseau lent : carte en ${((Date.now() - t0) / 1000).toFixed(1)} s —`, await page.locator('.weapon-confirm .capture-error').first().textContent().catch(() => '(aucune note !)'));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/2-reseau-lent.png` });
slow = false;
await page.locator('button', { hasText: /^retry$/i }).first().click({ force: true });

// 3) Vraie arme : couteau -> arme de secours « Nice try »
await page.locator('.capture').waitFor({ timeout: 10000 });
await page.setInputFiles('.capture input[type=file]', resolve('captures/lscan/photos/kitchen-knife.jpg'));
await page.locator('.weapon-card').first().waitFor({ timeout: 30000 });
log('3) couteau :', await page.locator('.weapon-confirm .capture-error').first().textContent().catch(() => '(aucune note)'), '|', await page.locator('.wc-band-name').first().textContent());
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/3-couteau.png` });
log('scans :', JSON.stringify(await page.evaluate(() => window.__scans)));
await browser.close();
