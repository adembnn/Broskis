// Planche contact : plusieurs images côte à côte dans un seul PNG (pour regarder vite, et pour le rendu du lot).
// Usage : node tools/lscan/planche.mjs <sortie.png> <largeur-case> image1 image2 ...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [out, size, ...files] = process.argv.slice(2);
const w = Number(size) || 320;
const cols = Math.min(files.length, 4);
const html = `<body style="margin:0;background:#2b1d14;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:6px;padding:6px">${files
  .map((f) => {
    const ext = f.endsWith('.png') ? 'png' : 'jpeg';
    return `<figure style="margin:0;color:#f2e6cf;font:12px sans-serif"><img style="width:${w}px;display:block" src="data:image/${ext};base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split(/[\\/]/).pop()}</figcaption></figure>`;
  })
  .join('')}</body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: cols * (w + 6) + 6, height: 200 } });
await page.setContent(html);
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
