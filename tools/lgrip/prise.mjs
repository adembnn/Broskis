// Lot LGRIP : l'objet est-il VRAIMENT tenu ? Banc de captures en jeu, avec le vrai pipeline (scan + sticker).
//   node tools/lgrip/prise.mjs [--port 5376] [--rescan] [--mesure] [--seul chaise|canette|feutre]
// P1 porte la chaise et le feutre (photos d'Adem, lues à leur chemin, jamais copiées) et la canette dessinée (fichier de
// test LE2E). Pour chaque objet : à l'arrêt, en courant, en charge, au lâcher, en vol ; vue du lanceur (moitié gauche)
// et caméra de côté (la vue de P2 est prise par le banc, moitié droite). Images prises DANS la page juste après le
// rendu de l'image voulue ; temps de jeu ralenti (window.__fast) pour que la machine chargée ne saute pas l'instant.
// Écart main-objet mesuré à chaque image (points de prise vs os des mains). Rapport : captures/lgrip/<heure>/.
// Le scan réel est mis en cache hors du dépôt (dossier temporaire) : --rescan le refait.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const PHOTOS = 'C:\\Users\\Adem\\Documents\\Hackathon Voodoo\\Voodoo-Hack\\tools\\scan-bench\\photos\\objets';
const OBJETS = [
  { nom: 'chaise', photo: join(PHOTOS, 'chaise-bureau.jpg'), categorie: 'throwable' },
  { nom: 'canette', photo: 'tools/e2e/canette-dessinee.jpg', categorie: 'grenade' },
  { nom: 'feutre', photo: join(PHOTOS, 'feutre-velleda.jpg'), categorie: 'throwable' },
];
const CACHE = opt('--cache', join(tmpdir(), 'lgrip-armes.json'));
// Visages fictifs (générés, jamais des photos d'Adem) : persos à grosse tête comme en démo. --visages <dossier>.
const VISAGES = opt('--visages', null);
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const OUT = join('captures', 'lgrip', `${pad(now.getHours())}${pad(now.getMinutes())}`);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[lgrip ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };

let PORT = Number(opt('--port', '5376'));
for (let i = 0; i < 10 && (await up(`http://localhost:${PORT}/`)); i++) PORT = 5370 + ((PORT - 5370 + 1) % 10);
if (await up(`http://localhost:${PORT}/`)) { console.error('aucun port libre entre 5370 et 5379'); process.exit(1); }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/e2e/vite.e2e.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
log(`vite PID ${server.pid} port ${PORT}`);
const res = { port: PORT, mesures: {}, ecarts: [] };
let browser;
try {
  for (let i = 0; i < 240 && !(await up(`http://localhost:${PORT}/`)); i++) await sleepReal(500);
  browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/`, { timeout: 240000 });
  await page.waitForFunction(() => typeof window.gameHooks?.scanObjectFromUrl === 'function' && !!window.ctx, null, { timeout: 240000 });
  log('page prête');

  // ------------------------------------------------------------ armes : vrai pipeline, puis cache hors dépôt
  let armes = !has('--rescan') && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
  if (!armes) {
    const b64 = (f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
    armes = await page.evaluate(async (objets) => {
      const attendre = async (w) => { const t0 = performance.now(); while (!w.stickerUrl && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 300)); return w; };
      const out = [];
      for (const o of objets) out.push(await window.gameHooks.scanObjectFromUrl(o.url, { category: o.categorie, player: 0 }).then(attendre));
      return out.map((w) => JSON.parse(JSON.stringify(w)));
    }, OBJETS.map((o) => ({ url: b64(o.photo), categorie: o.categorie })));
    if (armes.every((w) => typeof w.stickerUrl === 'string' && w.stickerUrl.startsWith('data:'))) writeFileSync(CACHE, JSON.stringify(armes));
    log('scan réel fait');
  }
  let persos = null;
  const CACHE_P = CACHE.replace(/\.json$/, '-persos.json');
  if (VISAGES && existsSync(join(VISAGES, 'visage-fictif-1-512.jpg'))) {
    persos = !has('--rescan') && existsSync(CACHE_P) ? JSON.parse(readFileSync(CACHE_P, 'utf8')) : null;
    if (!persos) {
      const b64 = (f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
      persos = await page.evaluate(async (faces) => {
        const { scanFighter } = await import('/src/ia/fighter/index.ts');
        const toBlob = async (d) => (await fetch(d)).blob();
        const out = await Promise.all(faces.map(async (f) => scanFighter(await toBlob(f))));
        return out.map((x) => JSON.parse(JSON.stringify(x)));
      }, [b64(join(VISAGES, 'visage-fictif-1-512.jpg')), b64(join(VISAGES, 'visage-fictif-2-512.jpg'))]);
      if (persos.every((f) => f.look?.faceUrl?.startsWith?.('data:'))) writeFileSync(CACHE_P, JSON.stringify(persos));
      log('persos scannés');
    }
  }
  res.armes = armes.map((w) => ({ nom: w.name, objet: w.object, categorie: w.category, sticker: !!w.stickerUrl, physique: w.physics }));
  log('armes', JSON.stringify(res.armes));

  // ------------------------------------------------------------ banc : caméra de côté (vue de P2) + prises d'images
  await page.evaluate(() => {
    const c = window.ctx;
    window.__lgrip = { queue: [], grabs: [], cote: true, onSpawn: null };
    const V = c.three.camera.position.constructor;
    const a = new V(), b = new V(), dir = new V(), side = new V();
    c.loop.addSystem('lgrip-banc-camera', () => {
      const L = window.__lgrip;
      if (!L.cote) return;
      const s = c.state, cam = c.three.cameras?.[1] ?? c.three.camera;
      const sh = s.players[0].pos, tg = s.players[1].pos;
      a.set(sh[0], sh[1], sh[2]); b.set(tg[0], tg[1], tg[2]);
      dir.subVectors(b, a).setY(0).normalize();
      side.set(-dir.z, 0, dir.x); // droite de P1
      cam.position.copy(a).addScaledVector(side, 4.6).addScaledVector(dir, 1.2).setY(a.y + 1.9);
      cam.lookAt(a.x, a.y + 1.25, a.z);
    }, 950);
    c.loop.addSystem('lgrip-banc-grab', () => {
      const L = window.__lgrip;
      const t = performance.now();
      while (L.queue.length && L.queue[0].at <= t) {
        const q = L.queue.shift();
        L.grabs.push({ name: q.name, data: c.three.canvas.toDataURL('image/jpeg', 0.88), ecart: window.__lgripEcart?.() ?? null });
      }
    }, 1001);
    c.bus.on('projectile:spawn', ({ owner }) => {
      const L = window.__lgrip;
      if (owner !== 0 || !L.onSpawn) return;
      const t = performance.now();
      for (const [n, ms] of L.onSpawn) L.queue.push({ name: n, at: t + ms });
      L.queue.sort((x, y) => x.at - y.at);
      L.onSpawn = null;
    });
    // Écart main-objet : distance de chaque point de prise à l'os de sa main (m), en jeu, à cette image.
    window.__lgripEcart = () => {
      const g = window.__lgripPrise?.(0);
      return g ? Object.fromEntries(Object.entries(g).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])) : null;
    };
  });
  const SLOW = Number(opt('--lent', 0.3));
  const sleep = (ms) => page.waitForTimeout(ms / SLOW);
  const files = [];
  async function flush() {
    const grabs = await page.evaluate(() => window.__lgrip.grabs.splice(0));
    for (const g of grabs) {
      const path = join(OUT, `${String(files.length + 1).padStart(2, '0')}-${g.name}.jpg`);
      writeFileSync(path, Buffer.from(g.data.split(',')[1], 'base64'));
      files.push(path);
      if (g.ecart) res.ecarts.push({ image: path, ...g.ecart });
    }
  }
  async function snap(name) {
    await page.evaluate((n) => { window.__lgrip.queue.push({ name: n, at: performance.now() }); }, name);
    await page.waitForFunction(() => window.__lgrip.queue.length === 0, null, { timeout: 30000 });
    await flush();
  }
  const input = (p, a, d) => page.evaluate(([pp, aa, dd]) => window.gameHooks.input(pp, aa, dd), [p, a, d]);

  const presets = JSON.parse(readFileSync('public/assets/presets/presets.json', 'utf8'));
  const list = Array.isArray(presets) ? presets : presets.weapons ?? Object.values(presets);
  const byId = Object.fromEntries(list.map((w) => [w.id, { ...w, cooldown: 0, source: 'preset' }]));
  const p1 = [byId['preset-frying-pan'], byId['preset-banana'], byId['preset-baguette']].filter(Boolean);
  const p0 = armes.map((w, i) => ({ ...w, id: `lgrip-${OBJETS[i].nom}-${i}`, cooldown: 0 }));
  await page.evaluate(([a, b, f]) => { window.__fast = 1; window.gameHooks.startMatch({ weapons: [a, b], map: 'archipel', seed: 7, stocks: 9, split: true, ...(f ? { fighters: f } : {}) }); }, [p0, p1, persos]);
  await page.waitForFunction(() => window.ctx.state.phase === 'fight', null, { timeout: 120000 });
  await page.evaluate((k) => { window.__fast = k; }, SLOW);
  await sleep(900);
  const depart = await page.evaluate(() => window.gameState.players.map((q) => q.pos));
  const reset = async () => page.evaluate((d) => {
    for (const q of [0, 1]) { window.__lsmash.place(q, d[q][0], d[q][1] + 0.05, d[q][2]); window.__lsmash.setPct(q, 0); const ps = window.ctx.state.players[q]; ps.cooldowns = ps.cooldowns.map(() => 0); }
  }, depart);

  if (has('--mesure')) {
    res.mesures = await page.evaluate(() => {
      const rig = window.__fighters.rigs[0];
      const c = rig.container;
      c.updateMatrixWorld(true);
      const inv = c.matrixWorld.clone().invert();
      const V = c.position.constructor;
      const loc = (o) => { const v = o.getWorldPosition(new V()).applyMatrix4(inv); return [+(v.x.toFixed(3)), +(v.y.toFixed(3)), +(v.z.toFixed(3))]; };
      const out = {};
      for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'upperarml', 'upperarmr', 'lowerarml', 'lowerarmr', 'wristl', 'wristr', 'handl', 'handr', 'handslotl', 'handslotr']) {
        const o = rig.root.getObjectByName(n); if (o) out[n] = loc(o);
      }
      const hs = rig.root.getObjectByName('handslotr');
      if (hs) {
        const q = hs.getWorldQuaternion(c.quaternion.clone()).premultiply(c.getWorldQuaternion(c.quaternion.clone()).invert());
        out.slotAxes = ['x', 'y', 'z'].map((k) => { const v = new V(k === 'x' ? 1 : 0, k === 'y' ? 1 : 0, k === 'z' ? 1 : 0).applyQuaternion(q); return [k, +(v.x.toFixed(2)), +(v.y.toFixed(2)), +(v.z.toFixed(2))]; });
      }
      const tete = rig.root.getObjectByName('grosse-tete-vinyle') ?? rig.root.getObjectByName('grosse-tete');
      if (tete) {
        const Box = window.THREE_Box3 ?? null;
        let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
        tete.traverse((o) => {
          if (!o.isMesh) return;
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 7) {
            const v = new V().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
            min = [Math.min(min[0], v.x), Math.min(min[1], v.y), Math.min(min[2], v.z)];
            max = [Math.max(max[0], v.x), Math.max(max[1], v.y), Math.max(max[2], v.z)];
          }
        });
        out.tete = { min: min.map((x) => +x.toFixed(3)), max: max.map((x) => +x.toFixed(3)) };
      }
      out.echelle = rig.squashWrapper.scale.x;
      return out;
    });
    log('mesures', JSON.stringify(res.mesures));
  }

  const seul = opt('--seul', null);
  for (let i = 0; i < OBJETS.length; i++) {
    const o = OBJETS[i];
    if (seul && seul !== o.nom) continue;
    await reset();
    await input(0, `weapon${i + 1}`, true); await sleep(80); await input(0, `weapon${i + 1}`, false);
    await sleep(700);
    await snap(`${o.nom}-1-arret`);
    // Course : de côté par rapport à l'adversaire (visée verrouillée), deux instants du cycle.
    await input(0, 'left', true);
    await sleep(420);
    await snap(`${o.nom}-2-course-a`);
    await sleep(170);
    await snap(`${o.nom}-2-course-b`);
    await input(0, 'left', false);
    await sleep(500);
    await reset();
    await sleep(500);
    // La charge se compte en temps RÉEL (combat.ts, performance.now) : tenue 0,9 s réelle, sous autoReleaseS.
    await page.evaluate((n) => { window.__lgrip.onSpawn = [[`${n}-4-lacher`, 0], [`${n}-5-vol-a`, 90 / 0.3], [`${n}-5-vol-b`, 220 / 0.3]]; }, o.nom);
    await input(0, 'fire', true);
    await sleepReal(750);
    await snap(`${o.nom}-3-charge`);
    await input(0, 'fire', false);
    await page.waitForFunction(() => window.__lgrip.onSpawn === null && window.__lgrip.queue.length === 0, null, { timeout: 30000 });
    await flush();
    await sleep(1600);
  }
  writeFileSync(join(OUT, 'etat.json'), JSON.stringify(res, null, 1));
  log(`${files.length} images : ${OUT}`);
} catch (e) {
  res.erreur = e.message.split('\n')[0];
  log('ERREUR', res.erreur);
  writeFileSync(join(OUT, 'etat.json'), JSON.stringify(res, null, 1));
} finally {
  try { await browser?.close(); } catch { /* déjà fermé */ }
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
}
