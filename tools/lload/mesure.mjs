// Lot LLOAD : mesure des attentes perçues sur le parcours (titre → persos → arsenal → présentation → map → match).
// Usage : node tools/lload/mesure.mjs [url] [dossier-captures] [pause-titre-ms]   (défaut http://localhost:5343/?demo=1, captures/lload, 0)
// Chromium AVEC fenêtre et GPU (les temps de compilation des shaders n'ont de sens qu'avec un vrai GPU).
// Mesures :
//   - titre : navigation → bouton PLAY visible ;
//   - présentation : entrée dans l'écran → première carte visible, et → bouton « Next » actif ;
//   - map → jeu : clic sur la map → scène stable (plus aucun mesh ni programme GPU ajouté pendant 600 ms),
//     plus la pire image (saccade) et le nombre d'images > 50 ms dans les 8 s qui suivent le clic.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5343/?demo=1';
const OUT = process.argv[3] ?? 'captures/lload';
const PAUSE_TITRE = Number(process.argv[4] ?? 0); // un humain lit l'écran-titre avant de cliquer
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
page.on('pageerror', (e) => erreurs.push(e.message));

await page.addInitScript(() => {
  window.__frames = [];
  let last = performance.now();
  const f = (t) => { window.__frames.push([t, t - last]); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
});

const now = () => page.evaluate(() => performance.now());
const r = {};

await page.goto(url);
await page.getByRole('button', { name: 'PLAY', exact: true }).waitFor({ timeout: 30000 });
r.titreVisibleMs = Math.round(await now());
if (PAUSE_TITRE) await page.waitForTimeout(PAUSE_TITRE);
await page.evaluate(() => {
  window.__ev = [];
  window.ctx.bus.onAny((name) => window.__ev.push([performance.now(), name]));
});
await page.getByRole('button', { name: 'PLAY', exact: true }).click();

// Persos : J1 puis J2 (premières tuiles).
await page.locator('.fighter-tile').first().click();
await page.getByText('Player 2', { exact: false }).first().waitFor();
await page.locator('.fighter-tile').nth(1).click();

// Arsenal : 3 armes du râtelier pour chacun.
for (let p = 0; p < 2; p++) {
  await page.getByText(`Player ${p + 1}: build your arsenal`).waitFor();
  for (let i = 0; i < 3; i++) await page.locator('.rack-tile').nth(i + p).click();
  const tConfirm = await now();
  await page.getByRole('button', { name: 'Confirm arsenal' }).click();
  if (p === 1) r._revealStart = tConfirm;
}

// Présentation des armes.
await page.locator('.reveal-card, .lload-reveal').first().waitFor({ timeout: 30000 });
await page.screenshot({ path: `${OUT}/presentation-debut.png` });
await page.locator('.reveal-stage > *').first().waitFor({ timeout: 120000 });
r.presentationPremiereCarteMs = Math.round((await now()) - r._revealStart);
await page.getByRole('button', { name: /^(Next|To the map)$/ }).waitFor({ timeout: 120000 });
r.presentationBoutonActifMs = Math.round((await now()) - r._revealStart);
await page.screenshot({ path: `${OUT}/presentation-carte.png` });
await page.getByRole('button', { name: 'Skip presentation' }).click();

// Choix de la map → match.
await page.locator('.map-tile').first().waitFor();
await page.waitForTimeout(1500); // laisse le temps au préchargement éventuel pendant le choix (joueur réel : 2-5 s)
// Échantillonnage DANS la page (toutes les 6 images) : aucun aller-retour Playwright pendant la mesure, qui
// fausserait les temps d'image. Les captures sont prises à la fin (2 seules, hors fenêtre mesurée).
await page.evaluate(() => {
  window.__samples = [];
  let n = 0;
  const f = () => {
    if (n++ % 6 === 0) {
      let meshes = 0;
      window.ctx.three.scene.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) meshes++; });
      window.__samples.push({ t: performance.now(), meshes, programmes: window.ctx.three.renderer.info.programs?.length ?? 0 });
    }
    if (window.__samples.length < 400) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const tClic = await now();
await page.locator('.map-tile').first().click();
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/map-plus-450ms.png` });
await page.waitForTimeout(8000);
const echantillons = await page.evaluate(() => window.__samples.filter((s) => s.t >= 0));
let tStable = tClic;
for (let i = 1; i < echantillons.length; i++) {
  const a = echantillons[i - 1], b = echantillons[i];
  if (a.meshes !== b.meshes || a.programmes !== b.programmes) tStable = b.t;
}
const frames = await page.evaluate(() => window.__frames);
const apres = frames.filter(([t]) => t >= tClic && t <= tClic + 8000);
r.mapVersSceneStableMs = Math.round(tStable - tClic);
r.pireImageMs = Math.round(Math.max(...apres.map(([, d]) => d)));
r.imagesPlusDe50ms = apres.filter(([, d]) => d > 50).length;
r.meshesFinal = echantillons.at(-1).meshes;
r.programmesFinal = echantillons.at(-1).programmes;
const ev = await page.evaluate(() => window.__ev);
const tBanner = ev.find(([, n]) => n === 'match:banner');
r.mapVersBandeauReadyMs = tBanner ? Math.round(tBanner[0] - tClic) : null;
const tStart = ev.find(([, n]) => n === 'match:start');
r.mapVersMatchStartMs = tStart ? Math.round(tStart[0] - tClic) : null;
// Rideau (lot LLOAD) : ce qui se passe rideau fermé ne se voit pas. Images VISIBLES = avant la fermeture du rideau
// (250 ms) et après son ouverture ; sans rideau, tout est visible dès le clic.
const tOpen = ev.find(([, n]) => n === 'transition:open');
r.mapVersRideauOuvertMs = tOpen ? Math.round(tOpen[0] - tClic) : null;
r.etapesRideau = await page.evaluate(() => window.__lloadTransition ?? null);
const visibles = apres.filter(([t]) => !tOpen || t <= tClic + 250 || t >= tOpen[0]);
r.pireImageVisibleMs = Math.round(Math.max(...visibles.map(([, d]) => d)));
r.imagesVisiblesPlusDe50ms = visibles.filter(([, d]) => d > 50).length;
r.longuesImagesVisibles = visibles.filter(([, d]) => d > 50).map(([t, d]) => `+${Math.round(t - tClic)}ms:${Math.round(d)}ms`).slice(0, 20);
await page.screenshot({ path: `${OUT}/map-final.png` });
delete r._revealStart;
r.erreurs = erreurs.slice(0, 10);
console.log(JSON.stringify(r, null, 2));
writeFileSync(`${OUT}/mesure.json`, JSON.stringify(r, null, 2));
await browser.close();
