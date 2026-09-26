// Banc de la physique scannée (lot LSCAN) : chaque photo réelle d'Adem (tools/scan-bench/photos/objets/, dossier
// local ignoré par git) passe par le VRAI /api/scan-object (réduite à 768 px comme dans le jeu), puis est comparée
// à la vérité terrain tools/scan-bench/attendus.json (masse, taille, matière, forme, fragile, liquide, catégorie).
// Usage : node tools/lscan/bench-physique.mjs [--url http://localhost:5347] [--photos <dossier>]
import { chromium } from 'playwright';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5347');
// Le dossier local d'Adem vit dans le dépôt principal (les copies de travail n'ont pas les fichiers ignorés).
const candidates = [opt('--photos', ''), 'tools/scan-bench/photos/objets', '../../../tools/scan-bench/photos/objets'].filter(Boolean);
const DIR = candidates.map((d) => resolve(d)).find(existsSync);
if (!DIR) throw new Error('dossier de photos introuvable (--photos)');
const attendus = JSON.parse(readFileSync('tools/scan-bench/attendus.json', 'utf8'));
const OUT = 'captures/lscan/bench';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${URL}/favicon.ico`).catch(() => {});

const lignes = [];
let ok = 0;
let total = 0;
const photos = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const resultats = await Promise.all(
  photos.map(async (f) => {
    const cle = f.replace(/\.[^.]+$/, '');
    const b64 = readFileSync(join(DIR, f)).toString('base64');
    const mime = /png$/i.test(f) ? 'image/png' : 'image/jpeg';
    return page.evaluate(async ({ b64, mime, cle }) => {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();
      const s = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const small = c.toDataURL('image/jpeg', 0.85).split(',')[1];
      const t0 = performance.now();
      const res = await fetch('/api/scan-object', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: small, mimeType: 'image/jpeg' }) });
      return { cle, ms: Math.round(performance.now() - t0), status: res.status, json: await res.json().catch(() => null) };
    }, { b64, mime, cle });
  }),
);

for (const r of resultats) {
  const a = attendus[r.cle];
  const w = r.json ?? {};
  const p = w.physics ?? {};
  const max = Math.max(...(p.sizeM ?? [0]));
  const checks = a
    ? {
        masse: p.massKg >= a.masseKg[0] && p.massKg <= a.masseKg[1],
        taille: max >= a.tailleMaxM[0] && max <= a.tailleMaxM[1],
        matiere: a.matieres.includes(p.material),
        forme: a.formes.includes(p.shape),
        fragile: Array.isArray(a.fragile) ? a.fragile.includes(p.fragile) : a.fragile === p.fragile,
        liquide: a.liquide.includes(p.liquid),
        categorie: a.categories.includes(w.category),
      }
    : {};
  const n = Object.values(checks).filter(Boolean).length;
  ok += n;
  total += Object.keys(checks).length;
  lignes.push(
    `${r.cle.padEnd(17)} ${String(r.ms).padStart(5)} ms  ${String(w.object).slice(0, 28).padEnd(28)} ${String(p.massKg).padStart(6)} kg ${max.toFixed(2)} m ${String(p.material).padEnd(8)} ${String(p.shape).padEnd(9)} ${p.fragile ? 'fragile' : '       '} ${p.liquid ? 'liquide' : '       '} ${String(w.category).padEnd(9)} ${JSON.stringify(w.stats)} ${w.trait}  ${n}/${Object.keys(checks).length} ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => `✗${k}`).join(' ')}`,
  );
}
console.log(lignes.sort().join('\n'));
console.log(`\nScore : ${ok}/${total} contrôles (${Math.round((100 * ok) / Math.max(1, total))} %)`);
writeFileSync(`${OUT}/bench-physique.json`, JSON.stringify(resultats, null, 2));
await browser.close();
