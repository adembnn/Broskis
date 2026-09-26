// Lot LWAIT-OBJ : scan RÉEL d'un objet dans l'arsenal (vrai dépôt de fichier → Gemini en flux + Nano Banana), capture
// de la carte en direct toutes les 0,5 s et chronologie de ce que voit le joueur, jusqu'à Confirm (arme prête).
// Usage : node tools/lwait-obj/stream.mjs <photo> [url] [dossier]
// Un seul navigateur, fermé à la fin (PID affiché). La photo est lue sur place, jamais copiée.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const photo = process.argv[2];
if (!photo) throw new Error('usage : node tools/lwait-obj/stream.mjs <photo> [url] [dossier]');
const url = process.argv[3] ?? 'http://127.0.0.1:5301/';
const OUT = process.argv[4] ?? 'captures/lwait-obj/scan';
const PAS_MS = 500;
mkdirSync(OUT, { recursive: true });

const server = await chromium.launchServer({
  headless: true,
  channel: 'chromium', // nouveau mode sans fenêtre : garde le GPU (l'ancien retombe sur un rendu logiciel très lent)
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force_high_performance_gpu'],
});
console.log('[navigateur] PID', server.process().pid);
const browser = await chromium.connect(server.wsEndpoint());
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('[lscan]')) console.log('[console]', m.type(), m.text());
  });
  await page.goto(url);
  console.log('[gpu]', await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl');
    const x = g?.getExtension('WEBGL_debug_renderer_info');
    return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'inconnu';
  }));
  await page.locator('.title-play').click({ force: true });
  await page.locator('.fighter-tile:not(.snap-tile)').nth(0).click();
  await page.locator('.fighter-tile:not(.snap-tile)').nth(1).click();
  await page.getByRole('button', { name: 'Ready to fight!' }).click({ force: true });
  await page.locator('.rack-tile.snap-tile').click();
  await page.locator('input[type=file]').setInputFiles(photo);
  const t0 = Date.now();
  await page.locator('.lscan').waitFor();
  const vu = [];
  let last = '';
  let pret = -1;
  for (let i = 0; i < 100; i++) {
    const etat = await page.evaluate(() => {
      const r = document.querySelector('.lscan');
      if (!r) return null;
      const t = (s) => r.querySelector(s)?.textContent?.trim() ?? '';
      const phys = [...r.querySelectorAll('.lscan-phys dd')].map((d) => d.textContent).join('|');
      return {
        state: r.getAttribute('data-state'),
        status: t('.lscan-status-text'),
        clock: t('.lscan-clock'),
        cat: t('.wc-category'),
        name: t('.lscan-name-text'),
        pips: r.querySelectorAll('.pip.filled').length,
        stamp: r.querySelector('.lscan-stamp')?.hidden ? '' : t('.lscan-stamp'),
        phys,
        confirm: r.querySelector('.lscan-actions .cta')?.disabled === false,
        canvas3d: !!r.querySelector('.lscan-3d.on'),
      };
    });
    if (!etat) break;
    const ligne = `${etat.state} | ${etat.status} | ${etat.cat} | ${etat.name} | pips ${etat.pips} | ${etat.stamp} | ${etat.phys} | 3D ${etat.canvas3d} | confirm ${etat.confirm}`;
    if (ligne !== last) {
      vu.push(`${String(Date.now() - t0).padStart(6)} ms (${etat.clock}) : ${ligne}`);
      last = ligne;
    }
    await page.locator('.lscan').screenshot({ path: `${OUT}/t${String(i).padStart(3, '0')}.png` });
    if (etat.confirm && pret < 0) pret = i;
    if (pret >= 0 && i - pret >= 3) break;
    const next = t0 + (i + 1) * PAS_MS;
    const wait = next - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  await page.screenshot({ path: `${OUT}/page-pret.png` });
  const confirm = page.locator('.lscan-actions .cta');
  if (await confirm.isEnabled()) {
    await confirm.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/page-apres-confirm.png` });
  }
  const scans = await page.evaluate(() => window.__scans);
  vu.push(`__scans : ${JSON.stringify(scans)}`);
  const etapes = (await page.evaluate(() => window.__lscan)) ?? [];
  vu.push('__lscan :', ...etapes.map((e) => `  carte ${e.card} ${String(e.t).padStart(6)} ms ${e.step}${e.fields ? ` [${e.fields}]` : ''}`));
  console.log(vu.join('\n'));
  writeFileSync(`${OUT}/chronologie.txt`, vu.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
