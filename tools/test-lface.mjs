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
      return r.map((x) => ({ issue: x.issue, ms: x.ms, name: x.fighter.name, model: x.fighter.model, catchphrase: x.fighter.catchphrase,
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
    // 3. Gros plans de face (la vue qu'a l'adversaire) et de dos (sa propre vue), caméra forcée par un système de test.
    for (const joueur of [0, 1]) {
      for (const cote of ['face', 'dos']) {
        await page.evaluate(({ joueur, cote }) => {
          const ctx = window.ctx;
          const THREE_ = ctx.three.camera.position.constructor;
          ctx.loop.addSystem(`lface-cam`, () => {
            let tete = null;
            let i = 0;
            ctx.three.scene.traverse((o) => { if (o.name === 'grosse-tete') { if (i === joueur) tete = o; i++; } });
            const fighter = tete; while (fighter && fighter.parent && !/^fighter-/.test(fighter.name)) { /* remonte */ break; }
            let c = tete; while (c && !/^fighter-/.test(c.name)) c = c.parent;
            if (!c || !tete) return;
            const centre = new THREE_(); c.getWorldPosition(centre);
            const avant = new THREE_(0, 0, 1).applyQuaternion(c.getWorldQuaternion(c.quaternion.clone()));
            const haut = new THREE_(); tete.getWorldPosition(haut);
            const sens = cote === 'face' ? 1 : -1;
            ctx.three.camera.position.set(centre.x + avant.x * 3.2 * sens, haut.y + 0.2, centre.z + avant.z * 3.2 * sens);
            ctx.three.camera.lookAt(centre.x, (centre.y + haut.y) / 2 + 0.1, centre.z);
          });
        }, { joueur, cote });
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

const args = process.argv.slice(2);
if (args[0] === '--visages') await genererVisages(resolve(args[1]));
else await testerEnJeu(resolve(args[0]), Number(args[1] ?? 5351));
