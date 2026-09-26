// Banc d'évaluation visuelle des maps (lot LDECOR2) : captures de chaque arène sous plusieurs angles, mesures
// de coût (appels de dessin, triangles, textures, mémoire, images/s), taille réelle du plateau, puis juge Gemini
// (image) avec une grille « level art AAA façon Smash / Brawlhalla ». Écrit <out>/rapport.json.
// Usage : node tools/maps/eval-maps.mjs [--url http://localhost:5173] [--maps archipel,galion,cuisine]
//         [--out captures/maps-eval] [--no-gemini]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5173');
const OUT = opt('--out', 'captures/maps-eval');
const MAPS = opt('--maps', 'archipel,galion,cuisine').split(',');
const SANS_GEMINI = args.includes('--no-gemini');
const MODELE = 'gemini-3.1-pro-preview';
mkdirSync(OUT, { recursive: true });

// ---- Captures + mesures ----
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => erreurs.push('PAGEERROR ' + e.message));
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.ctx && window.gameHooks, null, { timeout: 30000 });
await page.evaluate(() => {
  window.__evalCam = null;
  window.ctx.loop.addSystem('eval-maps-cam', () => {
    const c = window.__evalCam; if (!c) return;
    const cam = window.ctx.three.camera;
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  }, 950);
});

const rapport = { url: URL, date: new Date().toISOString(), maps: {} };
for (const map of MAPS) {
  await page.evaluate((m) => window.gameHooks.startMatch({ map: m, seed: 7, split: true }), map);
  await page.waitForFunction(() => window.gameState.phase === 'fight', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const r = { images: {} };
  // Vue « jeu » : caméra réelle du jeu, interface visible (ce que voit le jury).
  await page.evaluate(() => { window.__evalCam = null; });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${map}-jeu.png` });
  r.images.jeu = `${OUT}/${map}-jeu.png`;
  // Taille du plateau : boîte englobante des objets nommés plateau*/tuiles, sinon rayon déclaré.
  r.arene = await page.evaluate(() => {
    const THREE_Box = window.ctx.three.scene.constructor; void THREE_Box;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const p = window.gameState.players.map((x) => x.pos);
    window.ctx.three.scene.traverse((o) => {
      if (!/^plateau|tile|tuile|oneway/i.test(o.name || '')) return;
      o.updateWorldMatrix(true, true);
      const e = o.matrixWorld.elements; // position seulement (approx. suffisante pour un ordre de grandeur)
      minX = Math.min(minX, e[12]); maxX = Math.max(maxX, e[12]); minZ = Math.min(minZ, e[14]); maxZ = Math.max(maxZ, e[14]);
    });
    return { distanceApparitions: +Math.hypot(p[0][0] - p[1][0], p[0][2] - p[1][2]).toFixed(1), etendueObjetsPlateau: isFinite(minX) ? [+(maxX - minX).toFixed(1), +(maxZ - minZ).toFixed(1)] : null };
  });
  await page.evaluate(() => { window.ctx.three.uiRoot.style.visibility = 'hidden'; });
  const R = Math.max(9, (r.arene.distanceApparitions || 10) * 0.9);
  const vues = {
    large: { pos: [0, R * 1.25, R * 2.3], look: [0, 0, -R * 0.2] },
    ras: { pos: [0, 2.2, R * 1.9], look: [0, 1.2, 0] },
    epauleP1: { pos: [-R * 1.25, 3.8, 1.8], look: [R * 0.5, 1, 0] },
    epauleP2: { pos: [R * 1.25, 3.8, -1.8], look: [-R * 0.5, 1, 0] },
  };
  for (const [nom, cam] of Object.entries(vues)) {
    await page.evaluate((c) => { window.__evalCam = c; }, cam);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${map}-${nom}.png` });
    r.images[nom] = `${OUT}/${map}-${nom}.png`;
  }
  await page.evaluate(() => { window.__evalCam = null; window.ctx.three.uiRoot.style.visibility = 'visible'; });
  r.cout = await page.evaluate(() => new Promise((res) => {
    const rd = window.ctx.three.renderer; const info = rd.info;
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res({
      imagesParSeconde: Math.round(n / 2), appelsDeDessin: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      memoireJsMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    }); };
    requestAnimationFrame(f);
  }));
  rapport.maps[map] = r;
  console.log(map, JSON.stringify({ arene: r.arene, cout: r.cout }));
}
rapport.erreursConsole = erreurs.slice(0, 10);
await browser.close();

// ---- Juge Gemini (images) ----
function chargerEnv() {
  if (!existsSync('.env')) return;
  for (const l of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i < 1 || l.trim().startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
chargerEnv();
const CRITERES = [
  ['definitionAssets', 'Définition des assets : objets qui ont l\'air MODÉLISÉS par un artiste (silhouettes nettes, détails, biseaux, proportions) et non des primitives (boîtes, cônes, blocs plats) ou un assemblage générique « AI slop ».'],
  ['matieres', 'Matières et revêtements : textures/surfaces crédibles et soignées (bois, pierre, herbe, métal), variation, usure ; pas d\'aplats uniformes ni de couleurs boueuses.'],
  ['fond', 'Fond / ciel : un arrière-plan peint ou panoramique qui donne un lieu, de la profondeur et une ambiance forte ; pas un vide uni ni un brouillard qui mange tout.'],
  ['echelle', 'Échelle et taille : l\'arène paraît assez grande pour un duel façon Smash (on s\'y projette), les persos ont une taille lisible par rapport au décor.'],
  ['lisibilite', 'Lisibilité de jeu : plateau, bords, plateformes et combattants se lisent en 3 secondes ; rien ne masque les persos ; contraste persos / sol.'],
  ['identite', 'Identité et charme : ressemble à un vrai stage de Smash Bros Ultimate / Brawlhalla, mémorable, cohérent en style d\'une vue à l\'autre.'],
];
async function juger(map, r) {
  const parts = [{ text: [
    'Tu es directeur artistique « level art » dans un studio AAA de jeux de combat (Smash Bros Ultimate, Brawlhalla). Impitoyable, précis, jamais complaisant.',
    `Voici 5 captures de l'arène « ${map} » d'un jeu de duel 3D au tour par tour (vue de jeu avec interface, vue large, vue à ras du sol, vues d'épaule des 2 joueurs).`,
    `Mesures : ${JSON.stringify({ arene: r.arene, cout: r.cout })}.`,
    'Note chaque critère de 0 à 10 (10 = qualité d\'un stage de Smash Ultimate ; 5 = prototype correct ; 3 = primitives / slop). Justifie par ce qui est VISIBLE.',
    ...CRITERES.map(([k, d]) => `- ${k} : ${d}`),
    'Puis liste les 5 défauts les plus visibles (objet précis, où dans l\'image) et les 5 corrections concrètes qui feraient gagner le plus de points (asset à remplacer, texture, panorama 360°, taille, cadrage).',
  ].join('\n') }];
  for (const f of Object.values(r.images)) parts.push({ inlineData: { mimeType: 'image/png', data: readFileSync(f).toString('base64') } });
  const schema = { type: 'OBJECT', properties: {
    notes: { type: 'OBJECT', properties: Object.fromEntries(CRITERES.map(([k]) => [k, { type: 'NUMBER' }])), required: CRITERES.map(([k]) => k) },
    justifications: { type: 'OBJECT', properties: Object.fromEntries(CRITERES.map(([k]) => [k, { type: 'STRING' }])) },
    defauts: { type: 'ARRAY', items: { type: 'STRING' } },
    corrections: { type: 'ARRAY', items: { type: 'STRING' } },
  }, required: ['notes', 'defauts', 'corrections'] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '{}');
}
if (SANS_GEMINI || !process.env.GEMINI_API_KEY) {
  console.log(SANS_GEMINI ? '--no-gemini : juge ignoré.' : 'GEMINI_API_KEY absente : juge ignoré.');
} else {
  for (const [map, r] of Object.entries(rapport.maps)) {
    try {
      r.juge = await juger(map, r);
      const n = Object.values(r.juge.notes);
      r.note = Math.min(...n);
      console.log(`\n== ${map} : note ${r.note}/10 (la plus basse) ${JSON.stringify(r.juge.notes)}`);
      for (const d of r.juge.defauts ?? []) console.log('  défaut :', d);
      for (const c of r.juge.corrections ?? []) console.log('  correction :', c);
    } catch (e) { r.juge = { erreur: String(e) }; console.log(map, 'juge en échec :', String(e).slice(0, 200)); }
  }
}
writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 2));
console.log(`\nRapport : ${OUT}/rapport.json — images : ${OUT}/<map>-{jeu,large,ras,epauleP1,epauleP2}.png`);
if (erreurs.length) { console.log('Erreurs console :', erreurs.slice(0, 5)); process.exitCode = 1; }
