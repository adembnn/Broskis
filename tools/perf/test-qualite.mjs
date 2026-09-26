// Test des paliers graphiques (src/core/quality.ts) : choix automatique sur chaque carte graphique du PC,
// ?q=, setQuality() de l'écran Settings, ombres/disques/décor lointain appliqués, aucune erreur console.
// Usage : node tools/perf/test-qualite.mjs [--port 5382]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', '5382'));
const base = `http://localhost:${PORT}`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));

let echecs = 0;
const verifier = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${msg}`); if (!ok) echecs++; };
const etat = () => {
  const q = window.__qualite; const s = window.ctx.three.scene;
  let ombres = 0; let lointainVisible = 0; let lointain = 0;
  s.traverse((o) => { if (o.isLight && o.castShadow) ombres++; if (o.userData.lointain) { lointain++; if (o.visible) lointainVisible++; } });
  const disques = s.getObjectByName('lperf-ombres-disques');
  return { palier: q.palier, niveau: q.niveau, echelle: q.echelle, banc: q.banc, gpu: q.gpu, ombres, lointain, lointainVisible,
    disques: !!disques?.visible, ratio: window.ctx.three.renderer.getPixelRatio() };
};

try {
  for (const gpu of ['nvidia', 'intel']) {
    const flags = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-backgrounding-occluded-windows'];
    if (gpu === 'nvidia') flags.push('--force_high_performance_gpu');
    const browser = await chromium.launch({ headless: false, args: flags });
    const erreurs = [];
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 160)); });
    await page.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__qualite?.banc != null, null, { timeout: 30000 });
    let e = await page.evaluate(etat);
    console.log(`\n== ${gpu} : ${e.gpu.replace(/^ANGLE \(|\(0x.*$/g, '')} · banc ${e.banc.toFixed(3)} ms · palier auto ${e.palier}`);
    verifier(gpu === 'nvidia' ? e.palier === 'haut' : e.palier !== 'haut', `palier automatique cohérent (${e.palier})`);
    await page.waitForFunction(() => window.__preload && window.__preload().rehearsalMs !== -1, null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => window.gameHooks.startMatch({ map: 'galion', seed: 1234 }));
    await page.waitForTimeout(4000);
    for (const niveau of ['low', 'medium', 'high']) {
      await page.evaluate((n) => { window.__qualite.setQuality(n); }, niveau);
      await page.waitForTimeout(1500);
      e = await page.evaluate(etat);
      const attendu = { low: 'bas', medium: 'moyen', high: 'haut' }[niveau];
      verifier(e.palier === attendu, `setQuality('${niveau}') → palier ${e.palier}`);
      if (attendu === 'bas') verifier(e.ombres === 0 && e.disques && e.lointainVisible === 0 && e.niveau === 'basse', `bas : 0 ombre portée (${e.ombres}), disques ${e.disques}, décor lointain caché (${e.lointainVisible}/${e.lointain}), rendu direct`);
      if (attendu === 'moyen') verifier(e.ombres > 0 && !e.disques && e.niveau === 'basse' && e.ratio <= 1.001, `moyen : ombres (${e.ombres}), rendu direct, ratio ${e.ratio}`);
      if (attendu === 'haut') verifier(e.ombres > 0 && e.niveau === 'haute' && e.lointainVisible === e.lointain, `haut : ombres, post-traitement, décor complet, ratio ${e.ratio}`);
      await page.screenshot({ path: `tools/perf/out/test-qualite-${gpu}-${attendu}.png` });
    }
    await page.evaluate(() => window.__qualite.setQuality('auto'));
    verifier(erreurs.length === 0, `aucune erreur console${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
  }
  // ?q= dans l'URL
  const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu'] });
  const page = await browser.newPage();
  await page.goto(`${base}/?demo=1&q=bas`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__qualite?.gpu !== undefined && window.ctx, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  verifier(await page.evaluate(() => window.__qualite.palier) === 'bas', '?q=bas force le palier bas même sur la NVIDIA');
  await browser.close();
} finally {
  server.kill();
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon');
process.exit(echecs ? 1 : 0);
