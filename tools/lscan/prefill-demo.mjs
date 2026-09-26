// Pré-remplit le cache de démo (lot LSCAN) pour les objets de demo/OBJETS.md : chaque photo passe par les VRAIS
// /api/scan-object et /api/sticker (réduite à 768 px comme dans le jeu), et le résultat est écrit dans
// public/demo-cache/objects/<slug>.json + public/demo-cache/stickers/<slug>.jpg (fond magenta, détouré en jeu).
// En ?demo=1 sans réseau, la n-ième photo scannée devient le n-ième objet de manifest.fallback (mug d'abord).
// Usage : node tools/lscan/prefill-demo.mjs [--url http://localhost:5347] [slug ...]   (photos : captures/lscan/photos)
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5347');
const ORDER = ['coffee-mug', 'plush-toy', 'headphones', 'banana', 'smartphone', 'water-bottle', 'sneaker', 'hardcover-book']; // demo/OBJETS.md : 1, 4, 8 d'abord
const only = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const slugs = only.length ? only : ORDER;
mkdirSync('public/demo-cache/stickers', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${URL}/favicon.ico`).catch(() => {});

await Promise.all(
  slugs.map(async (slug) => {
    const file = ['jpg', 'png'].map((e) => `captures/lscan/photos/${slug}.${e}`).find(existsSync);
    if (!file) return console.log(`${slug} : photo absente (tools/lscan/photos.mjs)`);
    const r = await page.evaluate(async ({ b64 }) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const s = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const body = JSON.stringify({ imageBase64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' });
      const call = (name) => fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then((x) => x.json());
      const [scan, sticker] = await Promise.all([call('scan-object'), call('sticker')]);
      return { scan, sticker };
    }, { b64: readFileSync(file).toString('base64') });
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(r.sticker?.dataUrl ?? '');
    if (!r.scan?.weaponName || !m) return console.log(`${slug} : ÉCHEC (${r.scan?.error ?? ''} ${r.sticker?.reason ?? ''})`);
    const ext = m[1] === 'png' ? 'png' : 'jpg';
    writeFileSync(`public/demo-cache/stickers/${slug}.${ext}`, Buffer.from(m[2], 'base64'));
    const s = r.scan;
    const weapon = {
      id: `demo-${slug}`, object: s.object, name: s.weaponName, category: s.category, why: s.why, stats: s.stats, trait: s.trait,
      palette: s.palette, lines: s.lines, physics: s.physics, stickerUrl: `/demo-cache/stickers/${slug}.${ext}`, source: 'cache', cooldown: 0,
    };
    writeFileSync(`public/demo-cache/objects/${slug}.json`, `${JSON.stringify(weapon, null, 2)}\n`);
    console.log(`${slug.padEnd(15)} ${s.object} -> ${s.weaponName} [${s.category}/${s.trait}] ${s.physics.massKg} kg ${JSON.stringify(s.stats)}`);
  }),
);

const manifest = JSON.parse(readFileSync('public/demo-cache/manifest.json', 'utf8'));
manifest.objects = [...new Set([...ORDER, ...manifest.objects])];
manifest.fallback = ORDER;
manifest.stickers = 'Lot LSCAN : stickers/<slug>.jpg (fond magenta, Nano Banana 2) pour les objets de demo/OBJETS.md, générés par tools/lscan/prefill-demo.mjs.';
manifest._fallback = "Lot LSCAN : en ?demo=1, si le réseau tombe pendant un scan photo, la n-ième photo devient le n-ième objet de `fallback` (ordre de demo/OBJETS.md : mug, peluche, casque d'abord).";
writeFileSync('public/demo-cache/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
