// Banc du bot temps réel (lot RTBOT) : matchs solo où P1 est un humain simulé (script simple, src/gameplay/ai/sim-human.ts)
// et P2 le bot, joués en vrai dans le navigateur (Playwright), plusieurs pages en parallèle.
//   node tools/test-rtbot.mjs --port 5391 --niveaux easy,medium --matchs 10 --paralleles 4 [--hors-ligne] [--captures]
// Sortie : tableau par difficulté (victoires du bot, durée, coups, parades) + mesures Gemini, JSON dans captures/rtbot/.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', '5391'));
const niveaux = opt('--niveaux', 'easy,medium').split(',');
const matchs = Number(opt('--matchs', '10'));
const paralleles = Number(opt('--paralleles', '4'));
const stocks = Number(opt('--vies', '2'));
const horsLigne = args.includes('--hors-ligne');
// Gemini « lent » : chaque réponse de /api/ai-move retardée de 2,5 s (le jeu abandonne à 2 s) → mesure du maintien de la posture.
const geminiLent = args.includes('--gemini-lent');
const captures = args.includes('--captures');
// Sans rendu (défaut) : le banc mesure le gameplay ; le rendu 3D sans carte graphique ralentit le jeu sous le temps réel.
const avecRendu = captures || args.includes('--rendu');
const maps = opt('--maps', 'archipel,galion,cuisine').split(',');
const OUT = 'captures/rtbot';
mkdirSync(OUT, { recursive: true });

const url = `http://localhost:${port}/`;
async function up() { try { return (await fetch(url)).ok; } catch { return false; } }
let server = null;
if (!(await up())) {
  // Build figé + `vite preview` (défaut) : aucun rechargement à chaud si on modifie le code pendant le banc.
  // `--dev` : serveur de développement (plus rapide à lancer, mais recharge la page à chaque modification).
  const dev = args.includes('--dev');
  if (!dev) {
    const b = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'captures/rtbot/dist', '--emptyOutDir', '--logLevel', 'error'], { stdio: 'inherit' });
    if (b.status !== 0) throw new Error('build du banc en échec');
  }
  const cli = dev ? ['--port', String(port), '--strictPort'] : ['preview', '--outDir', 'captures/rtbot/dist', '--port', String(port), '--strictPort'];
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...cli], { stdio: 'ignore' });
  console.log(`Vite ${dev ? 'dev' : 'preview'} lancé (PID ${server.pid}) sur ${url}`);
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}

// Un banc interrompu ne laisse ni serveur ni navigateur derrière lui.
const cleanup = () => { try { server?.kill(); } catch { /* déjà arrêté */ } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function newPage() {
  const context = await browser.newContext({ viewport: captures ? { width: 1280, height: 720 } : { width: 640, height: 360 } });
  const page = await context.newPage();
  if (geminiLent) await page.route('**/api/ai-move', async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [erreur page]', String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.gameHooks && window.__bot && window.ctx, null, { timeout: 60000 });
  // Sans rendu : ni dessin 3D ni interface (mise en page du HUD) ; le gameplay tourne à l'identique.
  if (!avecRendu) await page.evaluate(() => { window.ctx.three.renderer.render = () => {}; window.ctx.three.uiRoot.style.display = 'none'; });
  await page.evaluate(() => {
    const log = { hits: [0, 0], perfect: [0, 0], good: [0, 0], fire: [0, 0], proj: [0, 0], jump: [0, 0], block: [0, 0], stock: [0, 0], crate: [0, 0], chutes: [0, 0], pctPerte: [[], []] };
    window.__rtlog = log;
    const b = window.ctx.bus;
    b.on('match:start', () => { for (const k of Object.keys(log)) log[k] = k === 'pctPerte' ? [[], []] : [0, 0]; });
    b.on('hit', ({ attacker }) => { log.hits[attacker] += 1; });
    b.on('parry:result', ({ player, grade }) => { if (grade === 'perfect') log.perfect[player] += 1; else if (grade === 'good') log.good[player] += 1; });
    b.on('fire', ({ player }) => { log.fire[player] += 1; });
    b.on('projectile:spawn', ({ owner }) => { if (owner === 0 || owner === 1) log.proj[owner] += 1; });
    b.on('move:jump', ({ player }) => { log.jump[player] += 1; });
    b.on('block', ({ player, on }) => { if (on) log.block[player] += 1; });
    b.on('stock:lost', ({ player, side }) => {
      log.stock[player] += 1;
      log.pctPerte[player].push(Math.round(window.ctx.state.players[player].pct));
      if (side === 'bottom') log.chutes[player] += 1; // sorti par le bas (chute, pas éjection latérale ou vers le ciel)
    });
    b.on('crate:grab', ({ player }) => { log.crate[player] += 1; });
  });
  return page;
}

async function playMatch(page, difficulty, seed, map, tag) {
  await page.evaluate(({ difficulty, seed, map, stocks, horsLigne }) => {
    window.__bot.simHuman(true, seed);
    window.__bot.offline(horsLigne);
    window.gameHooks.startMatch({ vsAI: true, difficulty, map, seed, stocks });
  }, { difficulty, seed, map, stocks, horsLigne });
  const t0 = Date.now();
  let shot = false;
  for (;;) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => ({ w: window.ctx.state.winner, phase: window.ctx.state.phase, rt: window.ctx.loop.realTime }));
    if (captures && !shot && s.phase === 'fight' && Date.now() - t0 > 12000) {
      shot = true;
      await page.evaluate(() => window.__bot.taunt());
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${tag}.png` });
    }
    if (s.w != null) break;
    if (Date.now() - t0 > 300000) break;
  }
  const wall = (Date.now() - t0) / 1000;
  const r = await page.evaluate(() => {
    const st = window.ctx.state;
    return {
      winner: st.winner, pct: st.players.map((p) => Math.round(p.pct)), stocks: st.players.map((p) => p.stocks),
      fightTime: window.__lsmash?.runtime(0)?.fightTime ?? null, realTime: window.ctx.loop.realTime,
      log: JSON.parse(JSON.stringify(window.__rtlog)), bot: window.__bot.info(),
    };
  });
  return { difficulty, seed, map, wall, ...r };
}

const jobs = [];
for (const d of niveaux) for (let i = 0; i < matchs; i++) jobs.push({ d, seed: 1000 + i * 17, map: maps[i % maps.length], tag: `${d}-${i}` });
const results = [];
async function worker(w) {
  const page = await newPage();
  for (;;) {
    const job = jobs.shift();
    if (!job) break;
    let res;
    const t0 = Date.now();
    let rt0 = 0;
    try {
      rt0 = await page.evaluate(() => window.ctx.loop.realTime);
      res = await playMatch(page, job.d, job.seed, job.map, job.tag);
    } catch (e) {
      console.log(`[p${w}] ${job.d} ${job.map} : match perdu (${String(e).slice(0, 120)})`);
      continue;
    }
    res.fps = null;
    res.gameSpeed = +((res.realTime - rt0) / ((Date.now() - t0) / 1000)).toFixed(2);
    results.push(res);
    const who = res.winner === 1 ? 'BOT' : res.winner === 0 ? 'humain' : '—';
    console.log(`[p${w}] ${job.d.padEnd(8)} ${job.map.padEnd(8)} gagnant=${who.padEnd(6)} ${res.fightTime?.toFixed(0)} s  % ${res.pct.join('/')}  coups h/b ${res.log.hits.join('/')}  parfaites h/b ${res.log.perfect.join('/')}  blocages h/b ${res.log.good.join('/')}  tirs h/b ${res.log.fire.join('/')}  précision h/b ${res.log.hits.map((h, i) => (h / Math.max(1, res.log.proj[i])).toFixed(2)).join('/')}  sauts b ${res.log.jump[1]}  vies perdues à h ${JSON.stringify(res.log.pctPerte[0])} b ${JSON.stringify(res.log.pctPerte[1])} (chutes h/b ${res.log.chutes.join('/')})  vitesse ${res.gameSpeed}  posture ${res.bot.stance}  gemini ${res.bot.gemini.ok}/${res.bot.gemini.requests}`);
  }
  await page.context().close();
}
await Promise.all(Array.from({ length: paralleles }, (_, i) => worker(i)));
await browser.close();
if (server) { server.kill(); console.log(`Vite arrêté (PID ${server.pid})`); }

const table = {};
for (const d of niveaux) {
  const rs = results.filter((r) => r.difficulty === d);
  const wins = rs.filter((r) => r.winner === 1).length;
  const lat = rs.flatMap((r) => r.bot.gemini.latenciesMs);
  const g = rs.reduce((a, r) => ({ req: a.req + r.bot.gemini.requests, ok: a.ok + r.bot.gemini.ok, fail: a.fail + r.bot.gemini.failed, kept: a.kept + r.bot.gemini.keptOnFailure, local: a.local + r.bot.gemini.localFallbacks, changes: a.changes + r.bot.gemini.stanceChanges }), { req: 0, ok: 0, fail: 0, kept: 0, local: 0, changes: 0 });
  lat.sort((a, b) => a - b);
  const avg = (k, p) => +(rs.reduce((a, r) => a + r.log[k][p], 0) / Math.max(1, rs.length)).toFixed(1);
  table[d] = {
    matchs: rs.length, victoiresBot: wins, tauxBot: rs.length ? +(wins / rs.length).toFixed(2) : null,
    dureeMoyS: +(rs.reduce((a, r) => a + (r.fightTime ?? 0), 0) / Math.max(1, rs.length)).toFixed(0),
    coupsHumain: avg('hits', 0), coupsBot: avg('hits', 1), parfaitesHumain: avg('perfect', 0), parfaitesBot: avg('perfect', 1),
    blocagesBot: avg('good', 1), sautsBot: avg('jump', 1), tirsBot: avg('fire', 1), vitesseJeu: +(rs.reduce((a, r) => a + r.gameSpeed, 0) / Math.max(1, rs.length)).toFixed(2),
    gemini: { ...g, latenceMedMs: lat.length ? lat[Math.floor(lat.length / 2)] : null, latenceP90Ms: lat.length ? lat[Math.floor(lat.length * 0.9)] : null, latenceMaxMs: lat.length ? lat[lat.length - 1] : null },
  };
}
console.log(JSON.stringify(table, null, 2));
writeFileSync(`${OUT}/resultats-${horsLigne ? 'hors-ligne' : geminiLent ? 'gemini-lent' : 'gemini'}-${niveaux.join('-')}.json`, JSON.stringify({ table, results }, null, 2));
