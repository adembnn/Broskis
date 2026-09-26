// RTFIX : « P1 ne peut pas reculer depuis son apparition » (cuisine, galion ; SUIVI 17h32). `node tools/rtfix/recul.mjs`.
// Depuis l'apparition, chaque joueur maintient chaque direction 0,5 s de JEU : il doit bouger d'au moins 1,5 m (6,5 m/s).
// Mesure en temps de jeu : juste après le GO!, la machine chargée peut ne rendre que 2 à 3 images par demi-seconde.
// Puis « galion bloqué » : après une petite éjection (coup, vague), le perso doit pouvoir remarcher. Avant : les pieds
// posés pile sur le pont (écart < 2 cm) bloquaient le contrôleur Rapier, jusqu'au prochain saut.
import { attendre, combat, journal, ouvrir } from './harnais.mjs';

const { page, errors, fermer } = await ouvrir();
const J = journal();
try {
  for (const map of ['cuisine', 'galion', 'archipel']) {
    for (const dir of ['down', 'up', 'left', 'right']) {
      await combat(page, map);
      await attendre(page, 1500);
      const r = await page.evaluate((d) => new Promise((resolve) => {
        const a = window.ctx.state.players.map((p) => p.pos.slice());
        const t0 = window.ctx.loop.time;
        window.gameHooks.input(0, d, true); window.gameHooks.input(1, d, true);
        const tick = () => {
          if (window.ctx.loop.time - t0 < 0.5) { requestAnimationFrame(tick); return; }
          window.gameHooks.input(0, d, false); window.gameHooks.input(1, d, false);
          const b = window.ctx.state.players.map((p) => p.pos.slice());
          resolve({ d: [0, 1].map((i) => Math.hypot(b[i][0] - a[i][0], b[i][2] - a[i][2])), t: [0, 1].map((i) => window.__lsmash.runtime(i).teetering), a, b });
        };
        requestAnimationFrame(tick);
      }), dir);
      J.ok(`${map} ${dir} : les 2 joueurs bougent depuis l'apparition`, r.d[0] > 1.5 && r.d[1] > 1.5,
        `P1 ${r.d[0].toFixed(2)} m, P2 ${r.d[1].toFixed(2)} m${r.t[0] || r.t[1] ? ` (vacille : ${r.t})` : ''} ; P1 ${r.a[0].map((v) => v.toFixed(1))} -> ${r.b[0].map((v) => v.toFixed(1))}`);
    }
  }
  for (const map of ['galion', 'cuisine', 'archipel']) {
    await combat(page, map);
    await attendre(page, 1500);
    await page.evaluate(() => window.__lsmash.launch(0, 0, 1, 4));
    await page.waitForFunction(() => !window.__lsmash.runtime(0).launch, null, { timeout: 10000 });
    await attendre(page, 300);
    const r = await page.evaluate(() => new Promise((resolve) => {
      const a = window.ctx.state.players[0].pos.slice();
      const t0 = window.ctx.loop.time;
      window.gameHooks.input(0, 'left', true);
      const tick = () => {
        if (window.ctx.loop.time - t0 < 0.5) { requestAnimationFrame(tick); return; }
        window.gameHooks.input(0, 'left', false);
        const b = window.ctx.state.players[0].pos;
        resolve(Math.hypot(b[0] - a[0], b[2] - a[2]));
      };
      requestAnimationFrame(tick);
    }));
    J.ok(`${map} : on remarche après une petite éjection`, r > 1.5, `P1 ${r.toFixed(2)} m en 0,5 s`);
  }
} catch (e) {
  J.ok('script', false, String(e));
} finally {
  await fermer();
}
process.exit(J.fin(errors));
