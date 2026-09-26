// Test de bout en bout des règles v2 (lot LSMASH), dans un vrai navigateur, par les hooks ET par de vrais
// événements souris/clavier. Usage : node tools/balance/playtest-v2.mjs [url] [scénario…]
// (le serveur de jeu doit tourner à `url`, par défaut http://127.0.0.1:5347/). Sortie : événements du bus
// observés par scénario, captures dans captures/lsmash/, code 1 si un scénario échoue.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const URL = argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5347/';
const only = argv.filter((a) => !a.startsWith('http'));
const OUT = 'captures/lsmash';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL);
await page.waitForFunction(() => window.gameHooks && window.ctx && window.__lsmash, null, { timeout: 60000 });
await page.evaluate(() => {
  const KEEP = new Set(['match:banner', 'turn:start', 'fire', 'hit', 'stock:lost', 'ringout', 'respawn', 'ledge:grab',
    'ledge:climb', 'teeter', 'super:ready', 'super:fire', 'bro:gauge', 'move:jump', 'weapon:pick', 'parry:result',
    'ko', 'match:end', 'attack:nice']);
  window.__ev = [];
  window.ctx.bus.onAny((name, p) => {
    if (!KEEP.has(name)) return;
    const s = { ...p };
    if (s.weapon) s.weapon = s.weapon.category;
    for (const k of ['launch', 'knockback', 'pos', 'exitPos']) if (Array.isArray(s[k])) s[k] = s[k].map((v) => +v.toFixed(2));
    if (typeof s.value === 'number') s.value = +s.value.toFixed(2);
    if (typeof s.power === 'number') s.power = +s.power.toFixed(2);
    if (Array.isArray(s.dir)) delete s.dir;
    window.__ev.push({ t: +(performance.now() / 1000).toFixed(2), name, ...s });
  });
});

const results = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, arg, ms = 10000) { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); }
async function events() { return page.evaluate(() => window.__ev.splice(0)); }
async function state() { return page.evaluate(() => window.gameState); }
async function newMatch(opts = {}) {
  await page.evaluate((o) => { window.__ev.length = 0; window.gameHooks.startMatch({ seed: 7, map: 'archipel', ...o }); }, opts);
  await waitFor(() => window.gameState.phase === 'move', null, 15000);
}
async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }
/** Touche de déplacement vers le bord le plus proche du joueur actif (axe x ou z du monde). */
async function edgeKey(player) {
  return page.evaluate((pl) => {
    const a = window.__lsmash.arena();
    const p = window.gameState.players[pl].pos;
    const dx = p[0] - a.center[0], dz = p[2] - a.center[2];
    if (Math.abs(dx) >= Math.abs(dz)) return dx < 0 ? ['KeyA', 'KeyD', -1, 0] : ['KeyD', 'KeyA', 1, 0];
    return dz < 0 ? ['KeyW', 'KeyS', 0, -1] : ['KeyS', 'KeyW', 0, 1];
  }, player);
}

async function scenario(name, fn) {
  if (only.length && !only.includes(name)) return;
  const t0 = Date.now();
  let ok = true; let note = '';
  try { note = (await fn()) ?? ''; } catch (e) { ok = false; note = String(e?.message ?? e).split('\n')[0]; }
  const ev = await events().catch(() => []);
  results.push({ name, ok, note, ms: Date.now() - t0, events: ev });
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${name} — ${note}`);
}

await scenario('selftest', async () => {
  const r = await page.evaluate(() => window.__selftest());
  if (!r.ok) throw new Error(r.errors.join(' | '));
  return r.steps.join(' ; ');
});

await scenario('tir-souris', async () => {
  await newMatch();
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await wait(650);
  await page.mouse.up();
  await waitFor(() => window.__ev.some((e) => e.name === 'fire' && e.player === 0), null, 3000);
  await shot('tir-souris');
  await waitFor(() => window.__ev.some((e) => e.name === 'turn:start' && e.active === 1), null, 15000);
  const s = await state();
  return `P2 à ${s.players[1].pct} % après la rafale (visée calée, souris)`;
});

await scenario('tir-F', async () => {
  // Tour 2 (P2) du match précédent : tir au clavier.
  await waitFor(() => window.gameState.phase === 'move' && window.gameState.active === 1, null, 8000);
  await page.keyboard.down('KeyF');
  await wait(800);
  await page.keyboard.up('KeyF');
  await waitFor(() => window.__ev.some((e) => e.name === 'fire' && e.player === 1), null, 3000);
  await waitFor(() => window.__ev.some((e) => e.name === 'turn:start' && e.active === 0), null, 15000);
  const s = await state();
  return `P1 à ${s.players[0].pct} % après le tir à F`;
});

await scenario('bord-double-saut', async () => {
  await newMatch();
  const [toEdge, back] = await edgeKey(0);
  await page.keyboard.down(toEdge);
  await waitFor(() => window.__ev.some((e) => e.name === 'teeter' && e.on), null, 6000);
  await shot('bord-teeter');
  await wait(650); // on insiste : on passe dans le vide
  await page.keyboard.up(toEdge);
  await waitFor(() => !window.__lsmash.runtime(0).grounded, null, 2000);
  await page.keyboard.down(back);
  await page.keyboard.press('Space');
  await wait(220);
  await page.keyboard.press('Space');
  await wait(900);
  await page.keyboard.up(back);
  await waitFor(() => { const r = window.__lsmash.runtime(0); return r.grounded || r.ledge; }, null, 4000);
  await shot('bord-retour');
  const r = await page.evaluate(() => window.__lsmash.runtime(0));
  const s = await state();
  if (s.players[0].stocks !== 2) throw new Error('vie perdue en se rattrapant');
  return r.ledge ? 'rattrapé au bord (ledge)' : `revenu sur le plateau, y=${s.players[0].pos[1].toFixed(2)}, sauts=${r.jumpsUsed}`;
});

await scenario('ejection-vie-respawn', async () => {
  await newMatch();
  await page.evaluate(() => window.__lsmash.setPct(1, 190));
  await page.evaluate(() => { window.gameHooks.pickWeapon(1); window.gameHooks.fire(1); }); // grenade, visée calée
  await waitFor(() => window.__ev.some((e) => e.name === 'hit'), null, 6000);
  await wait(250);
  await shot('ejection-vol');
  await waitFor(() => window.__ev.some((e) => e.name === 'stock:lost'), null, 6000);
  await waitFor(() => window.__ev.some((e) => e.name === 'respawn'), null, 6000);
  await shot('ejection-respawn');
  const s = await state();
  return `P2 : ${s.players[1].stocks} vie(s), ${s.players[1].pct} %`;
});

await scenario('rattrapage-bord', async () => {
  await newMatch();
  const [, , dx, dz] = await edgeKey(1);
  const speed = await page.evaluate(([x, z]) => {
    for (let v = 3; v < 24; v += 0.25) if (window.__lsmash.predict(1, x, z, v) === 'ledge') return v;
    return null;
  }, [dx, dz]);
  if (speed == null) throw new Error('aucune vitesse ne donne un rattrapage');
  await page.evaluate(([x, z, v]) => window.__lsmash.launch(1, x, z, v), [dx, dz, speed]);
  await waitFor(() => window.__ev.some((e) => e.name === 'ledge:grab'), null, 5000);
  await shot('rattrapage-accroche');
  await page.evaluate(() => { window.gameHooks.pickWeapon(2); window.gameHooks.fire(0.5); }); // bouclier : tour suivant
  await waitFor(() => window.__ev.some((e) => e.name === 'ledge:climb'), null, 10000);
  await shot('rattrapage-remonte');
  return `accroché à ${speed} m/s puis remonté au début de son tour`;
});

await scenario('bro-smash', async () => {
  await newMatch();
  await page.evaluate(() => window.__lsmash.superReady(0));
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await wait(500);
  await page.mouse.up();
  await waitFor(() => window.__ev.some((e) => e.name === 'super:fire'), null, 3000);
  await wait(300);
  await shot('bro-smash');
  await waitFor(() => window.__ev.some((e) => e.name === 'turn:start' && e.active === 1), null, 15000);
  const s = await state();
  return `BRO SMASH tiré, P2 à ${s.players[1].pct} %`;
});

await scenario('game-fin', async () => {
  await newMatch({ stocks: 1 });
  await page.evaluate(() => window.__lsmash.setPct(1, 220));
  await page.evaluate(() => { window.gameHooks.pickWeapon(1); window.gameHooks.fire(1); });
  await waitFor(() => window.__ev.some((e) => e.name === 'match:end'), null, 12000);
  await shot('game');
  return 'dernière vie → match:banner game → match:end';
});

await scenario('tir-auto-15s', async () => {
  await newMatch();
  await waitFor(() => window.__ev.some((e) => e.name === 'fire'), null, 20000);
  const ev = await page.evaluate(() => window.__ev.find((e) => e.name === 'fire'));
  return `tir automatique : arme ${ev.weapon}, puissance ${ev.power}`;
});

writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ url: URL, results, consoleErrors }, null, 2));
console.log(`\nErreurs console : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log('  ', e.slice(0, 200));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
