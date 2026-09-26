// Lot LJUMP : preuve chiffrée que le saut sert. `node tools/jump/test-saut.mjs` (lance son propre Vite sur 5195).
// Mesure, sur chaque map : apex du saut simple et du double saut (au sommet, puis en retard), atterrissage sur
// chaque plateforme traversable (double saut depuis le sol, dessous), coyote time au bord, chute d'un anneau de
// dalles sous les pieds (Archipel), chute hors du plateau. Saut par `gameHooks.input(p, 'jump', down)` (temps réel)
// s'il existe, sinon `gameHooks.jump()`. Un nouveau match par mesure : les sauts disponibles repartent de zéro.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 5195;
const URL = `http://localhost:${PORT}/`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

let server = null;
if (!(await up(URL))) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(URL)); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`); };

/** Nouveau match (sauts remis à zéro), perso actif posé en `pos` (sinon à son apparition). */
async function fresh(map, pos) {
  // Le bandeau READY/GO du tour par tour attend parfois qu'un perso soit « posé » : on relance au besoin.
  for (let k = 0; ; k++) {
    await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 7, stocks: 3 }), map);
    const ok = await page.waitForFunction(() => ['move', 'fight'].includes(window.gameState.phase), null, { timeout: 15000 }).then(() => true, () => false);
    if (ok) break;
    if (k >= 2) throw new Error(`phase bloquée : ${await page.evaluate(() => window.gameState.phase)}`);
  }
  await page.waitForTimeout(250);
  if (pos) {
    await page.evaluate((p) => { window.ctx.state.players[window.ctx.state.active].pos = p; }, pos);
    await page.waitForTimeout(400);
  }
  return page.evaluate(() => window.ctx.state.players[window.ctx.state.active].pos.slice());
}

/** Saut par le hook temps réel s'il existe, sinon `jump()`. */
const JUMP = `(() => { const h = window.gameHooks, a = window.ctx.state.active;
  if (typeof h.input === 'function') { h.input(a, 'jump', true); requestAnimationFrame(() => requestAnimationFrame(() => h.input(a, 'jump', false))); } else h.jump(); })()`;

/** Saut simple ou double (2e saut au sommet + `lateS`), mesuré image par image. */
function jumpProbe(opts) {
  return page.evaluate(({ double, lateS, durS, JUMP }) => new Promise((resolve) => {
    const a = window.ctx.state.active;
    const y0 = window.ctx.state.players[a].pos[1];
    let maxY = y0, second = false, apexT = null, prevY = y0, tSecond = null;
    const t0 = window.ctx.loop.time; // temps de JEU : insensible aux saccades du navigateur sans écran
    eval(JUMP);
    const tick = () => {
      const t = window.ctx.loop.time - t0;
      const y = window.ctx.state.players[a].pos[1];
      maxY = Math.max(maxY, y);
      if (double && !second) {
        if (apexT == null && t > 0.1 && y <= prevY) apexT = t;
        if (apexT != null && t - apexT >= lateS) { eval(JUMP); second = true; tSecond = t; }
      }
      prevY = y;
      if (t < durS) requestAnimationFrame(tick);
      else { const r = window.__lsmash.runtime(a); resolve({ y0, tSecond, apex: maxY - y0, endY: y, grounded: r.grounded, jumps: r.jumpsUsed }); }
    };
    requestAnimationFrame(tick);
  }), { ...opts, JUMP });
}

const state = () => page.evaluate(() => {
  const a = window.ctx.state.active; const p = window.ctx.state.players[a];
  return { pos: p.pos.slice(), rt: window.__lsmash.runtime(a), stocks: p.stocks, onLedge: p.onLedge, phase: window.ctx.state.phase, t: window.ctx.loop.time, active: a };
});
const platforms = () => page.evaluate(() => {
  const out = [];
  window.ctx.physics.world.forEachCollider((c) => {
    const d = c.parent()?.userData;
    if (d?.oneWay) { const t = c.translation(), he = c.halfExtents(); out.push({ topY: d.topY, cx: t.x, cz: t.z, hx: he.x, hz: he.z }); }
  });
  return out;
});
const f2 = (n) => n.toFixed(2);

try {
  await page.goto(`${URL}?demo=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.gameHooks && window.__lsmash && window.ctx, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  for (const map of ['archipel', 'cuisine', 'galion']) {
    const spawn = await fresh(map);
    const s1 = await jumpProbe({ double: false, lateS: 0, durS: 1.0 });
    log(`${map} saut simple`, s1.apex >= 1.0, `apex ${f2(s1.apex)} m`);
    await fresh(map);
    const s2 = await jumpProbe({ double: true, lateS: 0, durS: 1.6 });
    log(`${map} double saut au sommet`, s2.apex >= 2.4, `apex ${f2(s2.apex)} m`);
    await fresh(map);
    const s3 = await jumpProbe({ double: true, lateS: 0.15, durS: 1.6 });
    log(`${map} double saut en retard`, s3.apex >= 2.0 || s3.tSecond > 0.55, `apex ${f2(s3.apex)} m, 2e saut à ${f2(s3.tSecond)} s de jeu (sommet théorique 0,33 s)`);

    // Chaque plateforme traversable : double saut depuis le sol, sous son centre -> traverse en montant, posé dessus.
    for (const [i, pf] of (await platforms()).entries()) {
      const g = await fresh(map, [pf.cx, spawn[1] + 0.05, pf.cz]);
      await jumpProbe({ double: true, lateS: 0.05, durS: 1.8 });
      const s = await state();
      const onTop = s.rt.grounded && Math.abs(s.pos[1] - pf.topY) < 0.2;
      log(`${map} plateforme ${i} (dessus ${f2(pf.topY)} m)`, onTop, `départ y=${f2(g[1])} -> pieds ${f2(s.pos[1])} m, au sol=${s.rt.grounded}`);
    }
  }

  // Coyote time : on sort du bord en marchant (hook move, 2 appels = on insiste), saut juste après.
  {
    await fresh('cuisine');
    const r = await page.evaluate(() => window.__lsmash.arena());
    await page.evaluate(([cx, top, R]) => { window.ctx.state.players[window.ctx.state.active].pos = [cx + R - 0.3, top + 0.05, 0]; }, [r.center[0], r.top, r.radius]);
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.gameHooks.move(1.2, 0); window.gameHooks.move(1.2, 0); });
    await page.waitForTimeout(40);
    const p = await jumpProbe({ double: false, lateS: 0, durS: 0.8 });
    log('coyote : saut juste après avoir quitté le bord', p.jumps >= 1 && p.apex > 0.8, `sauts utilisés ${p.jumps}, montée ${f2(p.apex)} m`);
  }

  // Archipel : l'anneau extérieur tombe sous les pieds -> on tombe avec (pas de « surf » sur la dalle).
  {
    await fresh('archipel', [7.4, 0.05, 0]);
    const before = await state();
    await page.evaluate(() => window.ctx.bus.emit('map:event', { mapId: 'archipel', kind: 'ring' }));
    const tg = await page.evaluate(() => window.ctx.loop.time);
    await page.waitForFunction((t) => window.ctx.loop.time > t + 3, tg, { timeout: 60000 }); // 3 s de temps de JEU
    const st = await state();
    log('archipel anneau tombé sous les pieds', st.pos[1] < before.pos[1] - 1 || st.onLedge || st.stocks < before.stocks,
      `pieds ${f2(before.pos[1])} -> ${f2(st.pos[1])} m, accroché=${st.onLedge}, vies ${before.stocks} -> ${st.stocks} (phase ${st.phase}, t ${f2(before.t)} -> ${f2(st.t)})`);
  }

  // Chute hors du plateau : rattrapage au bord ou vie perdue, jamais bloqué.
  {
    await fresh('cuisine', [0, 1, 16]);
    const tg = await page.evaluate(() => window.ctx.loop.time);
    await page.waitForFunction((t) => window.ctx.loop.time > t + 3, tg, { timeout: 60000 });
    const st = await state();
    log('chute hors du plateau', st.stocks < 3 || st.onLedge, `vies 3 -> ${st.stocks}, accroché=${st.onLedge} (phase ${st.phase}, actif ${st.active}, t ${f2(st.t)})`);
  }
} finally {
  const uniq = [...new Set(errors)];
  console.log(`\nErreurs console (${errors.length}, ${uniq.length} distinctes) :`);
  for (const e of uniq.slice(0, 6)) console.log('  -', e.slice(0, 160).replace(/\n.*/s, ''));
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} vérifications OK`);
  await browser.close();
  if (server) server.kill();
}
