// Les « yeux » des agents : ouvre le jeu dans un navigateur piloté, prend des captures,
// mesure images/seconde, relève les erreurs console, lit window.gameState, calcule des métriques d'image.
// Usage : node tools/capture.mjs [--url http://localhost:5173] [--parcours] [--demo] [--video]
//   --parcours : joue demo/parcours.json (étapes de la démo) et capture chaque étape.
//   --demo     : ajoute ?demo=1 (mode démo : graine fixe, IA en cache).
//   --video    : enregistre aussi une vidéo (captures/video/) — sert de vidéo de secours.
// Code de sortie 1 si erreurs console, page plantée ou écran vide : `npm run verifier` échoue alors.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
let url = opt('--url', 'http://localhost:5173');
if (args.includes('--demo')) url += (url.includes('?') ? '&' : '?') + 'demo=1';
const OUT = 'captures';
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(`${OUT}/${f}`); // on repart de captures propres

async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server;
if (!(await up(url.split('?')[0]))) {
  console.log('Serveur absent : lancement de Vite…');
  // Lancé sans shell pour pouvoir l'arrêter proprement à la fin (sinon Vite reste ouvert et bloque le port).
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up(url.split('?')[0])); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const video = args.includes('--video') ? { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } : undefined;
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: video });
const page = await context.newPage();
const erreurs = [];
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && erreurs.push(m.text()));
page.on('response', (r) => r.status() >= 400 && !r.url().includes('favicon') && erreurs.push(`${r.status()} ${r.url()}`));
page.on('pageerror', (e) => erreurs.push(e.message));
const rapport = { url, captures: [], erreurs, fps: null, gameState: null, metriques: {} };

async function capture(nom) {
  const path = `${OUT}/${String(rapport.captures.length + 1).padStart(2, '0')}-${nom}.png`;
  const buf = await page.screenshot({ path });
  rapport.metriques[path] = await metriques(buf);
  rapport.captures.push(path);
}

// Métriques d'image : contraste (écart de luminosité), variété de couleurs, part de pixels quasi noirs.
async function metriques(buf) {
  const p = await browser.newPage();
  const m = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = new OffscreenCanvas(320, 180); const x = c.getContext('2d'); x.drawImage(img, 0, 0, 320, 180);
    const d = x.getImageData(0, 0, 320, 180).data; const lum = []; const teintes = new Set(); let noirs = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; lum.push(l); if (l < 12) noirs++;
      teintes.add(`${d[i] >> 5},${d[i + 1] >> 5},${d[i + 2] >> 5}`);
    }
    const moy = lum.reduce((a, b) => a + b, 0) / lum.length;
    const ecart = Math.sqrt(lum.reduce((a, b) => a + (b - moy) ** 2, 0) / lum.length);
    return { luminositeMoyenne: Math.round(moy), contraste: Math.round(ecart), couleursDistinctes: teintes.size, partNoir: +(noirs / lum.length).toFixed(2) };
  }, buf.toString('base64'));
  await p.close();
  return m;
}

try {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);
  await capture('arrivee');

  if (args.includes('--parcours') && existsSync('demo/parcours.json')) {
    // Format : [{ "nom": "premiere-action", "hook": "action", "arg": "boule de feu", "attendre": "gameState.enCours == null", "attente": 500 }, ...]
    // "attendre" = condition JavaScript sur la page (max 8 s) ; "attente" = pause fixe en ms ensuite.
    for (const e of JSON.parse(readFileSync('demo/parcours.json', 'utf8'))) {
      if (e.hook) await page.evaluate(([h, a]) => window.gameHooks?.[h]?.(a), [e.hook, e.arg]);
      if (e.touche) await page.keyboard.press(e.touche);
      if (e.clic) await page.mouse.click(e.clic[0], e.clic[1]);
      if (e.attendre) await page.waitForFunction(`(() => { try { return !!(window.${e.attendre}); } catch { return false; } })()`, null, { timeout: 8000 }).catch(() => erreurs.push(`Étape « ${e.nom} » : condition jamais atteinte (${e.attendre})`));
      await page.waitForTimeout(e.attente ?? 1000);
      await capture(e.nom);
    }
  } else {
    await page.mouse.click(800, 450); await page.waitForTimeout(400);
    for (const k of ['Space', 'Enter', 'ArrowLeft', 'ArrowRight']) { await page.keyboard.press(k); await page.waitForTimeout(150); }
    await capture('apres-interaction');
  }

  rapport.fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); (function f() { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)); })(); }));
  rapport.gameState = await page.evaluate(() => { try { return JSON.parse(JSON.stringify(window.gameState ?? null)); } catch { return 'non sérialisable'; } });
  await capture('final');
} catch (e) {
  erreurs.push('CAPTURE IMPOSSIBLE : ' + e.message);
}

const vide = Object.values(rapport.metriques).filter((m) => m.couleursDistinctes < 8 || m.contraste < 4).length;
rapport.ecransVides = vide;
writeFileSync(`${OUT}/rapport.json`, JSON.stringify(rapport, null, 2));
await context.close();
await browser.close();
server?.kill();
console.log(`Captures : ${rapport.captures.join(', ')}`);
console.log(`Images/seconde : ${rapport.fps}${rapport.fps && rapport.fps < 30 ? '  ⚠ sous 30' : ''} (navigateur automatique : peut être plus bas que le vrai navigateur)`);
console.log(`gameState exposé : ${rapport.gameState ? 'oui' : 'NON — ajouter window.gameState'}`);
console.log(erreurs.length ? `ERREURS CONSOLE (${erreurs.length}) :\n- ${erreurs.slice(0, 15).join('\n- ')}` : 'Aucune erreur console.');
if (vide) console.log(`⚠ ÉCRAN VIDE ou uni sur ${vide} capture(s) : la page a probablement planté ou rien ne s'affiche.`);
if (video) console.log('Vidéo : captures/video/');
console.log('Détail : captures/rapport.json — regarde les images avec Read.');
process.exit(erreurs.length || vide ? 1 : 0);
