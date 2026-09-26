// Banc de fluidité (lot LPERF) : Chromium AVEC fenêtre et vrai GPU, à la résolution de la machine, joue un
// match scripté par map (déplacements, sauts, tirs, parades) et mesure ce que le joueur ressent.
// Usage : npm run perf -- [--maps archipel,galion,cuisine] [--secs 20] [--gpu intel|nvidia] [--url URL]
//                         [--preview] [--port 5377] [--profile] [--toggle nobloom,noshadow] [--out fichier.json]
//   --gpu nvidia  : force la carte NVIDIA (--force_high_performance_gpu) ; défaut « intel » = ce que Chrome
//                   choisit tout seul sur ce PC portable (la puce Intel intégrée, voir gpu-probe.mjs).
//   --preview     : sert le build de production (`vite preview`, faire `npx vite build` avant) au lieu du dev.
//   --q haute|basse : force la qualité (sinon choix automatique au 1er tour, src/core/quality.ts).
//   --shot        : capture d'écran en fin de match (tools/perf/out/<map>-<gpu>-<q>.png).
//   --profile     : profil CPU (échantillonneur Chrome) pendant le match, top des fonctions les plus coûteuses.
//   --toggle      : essais A/B à chaud (nobloom = rendu direct sans post-traitement, noshadow = ombres figées,
//                   pr1 = ratio de pixels 1, unelumiere = une seule pile de lumières au lieu de deux).
// Sans --url, lance son propre Vite sur --port (5300-5399) et n'arrête QUE ce processus-là à la fin.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAPS = opt('--maps', 'archipel,galion,cuisine').split(',');
const SECS = Number(opt('--secs', '20'));
const GPU = opt('--gpu', 'intel');
const PORT = Number(opt('--port', '5377'));
const TOGGLES = (opt('--toggle', '') || '').split(',').filter(Boolean);
const PROFILE = args.includes('--profile');
const PREVIEW = args.includes('--preview');
const Q = opt('--q', null); // ?q=haute|basse : force la qualité (voir src/core/quality.ts)
let base = opt('--url', null);

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server = null;
if (!base) {
  base = `http://localhost:${PORT}`;
  if (await up(base)) throw new Error(`Port ${PORT} déjà pris : choisis --port libre (5300-5399) ou --url.`);
  const viteArgs = PREVIEW ? ['preview', '--port', String(PORT), '--strictPort'] : ['--port', String(PORT), '--strictPort'];
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...viteArgs], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(base)); i++) await new Promise((r) => setTimeout(r, 500));
  console.log(`Vite ${PREVIEW ? 'preview' : 'dev'} lancé (PID ${server.pid}) sur ${base}`);
}

const gpuArgs = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
if (GPU === 'nvidia') gpuArgs.push('--force_high_performance_gpu');
// Fenêtres cachées derrière d'autres : Chrome les ralentirait (1 image/s), ce qui fausserait tout.
const antiVeille = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const browser = await chromium.launch({ headless: false, args: [...gpuArgs, ...antiVeille, '--window-size=1536,864'] });

// Chauffe : la 1re visite du serveur de dev prépare les dépendances (lent, jamais vu par le joueur ensuite).
{
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${base}/?demo=1`, { waitUntil: 'load', timeout: 120000 });
  await p.waitForFunction(() => typeof window.gameHooks?.startMatch === 'function', null, { timeout: 120000 }).catch(() => {});
  await c.close();
}

// Instruments posés AVANT le jeu : intervalles entre images, tâches longues, longues frames (avec le script fautif).
const INSTRUMENTS = () => {
  const P = (window.__perf = { rec: false, frames: [], fins: [], long: [], loaf: [], progs: [] });
  let last = 0;
  const f = (t) => {
    if (P.rec && last) { P.frames.push(t - last); P.fins.push(t); window.__rinfoFrame?.(t); }
    last = t; requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  try {
    new PerformanceObserver((l) => { if (P.rec) for (const e of l.getEntries()) P.long.push(Math.round(e.duration)); })
      .observe({ type: 'longtask' });
  } catch { /* navigateur sans longtask */ }
  try {
    new PerformanceObserver((l) => {
      if (!P.rec) return;
      for (const e of l.getEntries()) {
        P.loaf.push({ s: e.startTime, d: Math.round(e.duration), scripts: (e.scripts || []).map((s) => ({
          d: Math.round(s.duration), f: s.sourceFunctionName, u: (s.sourceURL || '').replace(location.origin, ''), inv: s.invoker,
        })) });
      }
    }).observe({ type: 'long-animation-frame' });
  } catch { /* navigateur sans LoAF */ }
};

// Pilote en page : joue les deux joueurs (marche vers l'autre, saute, tire sur lui, pare une fois sur deux).
const PILOTE = () => {
  const h = window.gameHooks;
  const c = window.ctx;
  let tour = -1; let pas = 0; let tire = false;
  c.bus.on('projectile:incoming', ({ etaMs }) => {
    setTimeout(() => { try { h.parry(Math.random() < 0.5 ? 40 : 400); } catch { /* rien */ } }, Math.max(0, etaMs - 30));
  });
  window.__pilote = setInterval(() => {
    const st = c.state;
    if (st.winner != null || (st.phase !== 'move' && st.phase !== 'aim')) return;
    if (st.turn !== tour) { tour = st.turn; pas = 0; tire = false; }
    const moi = st.players[st.active].pos; const lui = st.players[1 - st.active].pos;
    const dx = lui[0] - moi[0]; const dz = lui[2] - moi[2]; const n = Math.hypot(dx, dz) || 1;
    if (pas < 5) { pas++; h.move((dx / n) * 0.5, (dz / n) * 0.5); if (pas === 3) h.jump(); return; }
    if (!tire) {
      tire = true;
      h.pickWeapon(st.turn % 3);
      h.aim((Math.atan2(dx, dz) * 180) / Math.PI, 30);
      setTimeout(() => h.fire(0.75), 250);
    }
  }, 220);
};

// Remplace le rendu par une version qui compte les appels de dessin de TOUTE la frame (ombres + passes comprises).
const COMPTEUR_RENDU = (toggles) => {
  const c = window.ctx; const r = c.three.renderer;
  r.info.autoReset = false;
  if (toggles.includes('nobloom')) c.three.render = () => r.render(c.three.scene, c.three.camera);
  if (toggles.includes('noshadow')) { r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true; }
  if (toggles.includes('pr1')) { r.setPixelRatio(1); window.dispatchEvent(new Event('resize')); }
  // unelumiere : une seule pile de lumières (celle de la map, intensités ×2) au lieu de LA + map superposées.
  if (toggles.includes('unelumiere')) c.bus.on('phase:change', ({ to }) => {
    const map = c.three.scene.children.find((o) => o.name?.startsWith('map-'));
    if (to !== 'move' || !map) return;
    for (const o of c.three.scene.children) if (o.isLight) o.visible = false;
    map.traverse((o) => { if (o.isLight && !o.userData.x2) { o.intensity *= 2; o.userData.x2 = true; } });
  });
  // Relevé au début de chaque image (le rAF des instruments passe avant celui du jeu) : compte toute l'image
  // précédente, quel que soit le chemin de rendu (post-traitement ou rendu direct en qualité basse).
  const S = (window.__rinfo = { calls: [], tris: [] });
  let nProg = r.info.programs.length;
  window.__rinfoFrame = (t) => {
    S.calls.push(r.info.render.calls); S.tris.push(r.info.render.triangles);
    r.info.reset();
    const progs = r.info.programs;
    if (progs.length > nProg) {
      // Qui a demandé ces shaders ? On cherche les objets dont le matériau utilise un des nouveaux programmes.
      const neufs = new Set(progs.slice(nProg));
      const noms = [];
      c.three.scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          const pr = r.properties.get(m)?.currentProgram;
          if (pr && neufs.has(pr)) noms.push(`${o.name || o.parent?.name || o.type}:${m.type}${m.name ? '/' + m.name : ''}`);
        }
      });
      window.__perf.progs.push({ t, noms: noms.length ? noms : progs.slice(nProg).map((p) => p.name || '?') });
    }
    nProg = progs.length;
  };
  window.__perfSys = {}; // chrono par système de la boucle (src/core/loop.ts)
};

const stats = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const moy = a.reduce((x, y) => x + y, 0) / a.length;
  const pire1 = s.slice(Math.floor(s.length * 0.99));
  return {
    n: a.length,
    fpsMoyen: +(1000 / moy).toFixed(1),
    fps1pctBas: +(1000 / (pire1.reduce((x, y) => x + y, 0) / pire1.length)).toFixed(1),
    msMedian: +s[Math.floor(s.length / 2)].toFixed(2),
    msP99: +s[Math.floor(s.length * 0.99)].toFixed(1),
    msMax: +s[s.length - 1].toFixed(1),
    sup33ms: a.filter((x) => x > 33.4).length,
    sup50ms: a.filter((x) => x > 50).length,
  };
};
const moyenne = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

const resultats = { date: new Date().toISOString(), gpu: GPU, preview: PREVIEW, toggles: TOGGLES, secs: SECS, maps: {} };

for (const map of MAPS) {
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
  await context.addInitScript(INSTRUMENTS);
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });

  const tNav = Date.now();
  await page.goto(`${base}/?demo=1${Q ? `&q=${Q}` : ''}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.ctx && typeof window.gameHooks?.startMatch === 'function', null, { timeout: 60000 });
  const chargement = { pageMs: Date.now() - tNav };
  await page.waitForTimeout(1500); // écran titre posé

  const gpuNom = await page.evaluate(() => {
    const gl = window.ctx.three.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?';
  });
  // Essais A/B sur le post-traitement (serveur de dev seulement) : on attrape l'EffectComposer du jeu en
  // remplaçant sa méthode render sur le prototype (même URL de module = même classe).
  if (TOGGLES.some((t) => ['bloomoff', 'msaa0', 'crt1', 'crt075', 'crt05'].includes(t))) {
    await page.evaluate(async (toggles) => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('postprocessing_EffectComposer'));
      const { EffectComposer } = await import(url);
      const orig = EffectComposer.prototype.render;
      await new Promise((ok) => {
        EffectComposer.prototype.render = function (dt) { window.__composer = this; EffectComposer.prototype.render = orig; ok(); return orig.call(this, dt); };
      });
      const cp = window.__composer;
      if (toggles.includes('bloomoff')) for (const p of cp.passes) if ('strength' in p) p.enabled = false;
      if (toggles.includes('msaa0')) for (const rt of [cp.renderTarget1, cp.renderTarget2]) { rt.samples = 0; rt.dispose(); }
      if (toggles.includes('crt1')) cp.setPixelRatio(1);
      if (toggles.includes('crt075')) cp.setPixelRatio(0.75);
      if (toggles.includes('crt05')) cp.setPixelRatio(0.5);
    }, TOGGLES);
  }
  await page.evaluate(COMPTEUR_RENDU, TOGGLES);

  // PLAY -> premier tour jouable (phase `move`) et map complète (nombre d'objets stable 400 ms).
  await page.evaluate((m) => {
    window.__perf.rec = true;
    window.__t0 = performance.now();
    window.gameHooks.startMatch({ map: m, seed: 1234 });
  }, map);
  const tMove = await page.waitForFunction(() => window.ctx.state.phase === 'move' && performance.now() - window.__t0, null, { timeout: 30000 })
    .then((h) => h.jsonValue()).catch(() => null);
  chargement.premierTourMs = tMove == null ? null : Math.round(tMove);
  chargement.mapStableMs = await page.evaluate((m) => new Promise((res) => {
    let prev = -1; let stable = 0;
    const iv = setInterval(() => {
      const g = window.ctx.three.scene.getObjectByName(`map-${m}`);
      let n = 0; g?.traverse(() => { n++; });
      if (n > 0 && n === prev) stable += 100; else stable = 0;
      prev = n;
      if (stable >= 400 || performance.now() - window.__t0 > 20000) { clearInterval(iv); res(Math.round(performance.now() - window.__t0 - stable)); }
    }, 100);
  }), map);
  // Les frames du chargement sont gardées à part : on repart de zéro pour le match lui-même.
  const framesChargement = await page.evaluate(() => {
    const f = window.__perf.frames; const l = window.__perf.long;
    window.__perf.frames = []; window.__perf.fins = []; window.__perf.long = []; window.__perf.loaf = []; window.__perf.progs = [];
    window.__rinfo.calls = []; window.__rinfo.tris = []; window.__perfSys = {};
    return { pire: Math.round(Math.max(0, ...f)), sup50: f.filter((x) => x > 50).length, longues: l };
  });

  let cdp = null;
  if (PROFILE) {
    cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  await page.evaluate(PILOTE);
  await page.waitForTimeout(SECS * 1000);
  let profil = null;
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map();
    const dt = new Map();
    for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) || 0) + profile.timeDeltas[i]);
    for (const n of profile.nodes) {
      const cf = n.callFrame;
      const cle = `${cf.functionName || '(anonyme)'} ${cf.url.replace(base, '').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
      self.set(cle, (self.get(cle) || 0) + (dt.get(n.id) || 0) / 1000);
    }
    const total = [...self.values()].reduce((a, b) => a + b, 0);
    profil = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
      .map(([k, ms]) => `${((ms / total) * 100).toFixed(1).padStart(5)} %  ${k}`);
  }

  const mesure = await page.evaluate(() => {
    const P = window.__perf; const r = window.ctx.three.renderer;
    clearInterval(window.__pilote);
    P.rec = false;
    const loafPires = [...P.loaf].sort((a, b) => b.d - a.d).slice(0, 5);
    // Images > 50 ms : de nouveaux shaders ont-ils été compilés pendant cette image-là ?
    const pics = [];
    P.frames.forEach((ms, i) => {
      if (ms <= 50) return;
      const ev = P.progs.find((e) => e.t === P.fins[i]);
      const lf = P.loaf.find((l) => l.s < P.fins[i] && l.s + l.d > P.fins[i] - ms);
      const scripts = lf ? lf.scripts.filter((x) => x.d >= 5).map((x) => `${x.f || x.inv}${x.u ? ' ' + x.u.split('/').pop() : ''} ${x.d}ms`) : [];
      pics.push({ ms: Math.round(ms), nouveauxShaders: ev ? ev.noms : [], scripts });
    });
    const shadersEnMatch = P.progs.reduce((n, e) => n + e.noms.length, 0);
    const res = performance.getEntriesByType('resource');
    const parType = {};
    for (const e of res) {
      const ext = (e.name.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'autre').toLowerCase();
      const t = (parType[ext] ||= { n: 0, ko: 0 });
      t.n++; t.ko += Math.round((e.encodedBodySize || e.transferSize || 0) / 1024);
    }
    const ps = Object.entries(window.__perfSys || {});
    const sys = ps.filter(([k]) => !k.endsWith(' (pire)')).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, +(v / Math.max(1, P.frames.length)).toFixed(3)]);
    const sysPire = ps.filter(([k]) => k.endsWith(' (pire)')).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k.replace(' (pire)', ''), Math.round(v)]);
    return {
      frames: P.frames, longues: P.long, loafPires,
      calls: window.__rinfo.calls, tris: window.__rinfo.tris,
      programmes: r.info.programs?.length ?? null,
      textures: r.info.memory.textures, geometries: r.info.memory.geometries,
      tasJsMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      reseau: parType,
      canvas: [r.domElement.width, r.domElement.height],
      tour: window.ctx.state.turn, phase: window.ctx.state.phase,
      msParSystemeParFrame: sys, pireFrameParSysteme: sysPire, pics, shadersEnMatch,
      qualite: window.__qualite ? { niveau: window.__qualite.niveau, medianeMs: window.__qualite.medianeMs } : null,
    };
  });

  if (args.includes('--shot')) await page.screenshot({ path: `tools/perf/out/${map}-${GPU}-${Q || 'auto'}.png` });
  const r = {
    gpu: gpuNom,
    canvas: mesure.canvas,
    images: stats(mesure.frames),
    tachesLongues: { n: mesure.longues.length, totalMs: mesure.longues.reduce((a, b) => a + b, 0), pireMs: Math.max(0, ...mesure.longues) },
    appelsDessin: { moyen: moyenne(mesure.calls), max: Math.max(0, ...mesure.calls) },
    triangles: { moyen: moyenne(mesure.tris), max: Math.max(0, ...mesure.tris) },
    programmes: mesure.programmes, textures: mesure.textures, geometries: mesure.geometries,
    tasJsMo: mesure.tasJsMo,
    chargement: { ...chargement, framesChargement },
    reseau: mesure.reseau,
    toursJoues: mesure.tour, phaseFinale: mesure.phase,
    msParSystemeParFrame: mesure.msParSystemeParFrame,
    pireFrameParSysteme: mesure.pireFrameParSysteme,
    shadersCompilesPendantLeMatch: mesure.shadersEnMatch,
    imagesSup50ms: mesure.pics,
    qualite: mesure.qualite,
    longuesFramesPires: mesure.loafPires,
    profil,
    erreurs: erreurs.slice(0, 10),
  };
  resultats.maps[map] = r;
  const im = r.images || {};
  console.log(`\n== ${map} · ${r.gpu.replace(/^ANGLE \(|\(0x.*$/g, '').trim()} · canvas ${r.canvas.join('×')}`);
  console.log(`  i/s moyen ${im.fpsMoyen} · 1 % bas ${im.fps1pctBas} · médiane ${im.msMedian} ms · p99 ${im.msP99} ms · max ${im.msMax} ms · >33 ms : ${im.sup33ms} · >50 ms : ${im.sup50ms}`);
  console.log(`  appels de dessin ${r.appelsDessin.moyen} (max ${r.appelsDessin.max}) · triangles ${r.triangles.moyen} · programmes ${r.programmes} · textures ${r.textures} · tas JS ${r.tasJsMo} Mo`);
  console.log(`  tâches longues ${r.tachesLongues.n} (total ${r.tachesLongues.totalMs} ms, pire ${r.tachesLongues.pireMs} ms) · tours joués ${r.toursJoues}`);
  console.log(`  chargement : page ${chargement.pageMs} ms · 1er tour ${chargement.premierTourMs} ms · map stable ${chargement.mapStableMs} ms · pire frame au chargement ${framesChargement.pire} ms`);
  console.log(`  systèmes (ms/frame) : ${r.msParSystemeParFrame.slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  pire frame par système (ms) : ${r.pireFrameParSysteme.slice(0, 6).map(([k, v]) => `${k} ${v}`).join(' · ')}${r.qualite ? ` · qualité ${r.qualite.niveau} (médiane ${r.qualite.medianeMs?.toFixed?.(1)} ms)` : ''}`);
  console.log(`  shaders compilés pendant le match : ${r.shadersCompilesPendantLeMatch} · images > 50 ms : ${r.imagesSup50ms.length || 'aucune'}`);
  for (const p of r.imagesSup50ms.slice(0, 8)) console.log(`    ${p.ms} ms${p.nouveauxShaders.length ? ` · shaders : ${[...new Set(p.nouveauxShaders)].slice(0, 4).join(', ')}` : ''}${p.scripts.length ? ` · scripts : ${p.scripts.slice(0, 3).join(', ')}` : ''}`);
  if (profil) console.log('  profil CPU (temps propre) :\n    ' + profil.slice(0, 15).join('\n    '));
  if (erreurs.length) console.log(`  erreurs : ${erreurs.slice(0, 3).join(' | ')}`);
  await context.close();
}

await browser.close();
if (server) server.kill();
const out = opt('--out', `tools/perf/out/bench-${GPU}${PREVIEW ? '-preview' : ''}${Q ? '-q' + Q : ''}${TOGGLES.length ? '-' + TOGGLES.join('+') : ''}.json`);
mkdirSync(out.replace(/[/\\][^/\\]*$/, ''), { recursive: true });
writeFileSync(out, JSON.stringify(resultats, null, 1));
console.log(`\nRésultats : ${out}`);
