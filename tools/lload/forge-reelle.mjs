// Lot LLOAD : scan RÉEL de bout en bout dans l'interface (1 appel Gemini Flash en flux + 1 sticker Nano Banana),
// captures de la forge toutes les 700 ms et chronologie des étapes vues par le joueur.
// Usage : node tools/lload/forge-reelle.mjs [photo] [url] [dossier]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const photo = process.argv[2] ?? 'public/assets/presets/garden-gnome.jpg';
const url = process.argv[3] ?? 'http://localhost:5343/';
const OUT = process.argv[4] ?? 'captures/lload/forge-reelle';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.getByRole('button', { name: 'PLAY', exact: true }).click();
await page.locator('.fighter-tile').first().click();
await page.getByText('Player 2', { exact: false }).first().waitFor();
await page.locator('.fighter-tile').nth(1).click();
await page.getByRole('button', { name: 'Snap an object' }).click();
const t0 = Date.now();
await page.locator('input[type=file]').setInputFiles(photo);
await page.locator('.lload-forge').waitFor();
const vu = [];
let last = '';
for (let i = 0; i < 40; i++) {
  const etat = await page.evaluate(() => {
    const f = document.querySelector('.lload-forge');
    return f ? `${f.getAttribute('data-step')} | ${f.querySelector('.lload-forge-name')?.textContent} | ${f.querySelector('.lload-forge-status')?.textContent}` : 'absente';
  });
  if (etat !== last) { vu.push(`${Date.now() - t0} ms : ${etat}`); last = etat; }
  if (i % 3 === 0) {
    await page.locator('.lload-forge').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/forge-${String(i).padStart(2, '0')}.png` });
  }
  if (etat.startsWith('sticker')) break;
  await page.waitForTimeout(700);
}
console.log(vu.join('\n'));
await browser.close();
