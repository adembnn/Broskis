// Quels matériaux three.js ré-évalue-t-il à chaque image ? (getParameters + clé de programme + liste d'uniformes
// refaites = déchets pour le ramasse-miettes). On compare l'état interne de chaque matériau sur quelques images de
// combat en écran scindé. Usage : node tools/perf/programmes.mjs [--map cuisine] [--port 5395]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAP = opt('--map', 'cuisine');
const PORT = Number(opt('--port', '5395'));
const base = `http://localhost:${PORT}`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 })).newPage();
  await page.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__preload && window.__preload().rehearsalMs !== -1, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 1234, split: true }), MAP);
  await page.waitForFunction(() => window.ctx.state.phase === 'fight', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // Combat actif 4 s (les 2 joueurs tirent, sautent, bloquent) : on note chaque matériau jamais vu qui arrive dans
  // la scène (Object3D.add intercepté), avec le parent qui l'ajoute.
  const creations = await page.evaluate(async () => {
    const c = window.ctx; const h = window.gameHooks;
    const vus = new Set();
    c.three.scene.traverse((o) => { for (const m of [].concat(o.material || [])) vus.add(m); });
    const O3D = Object.getPrototypeOf(Object.getPrototypeOf(c.three.scene));
    const add0 = O3D.add;
    const neufs = new Map();
    O3D.add = function (...objs) {
      for (const racine of objs) racine?.traverse?.((o) => { for (const m of [].concat(o.material || [])) if (!vus.has(m)) {
        vus.add(m);
        const k = `${m.type}:${m.name || ''} · ${o.name || o.type} ajouté à ${this.name || this.type}`;
        neufs.set(k, (neufs.get(k) || 0) + 1);
      } });
      return add0.apply(this, objs);
    };
    let t = 0;
    const iv = setInterval(() => {
      t++;
      for (const p of [0, 1]) {
        const i = (t + p * 5) % 10;
        h.input(p, 'up', i < 6); h.input(p, p ? 'right' : 'left', i >= 6); h.input(p, 'jump', i === 3);
        h.input(p, 'fire', i < 2); h.input(p, 'parry', i === 5);
        if (t % 12 === p * 5) { const w = `weapon${1 + ((t / 12) | 0) % 3}`; h.input(p, w, true); setTimeout(() => h.input(p, w, false), 80); }
      }
    }, 150);
    await new Promise((r) => setTimeout(r, 4000));
    clearInterval(iv);
    O3D.add = add0;
    return [...neufs.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n}×  ${k}`);
  });
  console.log(`Matériaux créés pendant 4 s de combat actif : ${creations.length ? '' : 'aucun'}`);
  for (const l of creations.slice(0, 30)) console.log('  ' + l);
  const r = await page.evaluate(async () => {
    const c = window.ctx; const ren = c.three.renderer;
    const mats = new Map();
    c.three.scene.traverse((o) => { for (const m of [].concat(o.material || [])) { if (!mats.has(m)) mats.set(m, []); mats.get(m).push(o); } });
    const snap = () => { const s = new Map(); for (const m of mats.keys()) { const p = ren.properties.get(m); s.set(m, { ul: p.uniformsList, lv: p.lightsStateVersion, prog: p.currentProgram }); } return s; };
    const frames = () => new Promise((res) => { let n = 0; const f = () => (++n >= 3 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const a = snap(); await frames(); const b = snap();
    // Matériaux NOUVEAUX apparus en 3 images (créés à la volée par les effets, projectiles…).
    const neufs = new Map();
    c.three.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (!mats.has(m)) {
      const k = `${m.type}:${m.name || ''} dans ${o.name || o.parent?.name || o.type}${o.parent?.parent ? ' < ' + (o.parent.parent.name || o.parent.parent.type) : ''}`;
      neufs.set(k, (neufs.get(k) || 0) + 1);
    } });
    const out = [];
    for (const [m, objs] of mats) {
      const x = a.get(m); const y = b.get(m);
      if (!x.prog || x.ul === y.ul) continue; // jamais dessiné, ou rien de refait
      const sig = [...new Set(objs.map((o) => `${o.isInstancedMesh ? 'I' : '-'}${o.instanceColor ? 'C' : '-'}${o.isSkinnedMesh ? 'S' : '-'}${o.receiveShadow ? 'R' : '-'}`))].join('/');
      out.push(`${m.type}:${m.name || ''} · ${objs.length} objets (${objs.slice(0, 2).map((o) => o.name || o.parent?.name || o.type).join(', ')}) · signatures ${sig} · lumières ${x.lv}→${y.lv}${x.prog !== y.prog ? ' · programme changé' : ''}`);
    }
    return { total: mats.size, refaits: out, neufs: [...neufs.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n}×  ${k}`) };
  });
  console.log(`${MAP} : ${r.refaits.length} matériaux sur ${r.total} ré-évalués en 3 images`);
  for (const l of r.refaits.slice(0, 40)) console.log('  ' + l);
  console.log(`Matériaux nouveaux apparus en 3 images : ${r.neufs.length ? '' : 'aucun'}`);
  for (const l of r.neufs.slice(0, 30)) console.log('  ' + l);
} finally {
  await browser.close();
  server.kill();
}
