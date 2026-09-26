// Test de bout en bout du VRAI parcours d'arsenal (lot LSCAN) avec la vraie clé : titre -> persos -> arsenal ->
// « Snap a real object » -> webcam (faux flux Chrome, --use-fake-device-for-media-stream) ou dépôt de fichier ->
// SNAP -> carte d'arme -> sticker -> Confirm -> ... -> match. Mesure chaque étape et capture chaque carte.
// Usage : node tools/lscan/parcours.mjs [--url http://localhost:5347] [--demo] [--cam coffee-mug]
//         [--p1 banana,headphones] [--p2 plush-toy,sneaker] [--early p2] [--no-match]
//   --cam   : photo diffusée par la fausse webcam (slot 1 de P1)
//   --p1/p2 : photos déposées (fichier) pour les slots suivants ; les slots restants prennent une arme du râtelier
//   --early : ce joueur valide ses cartes SANS attendre le sticker (teste la mise à jour tardive, même en match)
// Photos : captures/lscan/photos/<slug>.jpg (voir tools/lscan/photos.mjs). Sortie : captures/lscan/.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
let URL = opt('--url', 'http://localhost:5347');
if (args.includes('--demo')) URL += (URL.includes('?') ? '&' : '?') + 'demo=1';
const OUT = opt('--out', 'captures/lscan');
const PHOTOS = 'captures/lscan/photos';
const cam = opt('--cam', 'coffee-mug');
const list = (s) => (s ? s.split(',').filter(Boolean) : []);
const plan = [list(opt('--p1', 'banana,headphones')), list(opt('--p2', 'plush-toy,sneaker'))];
const early = opt('--early', 'p2');
mkdirSync(OUT, { recursive: true });

const photoPath = (slug) => {
  for (const ext of ['jpg', 'png']) if (existsSync(`${PHOTOS}/${slug}.${ext}`)) return resolve(`${PHOTOS}/${slug}.${ext}`);
  throw new Error(`photo manquante : ${PHOTOS}/${slug}.jpg (lancer tools/lscan/photos.mjs)`);
};

/** Photo -> fichier .y4m (I420) lisible par la fausse webcam de Chrome. Conversion faite dans un canvas. */
async function makeY4m(browser, src, out, W = 640, H = 360) {
  const page = await browser.newPage();
  const b64 = readFileSync(src).toString('base64');
  const data = await page.evaluate(async ({ b64, W, H }) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const s = Math.max(W / img.width, H / img.height);
    g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    const d = g.getImageData(0, 0, W, H).data;
    const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const all = new Uint8Array((W * H * 3) / 2);
    for (let i = 0; i < W * H; i++) all[i] = cl(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    const q = (W * H) / 4;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        let r = 0, gg = 0, b = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const i = ((y + dy) * W + x + dx) * 4;
          r += d[i] / 4; gg += d[i + 1] / 4; b += d[i + 2] / 4;
        }
        const j = (y / 2) * (W / 2) + x / 2;
        all[W * H + j] = cl(128 - 0.168736 * r - 0.331264 * gg + 0.5 * b);
        all[W * H + q + j] = cl(128 + 0.5 * r - 0.418688 * gg - 0.081312 * b);
      }
    }
    let s2 = '';
    for (let i = 0; i < all.length; i += 0x8000) s2 += String.fromCharCode(...all.subarray(i, i + 0x8000));
    return btoa(s2);
  }, { b64, W, H });
  await page.close();
  const frame = Buffer.from(data, 'base64');
  const fh = Buffer.from('FRAME\n');
  writeFileSync(out, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`), fh, frame, fh, frame]));
}

const t0 = Date.now();
const since = () => ((Date.now() - t0) / 1000).toFixed(1);
const log = (...a) => console.log(`[${since()} s]`, ...a);

const pre = await chromium.launch();
const y4m = resolve(`${OUT}/cam-${cam}.y4m`);
await makeY4m(pre, photoPath(cam), y4m);
await pre.close();

// --gpu : Chromium complet en mode sans fenêtre avec la vraie carte (D3D11) ; sinon rendu logiciel, très lent,
// qui affame le fil principal et fausse les temps mesurés (vu au premier passage : cartes à 15-30 s).
const GPU = args.includes('--gpu');
const browser = await chromium.launch({
  ...(GPU ? { channel: 'chromium' } : {}),
  args: [
    '--ignore-gpu-blocklist', '--enable-webgl', GPU ? '--use-angle=d3d11' : '--use-angle=default', '--enable-gpu-rasterization',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`,
  ],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, permissions: ['camera'] });
const page = await context.newPage();
const erreurs = [];
page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
page.on('pageerror', (e) => erreurs.push(e.message));
const api = [];
page.on('requestfailed', (req) => {
  if (req.url().includes('/api/')) api.push({ url: req.url().replace(/^.*\/api\//, ''), status: 'ÉCHEC', ms: null, info: req.failure()?.errorText });
});
page.on('requestfinished', async (req) => {
  if (!req.url().includes('/api/scan-object') && !req.url().includes('/api/sticker')) return;
  const t = req.timing();
  const res = await req.response();
  let info = '';
  try {
    const j = await res.json();
    info = j.dataUrl !== undefined ? `sticker ${j.dataUrl ? 'OK' : `null (${j.reason})`}` : `${j.object} -> ${j.weaponName} [${j.category}]`;
    if (j.dataUrl) {
      const m = /^data:image\/(\w+);base64,(.*)$/.exec(j.dataUrl);
      if (m) writeFileSync(`${OUT}/sticker-brut-${api.length + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`, Buffer.from(m[2], 'base64'));
    }
  } catch { /* corps binaire */ }
  api.push({ url: req.url().replace(/^.*\/api\//, ''), status: res.status(), ms: Math.round(t.responseEnd), info });
});

const rapport = { url: URL, cartes: [], erreurs, api, match: null };

async function clickText(re, timeout = 15000) {
  const b = page.locator('button', { hasText: re }).first();
  await b.waitFor({ state: 'visible', timeout });
  await b.click({ force: true });
}

/** Un slot de l'arsenal par photo : webcam (slug === cam et source 'cam') ou fichier. */
async function snapSlot(player, slot, slug, source, waitSticker) {
  await page.locator('.snap-tile').first().click({ force: true });
  await page.locator('.capture').waitFor({ timeout: 5000 });
  let tClick;
  if (source === 'cam') {
    const useCam = page.locator('button', { hasText: /use webcam/i });
    if (await useCam.isVisible().catch(() => false)) await useCam.click({ force: true });
    await page.waitForFunction(() => {
      const v = document.querySelector('.capture video');
      return v && !v.hidden && v.videoWidth > 0;
    }, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    tClick = Date.now();
    await clickText(/snap|capture/i);
  } else {
    tClick = Date.now();
    await page.setInputFiles('.capture input[type=file]', photoPath(slug));
  }
  const card = page.locator('.weapon-card').first();
  await card.waitFor({ timeout: 20000 });
  const tCard = Date.now();
  const fiche = await card.evaluate((c) => ({
    nom: c.querySelector('.wc-band-name')?.textContent,
    objet: c.querySelector('.weapon-object')?.textContent,
    categorie: c.querySelector('.wc-category')?.textContent,
    trait: c.querySelector('.wc-stamp')?.textContent,
    pourquoi: c.querySelector('.weapon-why')?.textContent,
    pastilles: [...c.querySelectorAll('.wc-pip-row')].map((r) => r.querySelectorAll('.pip.filled').length),
  }));
  await page.waitForTimeout(700); // pastilles animées
  await card.screenshot({ path: `${OUT}/carte-p${player + 1}-${slot + 1}-${slug}-stats.png` });
  let tSticker = null;
  if (waitSticker) {
    await page.locator('.weapon-card .wc-illustration .wsticker-img, .weapon-card .wsticker-label').first().waitFor({ timeout: 40000 });
    tSticker = Date.now();
    await page.waitForTimeout(600); // fondu « sorti de la forge »
    await card.screenshot({ path: `${OUT}/carte-p${player + 1}-${slot + 1}-${slug}.png` });
  }
  const aSticker = waitSticker ? await page.locator('.weapon-card .wsticker-img').count() > 0 : null;
  const r = {
    joueur: player + 1, slot: slot + 1, photo: slug, source, ...fiche,
    carteS: +((tCard - tClick) / 1000).toFixed(1),
    stickerS: tSticker ? +((tSticker - tClick) / 1000).toFixed(1) : 'validée avant',
    sticker: aSticker,
  };
  rapport.cartes.push(r);
  log(`P${player + 1} slot ${slot + 1} ${slug} (${source}) : carte ${r.carteS} s, sticker ${r.stickerS} s —`, fiche.nom, '|', fiche.categorie, '|', fiche.trait, fiche.pastilles.join('/'));
  if (player === 0 && slot === 1) {
    // Changement de catégorie proposé au joueur : nouveau JSON imposé, même sticker (déjà dessiné).
    const avant = fiche.categorie?.trim().toLowerCase();
    const cible = ['blaster', 'shield', 'grenade', 'throwable'].find((c) => c !== avant);
    const tCat = Date.now();
    await page.locator('.cat-pill', { hasText: cible }).first().click({ force: true });
    await page.waitForFunction((c) => document.querySelector('.weapon-card .wc-category')?.textContent?.trim().toLowerCase() === c, cible, { timeout: 15000 });
    const tCatCarte = Date.now();
    const img = await page.locator('.weapon-card .wsticker-img').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(700);
    await page.locator('.weapon-card').first().screenshot({ path: `${OUT}/carte-p1-2-${slug}-${cible}.png` });
    rapport.recategorie = { de: avant, vers: cible, carteS: +((tCatCarte - tCat) / 1000).toFixed(1), stickerReutilise: img };
    log(`catégorie ${avant} -> ${cible} : ${rapport.recategorie.carteS} s, sticker réutilisé : ${img}`);
  }
  await clickText(/^confirm$/i);
}

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.locator('.title-play').waitFor({ timeout: 20000 });
  await page.locator('.title-play').click({ force: true });
  await page.locator('.fighter-tile').first().waitFor();
  await page.locator('.fighter-tile').nth(0).click({ force: true });
  await page.locator('.fighter-tile').nth(1).click({ force: true });
  await page.locator('.ready-bar:not([disabled])').click({ force: true });
  log('arsenal P1');

  for (const player of [0, 1]) {
    await page.locator('.snap-tile').first().waitFor({ timeout: 10000 });
    const photos = player === 0 ? [cam, ...plan[0]] : plan[1];
    let slot = 0;
    for (const slug of photos.slice(0, 3)) {
      const source = player === 0 && slot === 0 ? 'cam' : 'file';
      await snapSlot(player, slot, slug, source, early !== `p${player + 1}`);
      slot++;
    }
    for (; slot < 3; slot++) await page.locator('.rack-tile:not(.snap-tile)').nth(slot).click({ force: true });
    await page.locator('.arsenal-card .cta:not([disabled])').click({ force: true });
    log(`arsenal P${player + 1} validé`);
  }

  await clickText(/skip presentation/i, 20000);
  await page.locator('.map-tile').first().waitFor({ timeout: 10000 });
  await page.locator('.map-tile').first().click({ force: true });
  log('map choisie');

  if (!args.includes('--no-match')) {
    await page.waitForFunction(() => !!window.gameState?.players?.[0]?.weapons?.length, null, { timeout: 20000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/match-debut.png` });
    // Le sticker de la carte validée avant son arrivée doit rejoindre l'état du match (et la main).
    const deadline = Date.now() + 30000;
    let armes;
    do {
      armes = await page.evaluate(() => window.gameState.players.map((p) => p.weapons.map((w) => ({ id: w.id, nom: w.name, source: w.source, sticker: !!w.stickerUrl }))));
      if (armes.flat().filter((w) => w.source === 'scan').every((w) => w.sticker)) break;
      await page.waitForTimeout(1000);
    } while (Date.now() < deadline);
    rapport.match = { phase: await page.evaluate(() => window.gameState.phase), armes };
    log('armes en match', JSON.stringify(armes));
    await page.screenshot({ path: `${OUT}/match-stickers.png` });
  }
} catch (e) {
  log('ÉCHEC', e.message);
  rapport.echec = e.message;
  await page.screenshot({ path: `${OUT}/echec.png` }).catch(() => {});
} finally {
  rapport.scans = await page.evaluate(() => window.__scans ?? null).catch(() => null);
  console.log('Scans (temps dans la page, ms depuis SNAP) :', JSON.stringify(rapport.scans));
  writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 2));
  console.log('API :', api.map((a) => `${a.url} ${a.status} ${a.ms} ms ${a.info}`).join('\n      '));
  console.log('Erreurs console :', erreurs.length ? erreurs.slice(0, 10) : 'aucune');
  await browser.close();
}
