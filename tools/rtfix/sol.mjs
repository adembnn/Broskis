// RTFIX, priorité 1 : « les joueurs passent SOUS LA MAP ». `node tools/rtfix/sol.mjs` (Vite du dépôt sur 5365).
// Chaque scénario échoue avant le correctif et passe après :
//  1. flotte   : descendre d'une caisse (galion, 1,27 m) en marchant -> on retombe sur le pont (avant : on
//                marchait dans le vide à 1,27 m, le sol « à moins de 1,35 m » comptait comme un appui) ;
//  2. gite     : pont du galion qui gîte (vague) -> les pieds suivent le pont (avant : enfoncés jusqu'à 1 m
//                dans le pont côté arrière, en l'air côté avant) ;
//  3. dessous  : tomber à côté du plateau en revenant vers le centre -> jamais sous le plateau (avant : on
//                passait sous la dalle de 0,6 m, dans le meuble / la coque / le socle rocheux).
import { attendre, combat, journal, ouvrir } from './harnais.mjs';

const seul = process.argv[2];
const { page, errors, fermer } = await ouvrir();
const J = journal();

try {
  if (!seul || seul === 'flotte') {
    await combat(page, 'galion');
    await page.evaluate(() => { window.__lsmash.place(1, 6, 0.1, 0); window.__lsmash.place(0, -8.2, 1.6, 2.9); });
    await attendre(page, 700);
    const surCaisse = await page.evaluate(() => window.__rtfix.p(0)[1]);
    await page.evaluate(() => window.gameHooks.input(0, 'left', true));
    await attendre(page, 450);
    await page.evaluate(() => window.gameHooks.input(0, 'left', false));
    await attendre(page, 700);
    const [x, y, z] = await page.evaluate(() => window.__rtfix.p(0));
    const sol = await page.evaluate(([a, b, c]) => window.__rtfix.solBas(a, b + 0.05, c), [x, y, z]);
    J.ok('flotte : descendre d\'une caisse en marchant', surCaisse > 1.1 && sol != null && Math.abs(y - sol) < 0.12,
      `sur la caisse y=${surCaisse.toFixed(2)} ; après : pieds y=${y.toFixed(2)}, sol dessous y=${sol?.toFixed(2)}`);
  }

  if (!seul || seul === 'gite') {
    await combat(page, 'galion');
    await page.evaluate(() => { window.__lsmash.place(0, -1, 0.3, -4); window.__lsmash.place(1, 3, 0.3, 3); });
    await attendre(page, 600);
    const mesure = await page.evaluate(() => new Promise((resolve) => {
      const ctx = window.ctx;
      ctx.bus.emit('map:event', { mapId: 'galion', kind: 'wave' });
      const t0 = performance.now();
      let enfonce = 0, enLair = 0, n = 0;
      const tick = () => {
        for (const i of [0, 1]) {
          const rt = window.__lsmash.runtime(i);
          if (rt.launch || rt.dead || rt.ledge) continue;
          const [x, y, z] = ctx.state.players[i].pos;
          const sol = window.__rtfix.solBas(x, y + 2.5, z, 6);
          if (sol == null) continue;
          n++;
          enfonce = Math.max(enfonce, sol - y);
          if (rt.grounded) enLair = Math.max(enLair, y - sol);
        }
        if (performance.now() - t0 < 3200) requestAnimationFrame(tick); else resolve({ enfonce, enLair, n });
      };
      requestAnimationFrame(tick);
    }));
    J.ok('gite : les pieds suivent le pont qui gîte', mesure.enfonce < 0.12 && mesure.enLair < 0.12,
      `enfoncé max ${mesure.enfonce.toFixed(2)} m, « au sol » en l'air max ${mesure.enLair.toFixed(2)} m (${mesure.n} mesures)`);
  }

  if (!seul || seul === 'dessous') {
    // Perso lâché à côté du plateau, sous le niveau du dessus, qui revient vers le centre (avant = vers P2).
    const cas = [
      { map: 'cuisine', p1: [14.2, -2.7, 0], p2: [-6, 0.1, 0] },
      { map: 'archipel', p1: [13.9, -2.7, 0], p2: [-6, 0.1, 0] },
      { map: 'galion', p1: [-14.1, -2.7, 0], p2: [6, 0.1, 0] },
    ];
    for (const c of cas) {
      await combat(page, c.map);
      const r = await page.evaluate(({ p1, p2 }) => new Promise((resolve) => {
        const ctx = window.ctx;
        window.__lsmash.place(1, ...p2);
        window.__lsmash.place(0, ...p1);
        window.gameHooks.input(0, 'up', true);
        const t0 = performance.now();
        let dessous = 0, pire = null;
        const tick = () => {
          const rt = window.__lsmash.runtime(0);
          const [x, y, z] = ctx.state.players[0].pos;
          if (!rt.dead) {
            // Sous le plateau : un sol solide juste au-dessus de la tête ou dans le corps.
            const plafond = window.__rtfix.solHaut(x, y + 0.05, z, 2.5);
            if (plafond != null && plafond <= 0.05) { dessous++; if (!pire) pire = [x, y, z].map((v) => +v.toFixed(2)); }
          }
          if (performance.now() - t0 < 1500 && !rt.dead) requestAnimationFrame(tick);
          else { window.gameHooks.input(0, 'up', false); resolve({ dessous, pire, fin: ctx.state.players[0].pos.map((v) => +v.toFixed(2)), ledge: !!rt.ledge, dead: rt.dead }); }
        };
        requestAnimationFrame(tick);
      }), c);
      J.ok(`dessous (${c.map}) : jamais sous le plateau en revenant vers lui`, r.dessous === 0,
        `${r.dessous} image(s) sous le plateau${r.pire ? ` (1re : ${r.pire})` : ''} ; fin ${r.fin}${r.ledge ? ' accroché au bord' : ''}${r.dead ? ' sorti' : ''}`);
    }
  }
} catch (e) {
  J.ok('script', false, String(e));
} finally {
  await fermer();
}
process.exit(J.fin(errors));
