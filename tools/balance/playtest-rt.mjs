// Test de bout en bout du cœur TEMPS RÉEL (lot RTCORE), dans un vrai navigateur, par de vrais événements
// clavier (les 2 joueurs en même temps) et par les hooks. Usage : node tools/balance/playtest-rt.mjs [url] [scénario…]
// (le serveur de jeu doit tourner à `url`, par défaut http://127.0.0.1:5347/). Sortie : événements du bus par
// scénario, captures dans captures/rtcore/, code 1 si un scénario échoue.
// Sans carte graphique (Chromium sans fenêtre), les images peuvent durer jusqu'à 1 s : délais larges exprès.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const URL = argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5347/';
const only = argv.filter((a) => !a.startsWith('http'));
const OUT = 'captures/rtcore';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL);
await page.waitForFunction(() => window.gameHooks && window.ctx && window.__lsmash, null, { timeout: 60000 });
await page.evaluate(() => {
  const KEEP = new Set(['match:banner', 'countdown', 'fire', 'hit', 'stock:lost', 'ringout', 'respawn', 'ledge:grab',
    'ledge:climb', 'teeter', 'super:ready', 'super:fire', 'move:jump', 'weapon:pick', 'weapon:ready', 'block',
    'parry:result', 'projectile:incoming', 'crate:grab', 'ko', 'match:end', 'ground:slippery', 'projectile:bounce']);
  window.__ev = [];
  window.ctx.bus.onAny((name, p) => {
    if (!KEEP.has(name)) return;
    const s = { ...p };
    if (s.weapon) s.weapon = s.weapon.category;
    for (const k of ['launch', 'knockback', 'pos', 'exitPos']) if (Array.isArray(s[k])) s[k] = s[k].map((v) => +v.toFixed(2));
    if (typeof s.power === 'number') s.power = +s.power.toFixed(2);
    if (Array.isArray(s.dir)) delete s.dir;
    window.__ev.push({ t: +(performance.now() / 1000).toFixed(2), name, ...s });
  });
});

const results = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, arg, ms = 15000) { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); }
async function events() { return page.evaluate(() => window.__ev.splice(0)); }
async function state() { return page.evaluate(() => window.gameState); }
async function newMatch(opts = {}) {
  await page.evaluate((o) => { window.__ev.length = 0; window.gameHooks.startMatch({ seed: 7, map: 'archipel', ...o }); }, opts);
  await waitFor(() => window.gameState.phase === 'fight', null, 30000);
}
async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

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

await scenario('clavier-2-joueurs', async () => {
  await newMatch();
  const s0 = await state();
  const d0 = dist(s0.players[0].pos, s0.players[1].pos);
  // Les deux avancent EN MÊME TEMPS (avant = vers l'adversaire) : P1 Z/W, P2 flèche haut.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await waitFor((d) => { const p = window.gameState.players; return Math.hypot(p[0].pos[0] - p[1].pos[0], p[0].pos[2] - p[1].pos[2]) < d - 3; }, d0, 15000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowUp');
  const s1 = await state();
  const moved0 = dist(s0.players[0].pos, s1.players[0].pos), moved1 = dist(s0.players[1].pos, s1.players[1].pos);
  if (moved0 < 0.5 || moved1 < 0.5) throw new Error(`un joueur n'a pas bougé (${moved0.toFixed(2)} / ${moved1.toFixed(2)} m)`);
  // Les deux tirent : P1 F, P2 L.
  await page.keyboard.down('KeyF'); await page.keyboard.down('KeyL');
  await wait(120);
  await page.keyboard.up('KeyF'); await page.keyboard.up('KeyL');
  await waitFor(() => window.__ev.filter((e) => e.name === 'fire').length >= 2, null, 8000);
  await wait(400);
  await shot('deux-joueurs');
  await waitFor(() => window.__ev.filter((e) => e.name === 'hit').length >= 2, null, 15000).catch(() => {});
  const s2 = await state();
  return `P1 a bougé de ${moved0.toFixed(1)} m, P2 de ${moved1.toFixed(1)} m en même temps ; tirs croisés → P1 ${s2.players[0].pct} %, P2 ${s2.players[1].pct} %`;
});

await scenario('blocage-et-parade', async () => {
  await newMatch();
  // P2 bloque au clavier (K) au moment où le repère part (≈ 400 ms avant l'impact) : blocage simple…
  await page.evaluate(() => {
    window.__blockPlan = 'early';
    window.ctx.bus.on('projectile:incoming', ({ target, etaMs }) => {
      if (target !== 1 || !window.__blockPlan) return;
      const plan = window.__blockPlan; window.__blockPlan = null;
      // « early » : dès le repère ; « perfect » : ~80 ms avant l'impact prévu.
      const delay = plan === 'perfect' ? Math.max(0, etaMs - 80) : 0;
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', key: 'k' })), delay);
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK', key: 'k' })), delay + 700);
    });
  });
  await page.keyboard.press('Digit2'); // grenade de P1
  await page.keyboard.down('KeyF'); await wait(100); await page.keyboard.up('KeyF');
  await waitFor(() => window.__ev.some((e) => e.name === 'parry:result'), null, 15000);
  const first = await page.evaluate(() => window.__ev.find((e) => e.name === 'parry:result'));
  // …puis tentative de parade PARFAITE sur le blaster (touche 1), dès qu'il est rechargé.
  await wait(1500);
  await page.evaluate(() => { window.__blockPlan = 'perfect'; });
  await page.keyboard.press('Digit1');
  await page.keyboard.down('KeyF'); await wait(80); await page.keyboard.up('KeyF');
  await waitFor(() => window.__ev.filter((e) => e.name === 'parry:result').length >= 2, null, 15000).catch(() => {});
  const all = await page.evaluate(() => window.__ev.filter((e) => e.name === 'parry:result').map((e) => `${e.grade} (${e.deltaMs} ms)`));
  return `bloqué : ${first.grade} ; toutes : ${all.join(', ')}`;
});

await scenario('bord-double-saut', async () => {
  await newMatch();
  // Reculer (S) éloigne de l'adversaire : P1 part vers son bord, vacille, insiste, tombe, puis double saut + avance.
  await page.keyboard.down('KeyS');
  await waitFor(() => window.__ev.some((e) => e.name === 'teeter' && e.player === 0 && e.on), null, 20000);
  await shot('bord-teeter');
  await waitFor(() => !window.__lsmash.runtime(0).grounded, null, 8000);
  await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyW');
  await page.keyboard.press('Space');
  await wait(250);
  await page.keyboard.press('Space');
  await waitFor(() => { const r = window.__lsmash.runtime(0); return (r.grounded && !r.launch) || r.ledge; }, null, 15000);
  await page.keyboard.up('KeyW');
  const r = await page.evaluate(() => window.__lsmash.runtime(0));
  const s = await state();
  if (s.players[0].stocks !== 2) throw new Error('vie perdue en se rattrapant');
  return r.ledge ? 'rattrapé au bord' : `revenu sur le plateau (${r.jumpsUsed} saut(s) comptés à l'atterrissage : ${JSON.stringify(await page.evaluate(() => window.__ev.filter((e) => e.name === 'move:jump').length))} sauts)`;
});

await scenario('ejection-vie-respawn', async () => {
  await newMatch();
  await page.evaluate(() => window.__lsmash.setPct(1, 190));
  await page.keyboard.press('Digit2');
  await page.keyboard.down('KeyF'); await wait(600); await page.keyboard.up('KeyF'); // grenade chargée
  await waitFor(() => window.__ev.some((e) => e.name === 'hit' && e.target === 1), null, 15000);
  await wait(200);
  await shot('ejection-vol');
  await waitFor(() => window.__ev.some((e) => e.name === 'stock:lost'), null, 15000);
  await waitFor(() => window.__ev.some((e) => e.name === 'respawn'), null, 15000);
  await shot('ejection-respawn');
  const s = await state();
  return `P2 : ${s.players[1].stocks} vie(s), ${s.players[1].pct} %`;
});

await scenario('rattrapage-bord', async () => {
  await newMatch();
  const dir = await page.evaluate(() => {
    const a = window.__lsmash.arena(); const p = window.gameState.players[1].pos;
    const dx = p[0] - a.center[0], dz = p[2] - a.center[2]; const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
  const speed = await page.evaluate(([x, z]) => {
    for (let v = 3; v < 26; v += 0.25) if (window.__lsmash.predict(1, x, z, v) === 'ledge') return v;
    return null;
  }, dir);
  if (speed == null) throw new Error('aucune vitesse ne donne un rattrapage');
  await page.evaluate(([x, z, v]) => window.__lsmash.launch(1, x, z, v), [...dir, speed]);
  await waitFor(() => window.__ev.some((e) => e.name === 'ledge:grab'), null, 15000);
  await shot('rattrapage-accroche');
  await page.keyboard.press('ShiftRight'); // P2 saute : remonte
  await waitFor(() => window.__ev.some((e) => e.name === 'ledge:climb'), null, 10000);
  return `accroché à ${speed} m/s, remonté avec MAJ DROITE`;
});

await scenario('bro-smash', async () => {
  await newMatch();
  await page.evaluate(() => window.__lsmash.superReady(0));
  await page.keyboard.down('KeyF'); await wait(100); await page.keyboard.up('KeyF');
  await waitFor(() => window.__ev.some((e) => e.name === 'super:fire'), null, 8000);
  await waitFor(() => window.__ev.some((e) => e.name === 'hit'), null, 15000).catch(() => {});
  await shot('bro-smash');
  const s = await state();
  return `BRO SMASH tiré, P2 à ${s.players[1].pct} %`;
});

await scenario('physique-objets', async () => {
  // Même arme (throwable 4/3/3) portée par 3 objets réels : chaise lourde, canette liquide, verre fragile.
  const mk = (id, object, physics) => ({
    id, object, name: object, category: 'throwable', why: '', stats: { a: 4, b: 3, c: 3 }, trait: 'heavy',
    palette: ['#888888', '#222222'], lines: { intro: '', hit: '', miss: '', parried: '' }, source: 'scan', cooldown: 0, physics,
  });
  const chair = mk('t-chair', 'chair', { massKg: 5, sizeM: [0.9, 0.5, 0.5], material: 'wood', shape: 'box', bounciness: 0.1, fragile: false, liquid: false });
  const can = mk('t-can', 'soda can', { massKg: 0.35, sizeM: [0.12, 0.066, 0.066], material: 'metal', shape: 'round', bounciness: 0.2, fragile: false, liquid: true });
  const glass = mk('t-glass', 'wine glass', { massKg: 0.2, sizeM: [0.2, 0.08, 0.08], material: 'glass', shape: 'long', bounciness: 0.05, fragile: true, liquid: false });
  await page.evaluate((w) => { window.__ev.length = 0; window.gameHooks.startMatch({ seed: 9, map: 'archipel', weapons: [w, w] }); }, [chair, can, glass]);
  await waitFor(() => window.gameState.phase === 'fight', null, 30000);
  const out = [];
  for (const [i, key] of [[0, 'Digit1'], [1, 'Digit2'], [2, 'Digit3']]) {
    await page.evaluate(() => { window.__lsmash.setPct(1, 0); window.__ev.length = 0; });
    await page.keyboard.press(key);
    await page.keyboard.down('KeyF'); await wait(60); await page.keyboard.up('KeyF');
    await waitFor(() => window.__ev.some((e) => e.name === 'fire'), null, 8000);
    const cd = await page.evaluate((k) => window.gameState.players[0].cooldowns[k], i);
    const hit = await page.waitForFunction(() => window.__ev.find((e) => e.name === 'hit' && e.target === 1), null, { timeout: 15000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    out.push(`${['chaise', 'canette', 'verre'][i]} : recharge ${cd.toFixed(2)} s, ${hit ? `${hit.damage} %, recul ${Math.hypot(...hit.launch).toFixed(1)} m/s, masse ${hit.mass} kg` : 'raté'}`);
    await wait(1500);
  }
  const extra = await page.evaluate(() => ({ flaques: window.__ev.filter((e) => e.name === 'ground:slippery').length }));
  return out.join(' ; ') + ` ; flaques ${extra.flaques}`;
});

await scenario('game-fin', async () => {
  await newMatch({ stocks: 1 });
  await page.evaluate(() => window.__lsmash.setPct(1, 260));
  await page.keyboard.press('Digit2');
  await page.keyboard.down('KeyF'); await wait(600); await page.keyboard.up('KeyF');
  await waitFor(() => window.__ev.some((e) => e.name === 'match:end'), null, 20000);
  await shot('game');
  return 'dernière vie → ko → match:banner game → match:end';
});

writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ url: URL, results, consoleErrors }, null, 2));
const kinds = {};
for (const e of consoleErrors) { const k = e.slice(0, 90); kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(`\nErreurs console : ${consoleErrors.length}`);
for (const [k, n] of Object.entries(kinds).slice(0, 8)) console.log(`  ${n} × ${k}`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
