// Lot LLOAD : captures de la forge (scan d'un objet), de la présentation et du rideau, SANS appel IA payant :
// /api/scan-object et /api/sticker sont simulés avec des délais réalistes (1,8 s et 5 s), à partir des fichiers
// de public/demo-cache et public/test/stickers. Usage : node tools/lload/captures.mjs [url] [dossier]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5343/?demo=1';
const OUT = process.argv[3] ?? 'captures/lload';
mkdirSync(OUT, { recursive: true });

const duck = JSON.parse(readFileSync('public/demo-cache/objects/rubber-duck.json', 'utf8'));
const scanJson = { ...duck, weaponName: duck.name };
const sticker = `data:image/jpeg;base64,${readFileSync('public/test/stickers/duck-grenade.jpg').toString('base64')}`;

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.route('**/api/scan-object', async (route) => {
  await new Promise((r) => setTimeout(r, 1800));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(scanJson) });
});
await page.route('**/api/sticker', async (route) => {
  await new Promise((r) => setTimeout(r, 5000));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dataUrl: sticker, reason: null }) });
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
// La forge est sous le râtelier (l'écran d'arsenal défile) : on la ramène à l'écran avant chaque capture.
const forgeShot = async (name) => { await page.locator('.lload-forge').scrollIntoViewIfNeeded(); await shot(name); };
await page.goto(url);
await page.getByRole('button', { name: 'PLAY', exact: true }).click();
await page.locator('.fighter-tile').first().click();
await page.getByText('Player 2', { exact: false }).first().waitFor();
await page.locator('.fighter-tile').nth(1).click();

// Forge : une vraie photo importée (banane du râtelier), scan simulé.
await page.getByRole('button', { name: 'Snap an object' }).click();
await page.locator('input[type=file]').setInputFiles('public/assets/presets/banana.jpg');
await page.locator('.lload-forge').waitFor();
await page.waitForTimeout(600);
await forgeShot('forge-1-lecture');
await page.waitForTimeout(1900);
await forgeShot('forge-2-stats');
await page.waitForTimeout(3600);
await forgeShot('forge-3-sticker');
await page.getByRole('button', { name: 'Confirm', exact: true }).click();
for (let i = 0; i < 2; i++) await page.locator('.rack-tile').nth(i).click();
await page.getByRole('button', { name: 'Confirm arsenal' }).click();
for (let i = 0; i < 3; i++) await page.locator('.rack-tile').nth(i + 1).click();
await page.getByRole('button', { name: 'Confirm arsenal' }).click();

// Présentation : la carte arrive tout de suite, la réplique s'écrit.
await page.locator('.reveal-stage > *').first().waitFor();
await page.waitForTimeout(350);
await shot('presentation-1-ecriture');
await page.waitForTimeout(1500);
await shot('presentation-2-carte');
await page.getByRole('button', { name: 'Skip presentation' }).click();

// Rideau.
await page.locator('.map-tile').first().hover();
await page.waitForTimeout(800);
await page.locator('.map-tile').first().click();
await page.waitForTimeout(150);
await shot('rideau-1-fermeture');
await page.waitForTimeout(400);
await shot('rideau-2-ferme');
console.log('pastilles :', await page.evaluate(() => document.querySelector('.lload-pips')?.outerHTML));
await page.waitForTimeout(1500);
await shot('rideau-3-ouvert');
await browser.close();
