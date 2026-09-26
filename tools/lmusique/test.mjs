// Lot LMUSIQUE : vérifie par script que les 3 pistes se chargent (200), changent aux bonnes phases
// (menu → combat au GO! → tendu en mort subite → menu à la fin) et que le bus musique baisse pendant une voix.
// Usage : node tools/lmusique/test.mjs [port]  (Vite doit tourner sur ce port)
import { chromium } from 'playwright';

const port = process.argv[2] ?? '5308';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const music = [];
page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[musique]')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.url().includes('/assets/music/')) music.push(`${r.status()} ${r.url().split('/').pop()}`); });

await page.goto(`http://localhost:${port}/?demo=1`);
await page.waitForFunction(() => window.gameHooks && window.__musique);
await page.mouse.click(5, 5); // geste utilisateur : débloque l'audio
const m = () => page.evaluate(() => ({ ...window.__musique, loaded: window.__musique.loaded, phase: window.gameState.phase }));
const waitTrack = async (id, ms = 8000) => {
  try { await page.waitForFunction((t) => window.__musique.track === t, id, { timeout: ms }); } catch (e) { console.log('ECHEC', id, JSON.stringify(await m()), errors, music); throw e; }
  return m();
};
const out = {};
out.titre = await waitTrack('menu');

await page.evaluate(() => window.gameHooks.startMatch({ split: true }));
await page.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 20000 });
out.combat = await waitTrack('combat');

// Ducking : on échantillonne le gain du bus pendant ~12 s, les répliques d'intro/GO! doivent le baisser.
const samples = [];
for (let i = 0; i < 60; i++) { samples.push(await page.evaluate(() => [window.__musique.ducked, +window.__musique.busGain.toFixed(3)])); await page.waitForTimeout(200); }
out.gainPendantVoix = Math.min(...samples.filter(([d]) => d).map(([, g]) => g));
out.gainSansVoix = Math.max(...samples.filter(([d]) => !d).map(([, g]) => g));
out.echantillonsVoix = samples.filter(([d]) => d).length;

// Mort subite : on récupère l'objet d'état vivant (window.gameState en est une copie JSON).
await page.evaluate(() => {
  const orig = JSON.stringify; let live = null;
  JSON.stringify = (v, ...a) => { live ??= v; return orig(v, ...a); };
  void window.gameState; JSON.stringify = orig; live.suddenDeath = true;
});
out.mortSubite = await waitTrack('tendu');

await page.evaluate(() => window.gameHooks.forcerVictoire(0));
out.fin = await waitTrack('menu');

console.log(JSON.stringify({ ...out, reseau: music, erreurs: errors }, null, 1));
await browser.close();
