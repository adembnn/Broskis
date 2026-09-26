// Diagnostic de scène (lot LPERF) : lumières, ombres, matériaux partagés qui forcent three.js à re-choisir
// son programme de shader à chaque objet (receiveShadow / skinning / instancing différents sur un même matériau).
// Usage : node tools/perf/diag.mjs [--map archipel] [--port 5378] [--url URL]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAP = opt('--map', 'archipel');
const PORT = Number(opt('--port', '5378'));
let base = opt('--url', null);
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server = null;
if (!base) {
  base = `http://localhost:${PORT}`;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--disable-backgrounding-occluded-windows'] });
const page = await (await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 })).newPage();
await page.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => typeof window.gameHooks?.startMatch === 'function', null, { timeout: 120000 });
await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 1234 }), MAP);
await page.waitForTimeout(6000);
const rapport = await page.evaluate(() => {
  const c = window.ctx; const scene = c.three.scene;
  const lumieres = [];
  scene.traverse((o) => {
    if (o.isLight) {
      let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      lumieres.push(`${o.type}${o.castShadow ? ' [OMBRE ' + o.shadow.mapSize.x + ']' : ''}${vis ? '' : ' (cachée)'} i=${o.intensity.toFixed(2)} parent=${o.parent?.name || o.parent?.type}`);
    }
  });
  // Signature de programme par objet : si un même matériau voit plusieurs signatures, three.js recalcule
  // la clé de programme à chaque objet dessiné (getProgram/getParameters à chaque frame).
  const parMat = new Map();
  let meshes = 0; let casters = 0; let receivers = 0; let visibles = 0;
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
    meshes++;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
    visibles++;
    if (o.castShadow) casters++;
    if (o.receiveShadow) receivers++;
    const g = o.geometry;
    const sig = [o.receiveShadow ? 'R' : '-', o.isSkinnedMesh ? 'S' : '-', o.isInstancedMesh ? 'I' : '-', o.instanceColor ? 'C' : '-',
      g?.morphAttributes?.position ? 'M' : '-', g?.attributes?.color?.itemSize === 4 ? 'A' : '-', g?.attributes?.tangent ? 'T' : '-'].join('');
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      const e = parMat.get(m.uuid) || { nom: `${m.type}:${m.name || ''}`, sigs: new Map() };
      e.sigs.set(sig, (e.sigs.get(sig) || 0) + 1);
      parMat.set(m.uuid, e);
    }
  });
  const conflits = [...parMat.values()].filter((e) => e.sigs.size > 1).map((e) => `${e.nom} ${JSON.stringify([...e.sigs])}`);
  // Groupes : objets dessinables visibles, triangles, distance au centre (pour repérer le décor lointain).
  const groupes = [];
  const box = new c.three.camera.position.constructor();
  const visit = (g, prof) => {
    let n = 0; let tri = 0; let ombre = 0;
    g.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      n += o.isInstancedMesh ? 1 : 1;
      const idx = o.geometry?.index; const pos = o.geometry?.attributes?.position;
      tri += ((idx ? idx.count : pos ? pos.count : 0) / 3) * (o.isInstancedMesh ? o.count : 1);
      if (o.castShadow) ombre++;
    });
    if (!n) return;
    g.getWorldPosition(box);
    groupes.push(`${'  '.repeat(prof)}${g.name || g.type} · ${n} objets · ${Math.round(tri / 1000)} k tri · ${ombre} ombres · à ${Math.round(Math.hypot(box.x, box.z))} m`);
    if (prof < 1) for (const ch of g.children) visit(ch, prof + 1);
  };
  for (const ch of scene.children) visit(ch, 0);
  // Répartition des objets dessinables visibles : coques de contour (…__outline), persos animés, instanciés, reste.
  const repart = { contours: 0, contoursTri: 0, animes: 0, animesTri: 0, instancies: 0, autres: 0, autresTri: 0 };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false;
    if (!vis) return;
    const idx = o.geometry?.index; const pos = o.geometry?.attributes?.position;
    const tri = ((idx ? idx.count : pos ? pos.count : 0) / 3) * (o.isInstancedMesh ? o.count : 1);
    if (o.name.endsWith('__outline') || o.userData.isOutline) { repart.contours++; repart.contoursTri += tri; }
    else if (o.isSkinnedMesh) { repart.animes++; repart.animesTri += tri; }
    else if (o.isInstancedMesh) repart.instancies++;
    else { repart.autres++; repart.autresTri += tri; }
  });
  for (const k of Object.keys(repart)) if (k.endsWith('Tri')) repart[k] = `${Math.round(repart[k] / 1000)} k`;
  return { lumieres, meshes, visibles, casters, receivers, materiaux: parMat.size, conflits, programmes: c.three.renderer.info.programs.length, repart, groupes: groupes.slice(0, 12) };
});
console.log(JSON.stringify(rapport, null, 1));
await browser.close();
if (server) server.kill();
