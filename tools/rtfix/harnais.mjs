// Harnais commun des scripts RTFIX (lot RTFIX, bugs du combat temps réel) : Vite du dépôt (port RTFIX_PORT,
// 5365 par défaut ; lancé ici s'il ne répond pas, et arrêté à la fin), UN Chromium avec GPU, fermé aussitôt,
// match temps réel prêt au combat, aides de mesure (sol sous un point, sol au-dessus d'un point).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

export const PORT = Number(process.env.RTFIX_PORT || 5365);
export const URL = `http://localhost:${PORT}/`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

export async function ouvrir() {
  let server = null;
  if (!(await up(URL))) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
    for (let i = 0; i < 80 && !(await up(URL)); i++) await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => !!window.gameHooks?.startMatch && !!window.ctx && !!window.__lsmash, null, { timeout: 90000 });
  await page.evaluate(() => {
    // Aides de mesure, injectées une fois : hauteur du sol sous / au-dessus d'un point (colliders solides actifs).
    const ctx = window.ctx;
    const solide = (c) => !c.isSensor() && c.isEnabled() && c.parent()?.userData?.kind !== 'player';
    window.__rtfix = {
      solBas(x, y, z, max = 30) {
        const { RAPIER: R, world } = ctx.physics;
        const hit = world.castRay(new R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), max, false, undefined, undefined, undefined, undefined, solide);
        return hit ? y - hit.timeOfImpact : null;
      },
      solHaut(x, y, z, max = 8) {
        const { RAPIER: R, world } = ctx.physics;
        const hit = world.castRay(new R.Ray({ x, y, z }, { x: 0, y: 1, z: 0 }), max, false, undefined, undefined, undefined, undefined, solide);
        return hit ? y + hit.timeOfImpact : null;
      },
      p(i) { return window.ctx.state.players[i].pos.slice(); },
    };
  });
  const fermer = async () => { await browser.close().catch(() => {}); if (server) server.kill(); };
  return { page, errors, fermer };
}

/** Nouveau match temps réel sur `map`, attend la phase `fight`. */
export async function combat(page, map, opts = {}) {
  await page.evaluate(({ m, o }) => window.gameHooks.startMatch({ map: m, split: true, seed: 7, stocks: 3, ...o }), { m: map, o: opts });
  await page.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 90000 });
  await page.waitForTimeout(200);
}

export const attendre = (page, ms) => page.waitForTimeout(ms);

/** Résultats : une ligne par vérification ; code de sortie 1 si l'une échoue. */
export function journal() {
  const res = [];
  return {
    ok(nom, cond, detail) { res.push({ nom, ok: !!cond, detail }); console.log(`${cond ? 'OK  ' : 'FAIL'} ${nom} — ${detail}`); },
    fin(errors) {
      const ko = res.filter((r) => !r.ok).length;
      if (errors?.length) console.log(`Erreurs console (${errors.length}) :\n  ${errors.slice(0, 8).join('\n  ')}`);
      console.log(`\n${res.length - ko}/${res.length} OK`);
      return ko ? 1 : 0;
    },
  };
}
