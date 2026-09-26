// Test de bout en bout du lot LFACE (photo → combattant à grosse tête), SANS aucune photo de personne réelle :
//   node tools/test-lface.mjs --visages <dossier>   génère 2 selfies de personnes FICTIVES (Nano Banana Pro)
//   node tools/test-lface.mjs <dossier> [port]      scanne ces 2 photos dans le vrai jeu, lance un match, capture
// Les photos fictives et les portraits restent hors du dépôt (<dossier>, et captures/ qui est ignoré par Git).
// La clé est lue dans le .env le plus proche en remontant (comme vite.config.ts) et n'est jamais affichée.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const OUT = 'captures/lface';
mkdirSync(OUT, { recursive: true });

function chargerEnv() {
  let d = process.cwd();
  while (!existsSync(join(d, '.env'))) { const p = dirname(d); if (p === d) return; d = p; }
  for (const ligne of readFileSync(join(d, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PERSONNES_FICTIVES = [
  'a fictional man in his late twenties with messy curly ginger hair, a short ginger beard, round black glasses and a bright green hoodie',
  'a fictional woman in her thirties with a sharp black bob haircut, bold red lipstick and a yellow rain jacket',
];

async function genererVisages(dossier) {
  chargerEnv();
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) throw new Error('GEMINI_API_KEY absente');
  const modele = /GEMINI_IMAGE_MODEL = '([^']+)'/.exec(readFileSync('api/_models.ts', 'utf8'))[1];
  mkdirSync(dossier, { recursive: true });
  await Promise.all(PERSONNES_FICTIVES.map(async (qui, i) => {
    const fichier = join(dossier, `visage-fictif-${i + 1}.jpg`);
    if (existsSync(fichier)) return console.log(`déjà là : ${fichier}`);
    const t0 = Date.now();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cle },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `A candid, slightly imperfect laptop webcam selfie photo of ${qui}. This is NOT a real or famous person: an invented face. Head and shoulders, facing the camera, smiling, indoor coworking space background, natural light, photorealistic, 4:3.` }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    const json = await res.json();
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) throw new Error(`pas d'image (${res.status}) : ${JSON.stringify(json).slice(0, 200)}`);
    writeFileSync(fichier, Buffer.from(part.inlineData.data, 'base64'));
    console.log(`visage fictif ${i + 1} : ${fichier} (${Date.now() - t0} ms)`);
  }));
}

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }

async function testerEnJeu(dossier, port) {
  const url = `http://localhost:${port}`;
  let serveur = null;
  if (!(await up(url))) {
    serveur = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
    console.log(`Vite lancé (PID ${serveur.pid}) sur ${url}`);
    for (let i = 0; i < 60 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  }
  const photos = [1, 2].map((i) => {
    const f = join(dossier, `visage-fictif-${i}.jpg`);
    return `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
  });
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 300)));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.gameHooks && window.ctx, null, { timeout: 30000 });
    // 1. Les 2 scans en parallèle (comme 2 joueurs l'un après l'autre, la forge de l'un n'attend pas l'autre).
    const rapports = await page.evaluate(async (photos) => {
      const { scanFighterReport } = await import('/src/ia/fighter/index.ts');
      const t0 = performance.now();
      const r = await Promise.all(photos.map((p) => scanFighterReport(p)));
      window.__lface = r.map((x) => x.fighter);
      return r.map((x) => ({ issue: x.issue, ms: x.ms, modele: x.portraitModel, name: x.fighter.name, model: x.fighter.model, catchphrase: x.fighter.catchphrase,
        look: x.fighter.look && { ...x.fighter.look, faceUrl: x.fighter.look.faceUrl ? `${x.fighter.look.faceUrl.length} car.` : null },
        faceUrl: x.fighter.look?.faceUrl ?? null, totalMs: Math.round(performance.now() - t0) }));
    }, photos);
    rapports.forEach((r, i) => {
      if (r.faceUrl) writeFileSync(join(OUT, `portrait-${i + 1}.png`), Buffer.from(r.faceUrl.split(',')[1], 'base64'));
      delete r.faceUrl;
      console.log(`scan ${i + 1} :`, JSON.stringify(r));
    });
    // 2. Match avec les 2 persos photo.
    const t1 = Date.now();
    await page.evaluate(() => window.gameHooks.startMatch({ fighters: window.__lface, split: true, seed: 7 }));
    await page.waitForFunction(() => {
      let n = 0;
      window.ctx.three.scene.traverse((o) => { if (o.name === 'grosse-tete') n++; });
      return n >= 2;
    }, null, { timeout: 20000 }).catch(() => console.log('!! les 2 grosses têtes ne sont pas apparues en 20 s'));
    console.log(`grosses têtes en scène : ${Date.now() - t1} ms après startMatch`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, 'match.png') });
    // 3. Gros plans de face (la vue qu'a l'adversaire) et de dos (sa propre vue) : caméra forcée par un système de test.
    await page.evaluate(() => {
      const ctx = window.ctx;
      const V = ctx.three.camera.position.constructor;
      ctx.loop.addSystem('lface-cam', () => {
        const cible = window.__lfaceCam;
        if (!cible) return;
        const tetes = [];
        ctx.three.scene.traverse((o) => { if (o.name === 'grosse-tete') tetes.push(o); });
        const tete = tetes[cible.joueur];
        let c = tete;
        while (c && !/^fighter-/.test(c.name)) c = c.parent;
        if (!c) return;
        const centre = c.getWorldPosition(new V());
        const avant = new V(0, 0, 1).applyQuaternion(c.getWorldQuaternion(c.quaternion.clone()));
        const haut = tete.getWorldPosition(new V());
        const sens = cible.cote === 'face' ? 1 : -1;
        ctx.three.camera.position.set(centre.x + avant.x * 3.4 * sens, haut.y + 0.3, centre.z + avant.z * 3.4 * sens);
        ctx.three.camera.lookAt(centre.x, (centre.y + haut.y) / 2 + 0.2, centre.z);
      }, 999);
    });
    for (const joueur of [0, 1]) {
      for (const cote of ['face', 'dos']) {
        await page.evaluate((c) => { window.__lfaceCam = c; }, { joueur, cote });
        await page.waitForTimeout(700);
        await page.screenshot({ path: join(OUT, `j${joueur + 1}-${cote}.png`) });
      }
    }
    console.log('erreurs console :', erreurs.length ? erreurs : 'aucune');
  } finally {
    await browser.close();
    if (serveur) serveur.kill();
  }
}

/** Parcours joueur par l'interface : titre → Snap yourself P1 (dépôt de photo) → Snap yourself P2 pendant la forge
 * de P1 → noms tapés → READY → écrans suivants jusqu'au match. */
async function testerParcours(dossier, port) {
  const url = `http://localhost:${port}`;
  let serveur = null;
  if (!(await up(url))) {
    serveur = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
    console.log(`Vite lancé (PID ${serveur.pid}) sur ${url}`);
    for (let i = 0; i < 60 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erreurs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Sprite|matrixWorld|Failed to load/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 200)));
  const t = { debut: Date.now() };
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.click('.title-play', { timeout: 20000 });
    for (const i of [1, 2]) {
      await page.click('.snap-tile');
      await page.setInputFiles('.capture-file-input', join(dossier, `visage-fictif-${i}.jpg`));
      t[`photo${i}`] = Date.now();
      await page.waitForSelector(`.fighter-panel.p${i} .forge`, { timeout: 10000 });
    }
    await page.screenshot({ path: join(OUT, 'parcours-1-forges.png') });
    for (const i of [1, 2]) {
      await page.waitForFunction((i) => !!document.querySelector(`.fighter-panel.p${i} input.name-input`), i, { timeout: 45000, polling: 250 })
        .catch(async (e) => {
          await page.screenshot({ path: join(OUT, `parcours-echec-p${i}.png`) });
          console.log('panneaux :', await page.evaluate(() => document.querySelector('.fighter-panels')?.innerText));
          throw e;
        });
      t[`pret${i}`] = Date.now();
    }
    console.log(`photo → perso prêt : P1 ${t.pret1 - t.photo1} ms, P2 ${t.pret2 - t.photo2} ms (P2 a pris sa photo ${t.photo2 - t.photo1} ms après P1)`);
    await page.fill('.fighter-panel.p1 input.name-input', 'Tom');
    await page.fill('.fighter-panel.p2 input.name-input', 'Jade');
    await page.screenshot({ path: join(OUT, 'parcours-2-prets.png') });
    await page.click('.ready-bar', { force: true });
    // Écrans suivants (arsenal, map, présentation) : on valide jusqu'au match.
    for (let i = 0; i < 25; i++) {
      const phase = await page.evaluate(() => window.gameState?.phase);
      if (['countdown', 'fight', 'move', 'turn-intro', 'aim'].includes(phase)) break;
      const cta = await page.$('.b-btn.cta:not([disabled]), .b-btn.go:not([disabled])');
      if (cta) await cta.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
    }
    await page.waitForFunction(() => { let n = 0; window.ctx.three.scene.traverse((o) => { if (o.name === 'grosse-tete') n++; }); return n >= 2; }, null, { timeout: 40000 })
      .catch(() => console.log('!! grosses têtes absentes du match'));
    await page.waitForTimeout(3500);
    await page.screenshot({ path: join(OUT, 'parcours-3-match.png') });
    const noms = await page.evaluate(() => window.gameState?.players?.map((p) => p.fighter?.name));
    console.log('noms en match :', noms, '· phase :', await page.evaluate(() => window.gameState?.phase));
    console.log('erreurs console :', erreurs.length ? erreurs : 'aucune');
  } finally {
    await browser.close();
    if (serveur) serveur.kill();
  }
}

const args = process.argv.slice(2);
if (args[0] === '--visages') await genererVisages(resolve(args[1]));
else if (args[0] === '--parcours') await testerParcours(resolve(args[1]), Number(args[2] ?? 5351));
else await testerEnJeu(resolve(args[0]), Number(args[1] ?? 5351));
