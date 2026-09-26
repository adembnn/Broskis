// ?demo=1 sans réseau (lot LSCAN) : les appels IA échouent, deux photos scannées doivent devenir le mug puis la
// peluche du cache de démo (manifest.fallback), sticker compris ; gameHooks.scan('headphones') aussi.
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:5347';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.route('**/api/scan-object', (r) => r.abort());
await page.route('**/api/sticker', (r) => r.abort());
await page.goto(`${URL}/?demo=1`);
await page.waitForFunction(() => typeof window.gameHooks?.scanObjectFromUrl === 'function', null, { timeout: 60000 });
const res = await page.evaluate(async () => {
  const out = [];
  for (const photo of ['/assets/presets/banana.jpg', '/assets/presets/stapler.jpg']) {
    const w = await window.gameHooks.scanObjectFromUrl(photo);
    out.push(`${w.name} (${w.object}, ${w.source}, sticker ${w.stickerUrl}, ${w.physics?.massKg} kg)`);
  }
  window.gameHooks.scan('headphones');
  await new Promise((r) => setTimeout(r, 500));
  return { out, scans: window.__scans };
});
console.log(res.out.join('\n'));
console.log(JSON.stringify(res.scans));
await browser.close();
