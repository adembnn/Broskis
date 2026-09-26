// Lot LE2E : l'objet en main / en vol est-il réellement DESSINÉ et reconnaissable dans la vue du lanceur ?
//   node tools/e2e/objet-visible.mjs [--port 5373] [--visages <dossier>]
// Scanne la chaise (photo d'Adem, chemin absolu) et la canette dessinée par le vrai pipeline, lance un match
// (P1 : chaise, P2 : canette), relève l'état de l'objet (visible, couches, matériaux, taille, écart à la main), puis
// capture : vue du lanceur (en main, en vol) + caméra de débogage de côté. Rapport : reports/e2e/objet-visible-<heure>/.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
let PORT = Number(opt('--port', '5373'));
const VISAGES = opt('--visages', null);
const PHOTO_CHAISE = 'C:\\Users\\Adem\\Documents\\Hackathon Voodoo\\Voodoo-Hack\\tools\\scan-bench\\photos\\objets\\chaise-bureau.jpg';
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const OUT = join('reports', 'e2e', `objet-visible-${pad(now.getHours())}${pad(now.getMinutes())}`);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[objet ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };

for (let i = 0; i < 20 && (await up(`http://localhost:${PORT}/`)); i++) PORT += 1;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/e2e/vite.e2e.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const res = {};
try {
  for (let i = 0; i < 120 && !(await up(`http://localhost:${PORT}/`)); i++) await sleep(500);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${PORT}/`, { timeout: 180000 });
  await page.waitForFunction(() => typeof window.gameHooks?.scanObjectFromUrl === 'function' && !!window.ctx, null, { timeout: 180000 });
  const b64 = (f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
  const faces = VISAGES && existsSync(join(VISAGES, 'visage-fictif-1.jpg')) ? [b64(join(VISAGES, 'visage-fictif-1.jpg')), b64(join(VISAGES, 'visage-fictif-2.jpg'))] : null;
  // Vrai pipeline : scan + sticker (attendu), catégorie « throwable » pour les deux.
  res.armes = await page.evaluate(async ({ chaise, canette, faces }) => {
    const attendre = async (w) => { const t0 = performance.now(); while (!w.stickerUrl && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 300)); return w; };
    const [c, k] = await Promise.all([
      window.gameHooks.scanObjectFromUrl(chaise, { category: 'throwable' }).then(attendre),
      window.gameHooks.scanObjectFromUrl(canette, { category: 'throwable' }).then(attendre),
    ]);
    const { weaponPresets } = await import('/src/ui/presets.ts');
    const p = weaponPresets();
    let fighters;
    if (faces) {
      const { scanFighter } = await import('/src/ia/fighter/index.ts');
      const toBlob = async (d) => (await fetch(d)).blob();
      fighters = await Promise.all(faces.map(async (f) => scanFighter(await toBlob(f))));
    }
    window.gameHooks.startMatch({ split: true, map: 'archipel', ...(fighters ? { fighters } : {}), weapons: [[{ ...c, id: 'chaise-p0-0' }, p[0], p[1]], [{ ...k, id: 'canette-p1-0' }, p[2], p[3]]] });
    return [c, k].map((w) => ({ name: w.name, object: w.object, sticker: !!w.stickerUrl, physics: w.physics }));
  }, { chaise: b64(PHOTO_CHAISE), canette: b64('tools/e2e/canette-dessinee.jpg'), faces });
  log('armes', JSON.stringify(res.armes));
  await page.waitForFunction(() => window.gameState?.phase === 'fight', null, { timeout: 90000 });
  await sleep(1500);
  // État de l'objet en main, pour chaque joueur.
  const etat = () => page.evaluate(() => {
    const scene = window.ctx.three.scene;
    const main = scene.getObjectByName('latk-main');
    return [0, 1].map((p) => {
      const ps = window.ctx.state.players[p];
      const w = ps.weapons[ps.selected];
      const m = main?.getObjectByName(`arme-${w.id}`);
      if (!m) return { p, arme: w.name, trouve: false };
      m.updateMatrixWorld(true);
      const pos = m.getWorldPosition(m.position.clone());
      const mats = [];
      let meshes = 0, visibles = 0;
      m.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false;
        if (v) visibles++;
        for (const mat of [].concat(o.material)) mats.push({ type: mat.type, opacite: mat.opacity, transparent: mat.transparent, alphaTest: mat.alphaTest, map: !!mat.map, visible: mat.visible, couches: o.layers.mask });
      });
      const main3 = window.ctx.three.scene.getObjectByName(`fighter-${ps.fighter?.id}`);
      const hand = (() => { let h = null; main3?.traverse((o) => { if (!h && /handslot\.?r/i.test(o.name)) h = o; }); return h; })();
      const hp = hand ? hand.getWorldPosition(hand.position.clone()) : null;
      const v = pos.clone().project(window.ctx.three.viewOf(p).camera);
      return {
        p, arme: w.name, trouve: true, racineVisible: m.visible, echelle: Math.round(m.scale.x * 100) / 100, meshes, visibles,
        materiaux: mats.slice(0, 4), camCouches: window.ctx.three.viewOf(p).camera.layers.mask,
        ecartMain: hp ? Math.round(pos.distanceTo(hp) * 100) / 100 : null,
        ecran: { x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, devant: v.z < 1 },
      };
    });
  });
  res.enMain = await etat();
  log('en main', JSON.stringify(res.enMain));
  await page.screenshot({ path: join(OUT, '0-vues-au-repos.jpg'), type: 'jpeg', quality: 70 });
  // Les 4 images demandées : dans la vue du LANCEUR, l'objet en main (pendant la charge) puis en vol (ralenti ×0,2).
  const moitie = (p) => ({ x: p === 0 ? 0 : 640, y: 0, width: 640, height: 720 });
  const depart = await page.evaluate(() => window.gameState.players.map((q) => q.pos));
  const lancer = async (p, touche, nom, attenteVolMs) => {
    // Mêmes places qu'au départ, % à 0, recharges vides : le lanceur est libre d'agir.
    await page.evaluate((d) => { for (const q of [0, 1]) { window.__lsmash.place(q, d[q][0], d[q][1] + 0.05, d[q][2]); window.__lsmash.setPct(q, 0); window.ctx.state.players[q].cooldowns = window.ctx.state.players[q].cooldowns.map(() => 0); } }, depart);
    await sleep(700);
    await page.keyboard.down(touche);
    await sleep(750);
    await page.screenshot({ path: join(OUT, `${nom}-en-main.jpg`), type: 'jpeg', quality: 72, clip: moitie(p) });
    await page.evaluate(() => window.ctx.bus.emit('slowmo', { factor: 0.2, ms: 4000 }));
    await page.keyboard.up(touche);
    await sleep(attenteVolMs);
    await page.screenshot({ path: join(OUT, `${nom}-en-vol.jpg`), type: 'jpeg', quality: 72, clip: moitie(p) });
  };
  await lancer(0, 'KeyF', 'chaise', 1100);
  res.enVol = await page.evaluate(() => {
    const vol = window.ctx.three.scene.getObjectByName('latk-vol');
    const out = [];
    vol?.traverse((o) => { if (/^arme-/.test(o.name)) { let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; const pos = o.getWorldPosition(o.position.clone()); const s = pos.clone().project(window.ctx.three.viewOf(0).camera); out.push({ nom: o.name, visible: v, echelle: Math.round(o.scale.x * 100) / 100, ecranP1: [Math.round(s.x * 100) / 100, Math.round(s.y * 100) / 100, s.z < 1] }); } });
    return out;
  });
  log('en vol', JSON.stringify(res.enVol));
  await sleep(3500);
  await lancer(1, 'KeyL', 'canette', 700);
  await sleep(2500);
  await page.screenshot({ path: join(OUT, '5-vues-apres.jpg'), type: 'jpeg', quality: 70 });  await browser.close();
} catch (e) {
  res.erreur = e.message.split('\n')[0];
  log('ERREUR', res.erreur);
} finally {
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
}
writeFileSync(join(OUT, 'etat.json'), JSON.stringify(res, null, 1));
log(`rapport : ${OUT}`);
