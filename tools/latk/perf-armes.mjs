// Mesure du coût des armes (lot LATK1) : pire image par système de la boucle (window.__perfSys) pendant des tirs
// de chaque catégorie, et images longues (> 50 ms) observées.
// Usage : node tools/latk/perf-armes.mjs [--port 5362]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', 5362));
const url = `http://localhost:${PORT}/?demo=1`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
if (await up(url)) { console.error(`Port ${PORT} déjà occupé : choisis un port libre avec --port.`); process.exit(2); }
let server = null;
if (!(await up(url))) {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));
try {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.gameHooks && window.ctx, null, { timeout: 30000 });
  const presets = JSON.parse(readFileSync('public/assets/presets/presets.json', 'utf8'));
  const list = Array.isArray(presets) ? presets : presets.weapons ?? Object.values(presets);
  const byId = Object.fromEntries(list.map((w) => [w.id, { ...w, cooldown: 0, source: 'preset' }]));
  const p0 = [byId['preset-rubber-duck'], byId['preset-garden-gnome'], byId['preset-stapler']];
  const p1 = [byId['preset-frying-pan'], byId['preset-banana'], byId['preset-baguette']];
  await page.evaluate(([a, b]) => window.gameHooks.startMatch({ weapons: [a, b], map: 'archipel', seed: 7, stocks: 3, split: true }), [p0, p1]);
  await page.waitForFunction(() => window.ctx.state.phase === 'fight', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__long = [];
    let last = performance.now();
    window.__progs = []; let np = window.ctx.three.renderer.info.programs.length;
    const tick = () => { const t = performance.now(); if (t - last > 50) window.__long.push([Math.round(t), Math.round(t - last)]); last = t; const n = window.ctx.three.renderer.info.programs.length; if (n !== np) { window.__progs.push([Math.round(t), n - np, window.ctx.three.renderer.info.programs.slice(-(n - np)).map((p) => p.name).join(",")]); np = n; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  for (const [i, label] of [[0, 'grenade'], [1, 'throwable'], [2, 'blaster']]) {
    await page.evaluate((k) => { window.__perfSys = {}; window.gameHooks.pickWeapon(k); }, i);
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => { window.__perfSys = {}; const t0 = performance.now(); window.gameHooks.fire(0.7); return [t0, performance.now() - t0]; });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const s = window.__perfSys || {};
      return Object.entries(s).filter(([k]) => k.endsWith('(pire)')).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)}`);
    });
    const longs = await page.evaluate((t0) => window.__long.filter(([t]) => t >= t0).map(([t, d]) => `+${Math.round(t - t0)}:${d}ms`), t[0]);
    const progs = await page.evaluate((t0) => window.__progs.filter(([t]) => t >= t0).map(([t, n, names]) => `+${Math.round(t - t0)}:+${n} ${names}`), t[0]);
    console.log(`   nouveaux shaders : ${progs.join(" ; ") || "aucun"}`);
    console.log(`${label}: fire() ${t[1].toFixed(1)} ms · pires systèmes : ${r.join(' | ')} · images longues : ${longs.join(' ') || 'aucune'}`);
  }
} catch (e) { console.error(e); } finally {
  await browser.close();
  if (server) server.kill();
  if (erreurs.length) console.log('erreurs :', erreurs.slice(0, 5));
}
