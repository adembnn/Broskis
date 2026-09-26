// Lot LE2E : un portrait de perso photo qui arrive APRÈS le délai d'écran (réseau lent) doit quand même s'appliquer,
// même en plein match. Le script retarde la réponse « portrait » de /api/scan-fighter de --retard secondes (vraie API
// derrière), passe l'écran des persos dès qu'il se débloque, lance le match, et vérifie que la grosse tête arrive.
//   node tools/e2e/portrait-tardif.mjs --visages <dossier> [--retard 30] [--port 5374]
// Visage FICTIF uniquement. Rapport : reports/e2e/portrait-tardif-<horodatage>/ (captures + resultat.json).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VISAGES = opt('--visages', null);
const RETARD_S = Number(opt('--retard', '30'));
let PORT = Number(opt('--port', '5374'));
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const OUT = join('reports', 'e2e', `portrait-tardif-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[portrait ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };

if (!VISAGES) { console.error('--visages <dossier> requis (visage-fictif-1.jpg)'); process.exit(1); }
for (let i = 0; i < 20 && (await up(`http://localhost:${PORT}/`)); i++) PORT += 1;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/e2e/vite.e2e.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const res = { retardS: RETARD_S };
try {
  for (let i = 0; i < 120 && !(await up(`http://localhost:${PORT}/`)); i++) await sleep(500);
  log(`Vite (PID ${server.pid}) sur ${PORT}`);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Réseau lent simulé : la réponse du portrait est retenue RETARD_S secondes (la vraie API répond derrière).
  await page.route('**/api/scan-fighter', async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    if (body.part !== 'portrait') return route.continue();
    const t0 = Date.now();
    const reponse = await route.fetch({ timeout: 120000 });
    const reste = RETARD_S * 1000 - (Date.now() - t0);
    if (reste > 0) await sleep(reste);
    res.portraitRenduApresS = Math.round((Date.now() - t0) / 1000);
    await route.fulfill({ response: reponse });
  });
  await page.goto(`http://localhost:${PORT}/`, { timeout: 180000 });
  await page.waitForFunction(() => !!window.ctx?.bus, null, { timeout: 180000 });
  await page.evaluate(() => {
    window.__portraits = [];
    window.ctx.bus.on('fighter:portrait', (e) => window.__portraits.push({ t: performance.now(), id: e.fighterId }));
  });
  await page.locator('.title-play').click({ force: true, timeout: 60000 });
  await page.locator('.fighter-grid').waitFor({ timeout: 30000 });
  const t0 = Date.now();
  await page.locator('.fighter-grid .snap-tile').first().click();
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.fighters-card button:has-text("Import a photo")').first().click()]);
  await ch.setFiles(join(VISAGES, 'visage-fictif-1.jpg'));
  await sleep(1500);
  await page.locator('.fighter-grid .fighter-tile:not(.snap-tile)').first().click(); // P2 : perso préréglé
  while (Date.now() - t0 < 60000 && (await page.locator('.ready-bar').isDisabled())) await sleep(300);
  res.ecranDebloqueS = Math.round((Date.now() - t0) / 1000);
  res.messageEcran = await page.evaluate(() => [...document.querySelectorAll('.fighter-panel .fighter-issue')].map((e) => e.textContent.trim()));
  log(`écran débloqué en ${res.ecranDebloqueS} s, message : ${res.messageEcran.join(' / ') || '(aucun)'}`);
  await page.screenshot({ path: join(OUT, '1-ecran-debloque.jpg'), type: 'jpeg', quality: 62 });
  await page.locator('.ready-bar').click({ force: true });
  for (const p of [1, 2]) {
    await page.locator(`.arsenal-card.p${p}`).waitFor({ timeout: 30000 });
    for (let i = 0; i < 3; i++) await page.locator(`.arsenal-card.p${p} .rack-tile:not(.snap-tile)`).nth(i).click();
    await page.locator(`.arsenal-card.p${p} .screen-foot button.cta`).click({ force: true });
  }
  const skip = page.locator('button:has-text("Skip presentation")');
  await skip.waitFor({ timeout: 15000 }).then(() => skip.click()).catch(() => {});
  await page.locator('.map-tile').first().click();
  await page.waitForFunction(() => window.gameState?.phase === 'fight', null, { timeout: 90000 });
  res.combatS = Math.round((Date.now() - t0) / 1000);
  res.teteAuDebutDuMatch = await page.evaluate(() => !!window.ctx.three.scene.getObjectByName('grosse-tete'));
  await page.screenshot({ path: join(OUT, '2-match-tete-de-secours.jpg'), type: 'jpeg', quality: 62 });
  log(`combat à ${res.combatS} s, grosse tête déjà là : ${res.teteAuDebutDuMatch}`);
  // Le portrait arrive pendant le combat : la grosse tête doit apparaître sur le perso de P1 (et sur la plaque du HUD).
  const tete = await page.waitForFunction(() => !!window.ctx.three.scene.getObjectByName('grosse-tete'), null, { timeout: 90000 }).then(() => true, () => false);
  res.evenement = await page.evaluate(() => window.__portraits);
  res.teteEnMatch = tete;
  res.teteArriveeS = Math.round((Date.now() - t0) / 1000);
  res.phaseALArrivee = await page.evaluate(() => window.gameState.phase);
  res.hudVisage = await page.evaluate(() => !!document.querySelector('.plate-portrait img.face'));
  await sleep(400);
  await page.screenshot({ path: join(OUT, '3-match-vraie-tete.jpg'), type: 'jpeg', quality: 62 });
  log(`grosse tête posée en plein match : ${tete} (à ${res.teteArriveeS} s, phase ${res.phaseALArrivee}), plaque HUD avec visage : ${res.hudVisage}`);
  await browser.close();
} catch (e) {
  res.erreur = e.message.split('\n')[0];
  log(`ERREUR ${res.erreur}`);
} finally {
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
}
res.verdict = !!(res.teteEnMatch && !res.teteAuDebutDuMatch && res.phaseALArrivee === 'fight') ? 'VERT' : 'ROUGE';
writeFileSync(join(OUT, 'resultat.json'), JSON.stringify(res, null, 1));
log(`${res.verdict} — ${JSON.stringify(res)}`);
