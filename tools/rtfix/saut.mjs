// RTFIX, priorité 2 : sauts et plateformes. `node tools/rtfix/saut.mjs` (Vite du dépôt sur 5365).
//  1. apex    : saut simple ≈ 1,09 m, double saut ≈ 2,4-2,6 m (constantes LJUMP), le suivi du sol ne mange rien ;
//  2. chaque  : 6 appuis espacés -> 6 sauts (`move:jump`), aucun appui perdu ;
//  3. plateforme : double saut depuis le dessous -> debout dessus 2 s (pieds ≈ dessus) ;
//  4. respawn : saut pendant le vol stationnaire de réapparition -> le perso saute (avant : appui perdu) ;
//  5. selftest : window.__selftest() passe.
import { attendre, combat, journal, ouvrir } from './harnais.mjs';

const seul = process.argv[2];
const { page, errors, fermer } = await ouvrir();
const J = journal();

/** Appui bref sur saut (même chemin que le clavier). */
const SAUT = (p) => page.evaluate((i) => { window.gameHooks.input(i, 'jump', true); setTimeout(() => window.gameHooks.input(i, 'jump', false), 60); }, p);

try {
  if (!seul || seul === 'apex') {
    await combat(page, 'archipel');
    const y0 = await page.evaluate(() => window.__rtfix.p(0)[1]);
    const simple = await page.evaluate(() => new Promise((resolve) => {
      const y0 = window.ctx.state.players[0].pos[1];
      let max = y0; const t0 = performance.now();
      window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60);
      const tick = () => { max = Math.max(max, window.ctx.state.players[0].pos[1]); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(max - y0); };
      requestAnimationFrame(tick);
    }));
    J.ok('apex : saut simple ≈ 1,09 m', simple > 0.95 && simple < 1.2, `${simple.toFixed(2)} m (pieds au départ y=${y0.toFixed(2)})`);
    await attendre(page, 500);
    const double = await page.evaluate(() => new Promise((resolve) => {
      const y0 = window.ctx.state.players[0].pos[1];
      let max = y0, prev = y0, second = false; const t0 = performance.now();
      window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60);
      const tick = () => {
        const y = window.ctx.state.players[0].pos[1];
        max = Math.max(max, y);
        if (!second && performance.now() - t0 > 120 && y <= prev) { second = true; window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60); }
        prev = y;
        if (performance.now() - t0 < 1600) requestAnimationFrame(tick); else resolve(max - y0);
      };
      requestAnimationFrame(tick);
    }));
    J.ok('apex : double saut au sommet ≈ 2,4-2,6 m', double > 2.25 && double < 2.75, `${double.toFixed(2)} m`);
  }

  if (!seul || seul === 'chaque') {
    await combat(page, 'cuisine');
    await page.evaluate(() => { window.__sauts = 0; window.ctx.bus.on('move:jump', (e) => { if (e.player === 0) window.__sauts++; }); });
    for (let i = 0; i < 6; i++) { await SAUT(0); await attendre(page, 850); }
    const n = await page.evaluate(() => window.__sauts);
    J.ok('chaque : 6 appuis -> 6 sauts', n === 6, `${n} sauts émis`);
  }

  if (!seul || seul === 'plateforme') {
    for (const map of ['archipel', 'galion', 'cuisine']) {
      await combat(page, map);
      const pf = await page.evaluate(() => window.__lsmash.oneWay()[0]);
      await page.evaluate(({ cx, cz }) => { window.__lsmash.place(0, cx, 0.3, cz); }, pf);
      await attendre(page, 500);
      await page.evaluate(() => new Promise((resolve) => {
        let prev = window.ctx.state.players[0].pos[1], second = false; const t0 = performance.now();
        window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60);
        const tick = () => {
          const y = window.ctx.state.players[0].pos[1];
          if (!second && performance.now() - t0 > 120 && y <= prev) { second = true; window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60); }
          prev = y;
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      }));
      const ys = [];
      for (let i = 0; i < 8; i++) { ys.push(await page.evaluate(() => window.__rtfix.p(0)[1])); await attendre(page, 250); }
      const ok = ys.every((y) => Math.abs(y - pf.topY) < 0.08);
      J.ok(`plateforme (${map}) : double saut depuis le dessous -> debout dessus 2 s`, ok, `dessus y=${pf.topY.toFixed(2)} ; pieds ${ys.map((y) => y.toFixed(2)).join(' ')}`);
    }
  }

  if (!seul || seul === 'respawn') {
    await combat(page, 'archipel');
    await page.evaluate(() => window.__lsmash.launch(0, 1, 0, 60));
    await page.waitForFunction(() => window.__lsmash.runtime(0).dead === false && window.ctx.state.players[0].stocks < 3, null, { timeout: 15000 });
    const r = await page.evaluate(() => new Promise((resolve) => {
      const y0 = window.ctx.state.players[0].pos[1];
      let max = y0; const t0 = performance.now();
      setTimeout(() => { window.gameHooks.input(0, 'jump', true); setTimeout(() => window.gameHooks.input(0, 'jump', false), 60); }, 250);
      const tick = () => { max = Math.max(max, window.ctx.state.players[0].pos[1]); if (performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve({ y0, gain: max - y0 }); };
      requestAnimationFrame(tick);
    }));
    J.ok('respawn : sauter pendant le vol stationnaire fait sauter', r.gain > 0.8, `gain de hauteur ${r.gain.toFixed(2)} m (réapparu à y=${r.y0.toFixed(2)})`);
  }

  if (!seul || seul === 'selftest') {
    const st = await page.evaluate(() => window.__selftest());
    J.ok('selftest : window.__selftest()', st.ok, `${st.steps.length} étapes${st.errors.length ? ` ; erreurs : ${st.errors.join(' | ')}` : ''}`);
  }
} catch (e) {
  J.ok('script', false, String(e));
} finally {
  await fermer();
}
process.exit(J.fin(errors));
