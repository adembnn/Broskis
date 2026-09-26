// Planche de comparaison : chaque capture du jeu à côté des références visuelles (art/references/)
// et de sa version en noir et blanc. Arme anti-slop : on juge l'écart avec des références réelles, pas un goût abstrait.
// Usage : node tools/planche.mjs   (après node tools/capture.mjs)   → captures/planche-XX.png
import { chromium } from 'playwright';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

const img = (f) => `data:image/${extname(f).slice(1).replace('jpg', 'jpeg')};base64,${readFileSync(f).toString('base64')}`;
const refs = existsSync('art/references') ? readdirSync('art/references').filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).slice(0, 5).map((f) => `art/references/${f}`) : [];
const caps = existsSync('captures') ? readdirSync('captures').filter((f) => /^\d+-.*\.png$/.test(f)).map((f) => `captures/${f}`) : [];
if (!caps.length) { console.log('Aucune capture : lance d\'abord node tools/capture.mjs'); process.exit(1); }
if (!refs.length) console.log('Pas de références dans art/references/ : ajoute 3 à 5 images volées (jeux, illustrations) pour comparer.');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
for (const [i, c] of caps.entries()) {
  await page.setContent(`<body style="margin:0;background:#111;color:#ccc;font:14px sans-serif;display:grid;grid-template-columns:2fr 1fr;gap:8px;padding:8px">
    <div><div>JEU — ${c}</div><img src="${img(c)}" style="width:100%"><div>VALEURS (noir et blanc)</div><img src="${img(c)}" style="width:100%;filter:grayscale(1)"></div>
    <div>${refs.map((r) => `<div>RÉF — ${r.split('/').pop()}</div><img src="${img(r)}" style="width:100%;max-height:180px;object-fit:cover">`).join('')}</div></body>`);
  await page.waitForTimeout(200);
  const out = `captures/planche-${String(i + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: out, fullPage: true });
  console.log(out);
}
await browser.close();
