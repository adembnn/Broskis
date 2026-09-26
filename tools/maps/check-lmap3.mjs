// Contrôles du lot LMAP3 par script : hauteur des plateformes (<= MAX_LEDGE_HEIGHT), chute hors du plateau sans
// mur invisible (poussée latérale puis vérification que le perso passe sous le vide), appels de dessin de la
// scène seule (sans ombres, sans post-traitement), vue de jeu et vue d'épaule.
// Usage : node tools/maps/check-lmap3.mjs [--url http://localhost:5194] [--maps archipel,galion,cuisine]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5173');
const MAPS = opt('--maps', 'archipel,galion,cuisine').split(',');
const MAX_LEDGE = 2.0;

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.ctx && window.gameHooks, null, { timeout: 60000 });
let ok = true;
for (const map of MAPS) {
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 7 }), map);
  await page.waitForTimeout(5000);
  const r = await page.evaluate(async () => {
    const ctx = window.ctx;
    const tops = [];
    ctx.physics.world.forEachRigidBody((b) => { const u = b.userData; if (u && u.oneWay) tops.push({ id: u.id, topY: +u.topY.toFixed(2) }); });
    // Appels de dessin : scène seule, ombres figées, caméra du jeu puis vue d'épaule.
    const rd = ctx.three.renderer; const cam = ctx.three.camera;
    const shadowAuto = rd.shadowMap.autoUpdate; rd.shadowMap.autoUpdate = false;
    const count = () => { rd.info.autoReset = false; rd.info.reset(); rd.render(ctx.three.scene, cam); const c = rd.info.render.calls; const t = rd.info.render.triangles; rd.info.autoReset = true; return { calls: c, tris: t }; };
    const jeu = count();
    const saved = cam.position.clone();
    const p0 = window.gameState.players[0].pos, p1 = window.gameState.players[1].pos;
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2]; const d = Math.hypot(dx, dz) || 1;
    cam.position.set(p0[0] - dx / d * 4, p0[1] + 2.6, p0[2] - dz / d * 4); cam.lookAt(p1[0], 1, p1[2]); cam.updateMatrixWorld();
    const epaule = count();
    cam.position.copy(saved);
    rd.shadowMap.autoUpdate = shadowAuto;
    // Chute : on pousse P1 vers l'extérieur (sens -X, loin de P2) et on regarde s'il passe sous le plateau.
    let lost = false;
    const off = ctx.bus.on ? ctx.bus.on('stock:lost', () => { lost = true; }) : null;
    const start = [...window.gameState.players[0].pos];
    window.__mapFx({ kind: 'push', player: 0, vel: [-22, 3, 0] });
    let minY = start[1];
    for (let i = 0; i < 40; i++) { await new Promise((res) => setTimeout(res, 100)); minY = Math.min(minY, window.gameState.players[0].pos[1]); }
    if (typeof off === 'function') off();
    return { tops, jeu, epaule, start, minY: +minY.toFixed(2), lost, radius: window.ctx && null };
  });
  const tooHigh = r.tops.filter((t) => t.topY > MAX_LEDGE + 1e-3);
  const falls = r.lost || r.minY < -2;
  if (tooHigh.length || !falls) ok = false;
  console.log(`${map}: plateformes ${JSON.stringify(r.tops)} ${tooHigh.length ? 'TROP HAUTES' : 'OK (<= 2,0 m)'} · chute ${falls ? 'OK' : 'ÉCHEC'} (y min ${r.minY}, vie perdue ${r.lost}) · appels de dessin jeu ${r.jeu.calls} (${r.jeu.tris} tri) / épaule ${r.epaule.calls}`);
}
await browser.close();
process.exit(ok ? 0 : 1);
