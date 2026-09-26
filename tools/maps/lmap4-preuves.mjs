// Preuves du lot LMAP4 (level design des 3 arènes) : pour chaque map, en combat temps réel écran scindé,
// 1) vue de jeu réelle (épaules P1/P2 avec interface), 2) vue large sans interface, 3) vue large et vue de bord
// avec les colliders affichés (gameHooks.debugColliders), 4) chute libre dans le vide dans 4 directions (aucun
// mur invisible) : on téléporte P1 près du bord et on le fait COURIR vers le vide (entrée clavier temps réel).
// Usage : node tools/maps/lmap4-preuves.mjs --url http://localhost:5317 [--out captures/lmap4] [--maps a,b]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5173');
const OUT = opt('--out', 'captures/lmap4');
const MAPS = opt('--maps', 'archipel,galion,cuisine').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.ctx && window.gameHooks, null, { timeout: 60000 });
await page.evaluate(() => {
  window.__c4 = null;
  window.ctx.loop.addSystem('lmap4-cam', () => {
    const c = window.__c4; if (!c) return;
    const cam = window.ctx.three.camera; cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  }, 955);
});

async function start(map) {
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 7, split: true }), map);
  await page.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

// Bord du collider de sol, mesuré (test de sol du moteur) sur 720 rayons et dessiné en perles rouges à y = 0,06 :
// si les perles tombent sur le bord visible, collider = visuel.
async function drawEdge(on) {
  await page.evaluate(async (on) => {
    const sc = window.ctx.three.scene;
    const old = sc.getObjectByName('lmap4-edge'); if (old) old.removeFromParent();
    if (!on) return;
    // Même module three que le jeu (URL exacte chargée par la page, cache de Vite compris).
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js/.test(n));
    const THREE = await import(url);
    const { isOverVoid } = await import('/src/scene/maps/engine.ts');
    const pts = [];
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a);
      let last = null;
      for (let d = 0; d < 30; d += 0.05) { if (!isOverVoid([c * d, 0.1, s * d])) last = d; else if (last !== null && d > last + 2) break; }
      if (last !== null) pts.push([c * last, s * last]);
    }
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1030, depthTest: false });
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => { m.makeTranslation(x, 0.06, z); im.setMatrixAt(i, m); });
    im.name = 'lmap4-edge'; im.renderOrder = 1000; im.frustumCulled = false;
    sc.add(im);
  }, on);
}
const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/${name}.png` }); };

const rapport = {};
let ok = true;
for (const map of MAPS) {
  await start(map);
  const phase = await page.evaluate(() => window.gameState.phase);
  await shot(`${map}-jeu`);
  // Appels de dessin (scène seule, caméra du jeu) : total du rendu scindé à l'image suivante.
  const calls = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(window.ctx.three.renderer.info.render.calls)))));
  await page.evaluate(() => { window.ctx.three.uiRoot.style.visibility = 'hidden'; });
  await page.evaluate(() => { window.__c4 = { pos: [0, 17, 21], look: [0, 0, -1.5] }; });
  await shot(`${map}-large`);
  await page.evaluate(() => { window.__c4 = { pos: [0, 44, 0.01], look: [0, 0, 0] }; });
  await shot(`${map}-dessus`);
  await page.evaluate(() => window.gameHooks.debugColliders?.(true));
  await drawEdge(true);
  await shot(`${map}-dessus-colliders`);
  await page.evaluate(() => { window.__c4 = { pos: [0, 17, 21], look: [0, 0, -1.5] }; });
  await shot(`${map}-large-colliders`);
  await page.evaluate(() => { window.__c4 = { pos: [-16, 4, 13], look: [-6, 0, 3] }; });
  await shot(`${map}-bord-colliders`);
  await drawEdge(false);
  await page.evaluate(() => { window.gameHooks.debugColliders?.(false); window.__c4 = null; window.ctx.three.uiRoot.style.visibility = 'visible'; });

  // Chutes : 4 directions. Le perso court vers le vide pendant 4 s ; il doit passer sous y = -2.
  const chutes = {};
  for (const [nom, dir] of args.includes('--sans-chutes') ? [] : [['+x', [1, 0]], ['-x', [-1, 0]], ['+z', [0, 1]], ['-z', [0, -1]]]) {
    await start(map);
    const r = await page.evaluate(async ({ dir }) => {
      // Bord mesuré avec le test de sol du moteur (colliders de sol seulement, ni plateformes ni accessoires).
      const { isOverVoid } = await import('/src/scene/maps/engine.ts');
      let edge = 0;
      for (let d = 0; d < 30; d += 0.1) if (!isOverVoid([dir[0] * d, 0.1, dir[1] * d])) edge = d; else if (d > 3) break;
      // Téléportation par le vrai module du perso (corps Rapier + état), l'adversaire à l'opposé : reculer = vers le vide.
      const { teleport } = await import('/src/gameplay/character.ts');
      teleport(window.ctx, 1, [-dir[0] * 3, 0.1, -dir[1] * 3]);
      const s0 = Math.max(0, edge - 4);
      teleport(window.ctx, 0, [dir[0] * s0, 0.1, dir[1] * s0]);
      await new Promise((res) => setTimeout(res, 300));
      window.gameHooks.input(0, 'down', true);
      let minY = 9; const trace = [];
      for (let i = 0; i < 24; i++) {
        await new Promise((res) => setTimeout(res, 200));
        const q = window.gameState.players[0].pos; trace.push(q.map((v) => +v.toFixed(1)));
        minY = Math.min(minY, q[1]);
        if (minY < -2) break;
      }
      window.gameHooks.input(0, 'down', false);
      return { edge: +edge.toFixed(2), minY: +minY.toFixed(2), trace: minY < -2 ? trace.slice(-3) : trace };
    }, { dir });
    chutes[nom] = r;
    if (r.minY > -2) ok = false;
  }
  rapport[map] = { phase, appelsDeDessinJeu: calls, chutes };
  console.log(map, JSON.stringify(rapport[map]));
}
rapport.erreurs = erreurs.slice(0, 20);
writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 2));
console.log('erreurs console :', erreurs.length);
await browser.close();
process.exit(ok ? 0 : 1);
