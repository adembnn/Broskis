// Appelle directement /api/scan-object et /api/sticker du serveur de dev (vraie clé côté serveur) pour chaque
// photo, en parallèle, et garde les stickers bruts : sert à régler les prompts sans rejouer tout le parcours.
// Usage : node tools/lscan/api-check.mjs [--url http://localhost:5347] [--out captures/lscan/api] slug...
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5347');
const OUT = opt('--out', 'captures/lscan/api');
const only = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const slugs = only.length ? only : ['coffee-mug', 'banana', 'plush-toy', 'headphones', 'sneaker'];
mkdirSync(OUT, { recursive: true });

async function post(name, body) {
  const t0 = Date.now();
  const res = await fetch(`${URL}/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ms: Date.now() - t0, status: res.status, json: await res.json().catch(() => null) };
}

await Promise.all(
  slugs.map(async (slug) => {
    const file = ['jpg', 'png'].map((e) => `captures/lscan/photos/${slug}.${e}`).find(existsSync);
    const imageBase64 = readFileSync(file).toString('base64');
    const body = { imageBase64, mimeType: file.endsWith('png') ? 'image/png' : 'image/jpeg' };
    const [scan, sticker] = await Promise.all([post('scan-object', body), post('sticker', body)]);
    const j = scan.json ?? {};
    console.log(`${slug.padEnd(14)} scan ${scan.ms} ms ${j.object} -> ${j.weaponName} [${j.category}/${j.trait}] ${JSON.stringify(j.stats)} ${j.physics?.massKg} kg (Gemini ${j.geminiPhysics?.massKg} kg)${j.substituted ? ' SUBSTITUÉ' : ''}`);
    const m = /^data:image\/(\w+);base64,(.*)$/.exec(sticker.json?.dataUrl ?? '');
    if (m) writeFileSync(`${OUT}/${slug}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
    console.log(`${slug.padEnd(14)} sticker ${sticker.ms} ms ${m ? `${m[1]} ${Math.round(m[2].length * 0.75 / 1024)} Ko` : `null (${sticker.json?.reason})`}`);
  }),
);
