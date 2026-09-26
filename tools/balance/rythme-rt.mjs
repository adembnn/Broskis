// Rythme d'un match temps réel (lot RTCORE) : deux « joueurs scriptés » tirent dès qu'une arme est prête, changent
// d'arme, tournent autour de l'adversaire et bloquent parfois. Mesure en TEMPS DE JEU (fiable même sans carte
// graphique) : instant des éjections, % au moment de l'éjection, durée du match.
// Usage : node tools/balance/rythme-rt.mjs [url] [nombre de matchs]
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const URL = argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5347/';
const N = Number(argv.find((a) => /^\d+$/.test(a)) ?? 2);
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
await page.goto(URL);
await page.waitForFunction(() => window.gameHooks && window.__lsmash, null, { timeout: 60000 });

const rows = [];
for (let m = 0; m < N; m++) {
  const r = await page.evaluate(async (seed) => {
    const H = window.gameHooks;
    const kos = [];
    window.__lastPct = [0, 0];
    window.__lastHitT = [-99, -99];
    const off = window.ctx.bus.on('stock:lost', ({ player, side }) => {
      const t = window.__lsmash.runtime(0).fightTime;
      kos.push({ t: +t.toFixed(1), player, pct: window.__lastPct[player], side, apresCoup: t - window.__lastHitT[player] < 3 });
    });
    const offHit = window.ctx.bus.on('hit', ({ target, pct }) => { window.__lastPct[target] = pct; window.__lastHitT[target] = window.__lsmash.runtime(0).fightTime; });
    H.startMatch({ seed, map: 'archipel', stocks: 2 });
    await new Promise((res) => { const w = () => (window.gameState.phase === 'fight' ? res() : setTimeout(w, 50)); w(); });
    const rnd = (() => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const strafe = [0, 0];
    const t0 = performance.now();
    while (window.gameState.phase === 'fight' && performance.now() - t0 < 240000) {
      const st = window.gameState;
      for (const p of [0, 1]) {
        const ps = st.players[p];
        // Arme prête (la moins chargée) : on la choisit et on tire (charge courte).
        const ready = ps.cooldowns.map((c, i) => [c, i]).filter(([c, i]) => c <= 0 && ps.weapons[i].category !== 'shield');
        if (ready.length && !ps.blocking) {
          const [, i] = ready[Math.floor(rnd() * ready.length)];
          if (ps.selected !== i) { H.input(p, `weapon${i + 1}`, true); H.input(p, `weapon${i + 1}`, false); }
          H.input(p, 'fire', true);
          setTimeout(() => H.input(p, 'fire', false), 150 + rnd() * 500);
        }
        // Tourne autour de l'adversaire (gauche/droite), avance un peu, recule parfois.
        if (rnd() < 0.08) {
          H.input(p, strafe[p] ? 'left' : 'right', false);
          strafe[p] = rnd() < 0.5 ? 1 : 0;
          H.input(p, strafe[p] ? 'left' : 'right', true);
        }
        if (rnd() < 0.05) { H.input(p, 'jump', true); setTimeout(() => H.input(p, 'jump', false), 80); }
        if (rnd() < 0.04) { H.input(p, 'parry', true); setTimeout(() => H.input(p, 'parry', false), 400); }
      }
      await new Promise((res) => setTimeout(res, 120));
    }
    for (const p of [0, 1]) for (const a of ['left', 'right', 'fire', 'parry']) H.input(p, a, false);
    off(); offHit();
    return { kos, end: +window.__lsmash.runtime(0).fightTime.toFixed(1), winner: window.gameState.winner, sd: window.gameState.suddenDeath };
  }, 100 + m);
  rows.push(r);
  console.log(`match ${m + 1} : ${JSON.stringify(r)}`);
}
const ko = rows.flatMap((r) => r.kos);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const parCoup = ko.filter((k) => k.apresCoup);
console.log(`\nÉjections : ${ko.length} (dont ${parCoup.length} juste après un coup, % moyen ${mean(parCoup.map((k) => k.pct)).toFixed(0)} ; ${ko.length - parCoup.length} chutes seules), 1re éjection à ${mean(rows.map((r) => r.kos[0]?.t ?? r.end)).toFixed(0)} s de jeu, match ${mean(rows.map((r) => r.end)).toFixed(0)} s de jeu.`);
await browser.close();
