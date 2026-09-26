// Captures du README sur la version de démo compilée (http://localhost:4173/?demo=1).
import { chromium } from 'playwright';
const OUT = 'docs/screens';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto('http://localhost:4173/?demo=1', { timeout: 90000 });
await p.waitForFunction(() => window.gameHooks && window.ctx, null, { timeout: 90000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/title.png` });
const arsenal = await p.evaluate(async () => {
  const load = async (k) => { const w = await (await fetch(`/demo-cache/objects/${k}.json`)).json(); w.stickerUrl = w.stickerUrl || `/demo-cache/stickers/${k}.jpg`; w.id = `${w.id}-${Math.random().toString(36).slice(2, 6)}`; return w; };
  return [[await load('banana'), await load('coffee-mug'), await load('smartphone')], [await load('sneaker'), await load('plush-toy'), await load('water-bottle')]];
});
const shots = { archipel: 'arena-archipel.jpg', galion: 'arena-galion.jpg', cuisine: 'arena-cuisine.jpg' };
for (const [map, file] of Object.entries(shots)) {
  await p.evaluate(({ m, a }) => window.gameHooks.startMatch({ map: m, split: true, weapons: a, intro: false }), { m: map, a: arsenal });
  await p.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 40000 }).catch(() => {});
  await p.waitForTimeout(1500);
  // quelques pas + tirs croisés, capture au moment de l'impact
  await p.evaluate(() => { const h = window.gameHooks; h.input(0, 'up', true); h.input(1, 'up', true); });
  await p.waitForTimeout(700);
  await p.evaluate(() => { const h = window.gameHooks; h.input(0, 'up', false); h.input(1, 'up', false); h.input(0, 'fire', true); h.input(1, 'fire', true); });
  await p.waitForTimeout(250);
  await p.evaluate(() => { const h = window.gameHooks; h.input(0, 'fire', false); h.input(1, 'fire', false); });
  await p.waitForTimeout(550);
  await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 82 });
  console.log(map, await p.evaluate(() => window.gameState.phase), JSON.stringify(await p.evaluate(() => window.gameState.players.map((x) => x.pct))));
}
await p.evaluate(() => window.gameHooks.forcerVictoire(0));
await p.waitForTimeout(3500);
await p.screenshot({ path: `${OUT}/end.jpg`, type: 'jpeg', quality: 82 });
console.log('ERREURS', JSON.stringify(errs.slice(0, 5)));
await b.close();
