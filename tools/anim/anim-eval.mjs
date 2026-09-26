// Banc d'évaluation des animations (lot LE, plan/lots/LE-eval-animation.md).
// Joue chaque scénario de tools/anim/scenarios.json dans un contexte Playwright séparé (donc une vidéo par
// scénario), compose une planche contact-sheet DANS la page (canvas 2D, aucun paquet à installer), lit
// window.animMetrics et calcule les tests de seuil du tableau de plan/lots/LAN-animation.md (score sur 100,
// poids égaux par test).
// Tant que le lot LAN n'existe pas (gameHooks.animCamera / gameHooks.animPlay ou window.animMetrics absents) :
// l'outil ne plante jamais — il produit quand même les planches (caméra par défaut du jeu), un score de 0 et
// la liste de ce qui manque, et sort avec le code 0.
// Usage : node tools/anim/anim-eval.mjs [--url http://localhost:5173] [--no-gemini]
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, unlinkSync, renameSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = opt('--url', 'http://localhost:5351');
const URL_TEST = URL_BASE + (URL_BASE.includes('?') ? '&' : '?') + 'demo=1&animtest=1';
const SANS_GEMINI = args.includes('--no-gemini');

const OUT = 'captures/anim';
const OUT_VIDEO = `${OUT}/video`;
mkdirSync(OUT_VIDEO, { recursive: true });
// On repart de planches/rapport propres à chaque lancement (mêmes précautions que tools/capture.mjs).
// On NE touche PAS à gemini-verdict.json ici : --no-gemini ne doit pas effacer un verdict précédent.
for (const f of readdirSync(OUT)) if (f.endsWith('-planche.png') || f === 'rapport.json') unlinkSync(`${OUT}/${f}`);
for (const f of readdirSync(OUT_VIDEO)) if (f.endsWith('.webm')) unlinkSync(`${OUT_VIDEO}/${f}`);

const scenarios = JSON.parse(readFileSync('tools/anim/scenarios.json', 'utf8'));

// ---- Serveur Vite : réutilisé s'il tourne déjà, sinon lancé (repris de tools/capture.mjs). ----
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server;
if (!(await up(URL_BASE))) {
  console.log('Serveur absent : lancement de Vite…');
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5351', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up(URL_BASE)); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});

const VIEWPORT = { width: 1600, height: 900 };
const manquants = new Set();
const tests = [];

// ---- Contrat LAN (plan/lots/LAN-animation.md) : jamais d'exception, juste une constatation. ----
async function verifierContrat(page) {
  const contrat = await page.evaluate(() => ({
    animMetrics: typeof window.animMetrics === 'object' && window.animMetrics !== null,
    animCamera: typeof window.gameHooks?.animCamera === 'function',
    animPlay: typeof window.gameHooks?.animPlay === 'function',
  })).catch(() => ({ animMetrics: false, animCamera: false, animPlay: false }));
  if (!contrat.animMetrics) manquants.add('window.animMetrics');
  if (!contrat.animCamera) manquants.add('gameHooks.animCamera');
  if (!contrat.animPlay) manquants.add('gameHooks.animPlay');
  return contrat;
}

// Appelle un gameHooks.<hook>(...args) depuis Node ; jamais d'exception qui remonte.
async function appelerHook(page, hook, hookArgs) {
  const r = await page.evaluate(({ hook, hookArgs }) => {
    try {
      const fn = window.gameHooks && window.gameHooks[hook];
      if (typeof fn !== 'function') return { ok: false, manquant: `gameHooks.${hook}` };
      fn(...(hookArgs || []));
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: `${hook} a levé une erreur : ${e && e.message ? e.message : e}` };
    }
  }, { hook, hookArgs }).catch((e) => ({ ok: false, erreur: `${hook} (page.evaluate) : ${e.message}` }));
  if (!r.ok) manquants.add(r.manquant || r.erreur || `gameHooks.${hook}`);
  return r.ok;
}

async function reinitialiserMetriques(page) {
  await page.evaluate(() => { try { window.animMetrics?.reset?.(); } catch { /* tant pis, on continue */ } }).catch(() => {});
}

async function lireMetriques(page) {
  return page.evaluate(() => {
    try {
      if (!window.animMetrics) return null;
      return { samples: window.animMetrics.samples ?? [], events: window.animMetrics.events ?? [] };
    } catch { return null; }
  }).catch(() => null);
}

// ---- Planche contact-sheet : composée DANS la page, via un canvas 2D (aucun paquet à installer). ----
// On envoie les PNG en base64 à page.evaluate, on les dessine en grille avec le numéro et le temps sous
// chaque image, puis on récupère toDataURL et on écrit le fichier depuis Node.
async function composerPlanche(page, scenario, frames) {
  const cols = Math.max(1, Math.min(8, frames.length || 1));
  const titre = `${scenario.name} — joueur ${scenario.player} — caméra ${scenario.camera ?? 'réelle (non forcée)'}`;
  const dataUrl = await page.evaluate(async ({ frames, titre, cols }) => {
    const thumbW = 320, thumbH = 180, labelH = 22, headH = 32, pad = 4;
    const rows = Math.max(1, Math.ceil(frames.length / cols));
    const canvas = document.createElement('canvas');
    canvas.width = cols * (thumbW + pad) + pad;
    canvas.height = headH + rows * (thumbH + labelH + pad) + pad;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#eee';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(titre, 8, 21);
    for (let i = 0; i < frames.length; i++) {
      const img = new Image();
      img.src = `data:image/png;base64,${frames[i].b64}`;
      await img.decode();
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (thumbW + pad);
      const y = headH + pad + row * (thumbH + labelH + pad);
      ctx.drawImage(img, x, y, thumbW, thumbH);
      ctx.fillStyle = '#7CFC7C';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`#${i + 1}  t=${frames[i].t}ms`, x + thumbW / 2, y + thumbH + 16);
    }
    return canvas.toDataURL('image/png');
  }, { frames, titre, cols });
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(`${OUT}/${scenario.name}-planche.png`, Buffer.from(b64, 'base64'));
}

// ---- Tests de seuil (tableau de plan/lots/LAN-animation.md). ----
// Chaque test s'auto-désactive si les échantillons/événements nécessaires sont absents : un test non
// calculable ne compte ni pour ni contre le score (poids égaux, seulement parmi les tests calculés).
function ajouterTest(sortie, nom, scenarioName, ok, valeur, seuil) {
  sortie.push({ nom, scenario: scenarioName, ok: !!ok, valeur, seuil });
}

const SCENARIOS_VISEE = ['throw-grenade', 'throwable', 'blaster', 'shield', 'parry', 'defense-swing'];

function calculerTests(scenario, metrics) {
  const sortie = [];
  if (!metrics) return sortie;
  const samples = Array.isArray(metrics.samples) ? metrics.samples : [];
  const events = Array.isArray(metrics.events) ? metrics.events : [];

  // Fondus (transitions) : ≥ 80 ms, ≥ 50 ms si c'est une transition vers une réaction/KO.
  for (const ev of events) {
    if (ev.kind !== 'transition' || ev.durationMs == null) continue;
    const versReaction = /hit|ko/i.test(ev.to || '');
    const seuil = versReaction ? 50 : 80;
    ajouterTest(sortie, 'Fondus', scenario.name, ev.durationMs >= seuil, ev.durationMs, `≥ ${seuil} ms`);
  }

  // Glissement des pieds posés : < 1,5 cm par image.
  const glissements = samples.flatMap((s) => (Array.isArray(s.footSlideCm) ? s.footSlideCm : []));
  if (glissements.length) {
    const pire = Math.max(...glissements);
    ajouterTest(sortie, 'Glissement des pieds', scenario.name, pire < 1.5, +pire.toFixed(2), '< 1,5 cm/image');
  }

  // Vitesse d'anim / vitesse au sol : entre 0,8 et 1,2 (on ignore les échantillons quasi à l'arrêt).
  const ratios = samples.filter((s) => s.groundSpeed > 0.05).map((s) => s.animRate / s.groundSpeed);
  if (ratios.length) {
    const moyenne = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    ajouterTest(sortie, 'Vitesse anim / sol', scenario.name, moyenne >= 0.8 && moyenne <= 1.2, +moyenne.toFixed(2), '0,8 – 1,2');
  }

  // Écart projectile-main au lâcher : < 8 cm, à ± 50 ms du marqueur de lâcher (positions supposées en mètres).
  const distanceCm = (a, b) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const rel of events.filter((e) => e.kind === 'release' && e.handPos)) {
    const spawn = events.find((e) => e.kind === 'spawn' && e.spawnPos && Math.abs(e.t - rel.t) <= 50);
    if (!spawn) continue;
    const ecart = distanceCm(rel.handPos, spawn.spawnPos);
    ajouterTest(sortie, 'Écart projectile-main', scenario.name, ecart < 8, +ecart.toFixed(2), '< 8 cm');
  }

  // Armé avant le lâcher ≥ 120 ms ; continuité après le lâcher ≥ 150 ms.
  const transitions = events.filter((e) => e.kind === 'transition').sort((a, b) => a.t - b.t);
  for (const rel of events.filter((e) => e.kind === 'release')) {
    const avant = [...transitions].reverse().find((tr) => tr.t <= rel.t && /throw/i.test(tr.to || ''));
    if (avant) ajouterTest(sortie, 'Armé avant le lâcher', scenario.name, rel.t - avant.t >= 120, rel.t - avant.t, '≥ 120 ms');
    const apres = transitions.find((tr) => tr.t >= rel.t && !/throw/i.test(tr.to || ''));
    if (apres) ajouterTest(sortie, 'Continuité après le lâcher', scenario.name, apres.t - rel.t >= 150, apres.t - rel.t, '≥ 150 ms');
  }

  // Orientation en visée : torse < 10°, tête < 15° (scénarios de visée / garde / parade uniquement).
  if (SCENARIOS_VISEE.includes(scenario.name) && samples.length) {
    const torse = samples.reduce((a, s) => a + Math.abs(s.facingErrDeg ?? 0), 0) / samples.length;
    const tete = samples.reduce((a, s) => a + Math.abs(s.lookErrDeg ?? 0), 0) / samples.length;
    ajouterTest(sortie, 'Orientation torse', scenario.name, torse < 10, +torse.toFixed(1), '< 10°');
    ajouterTest(sortie, 'Orientation tête', scenario.name, tete < 15, +tete.toFixed(1), '< 15°');
  }

  // Pied-sol : |écart| < 4 cm (pénétration ou flottement du pied par rapport au sol).
  const ecartsSol = samples.flatMap((s) => (Array.isArray(s.footGapCm) ? s.footGapCm : []));
  if (ecartsSol.length) {
    const pire = Math.max(...ecartsSol.map(Math.abs));
    ajouterTest(sortie, 'Pied-sol', scenario.name, pire < 4, +pire.toFixed(2), '|écart| < 4 cm');
  }

  // Réaction à un coup : lancée en moins de 100 ms.
  for (const ev of events.filter((e) => e.kind === 'hit-react' && e.durationMs != null)) {
    ajouterTest(sortie, 'Réaction à un coup', scenario.name, ev.durationMs < 100, ev.durationMs, '< 100 ms');
  }

  // Idle vivant : variation de colonne non nulle, au moins 2 couches actives en moyenne.
  if (scenario.name === 'idle' && samples.length) {
    const variation = samples.reduce((a, s) => a + Math.abs(s.spineRotVar ?? 0), 0) / samples.length;
    const couches = samples.reduce((a, s) => {
      const l = s.layers || {};
      const actives = (l.footIK ? 1 : 0) + (l.lookAt ? 1 : 0) + (Math.abs(l.lean ?? 0) > 0.01 ? 1 : 0) + ((l.squash ?? 1) < 0.99 ? 1 : 0);
      return a + actives;
    }, 0) / samples.length;
    ajouterTest(sortie, 'Idle vivant', scenario.name, variation > 0.001 && couches >= 2,
      `variation=${variation.toFixed(3)} couches=${couches.toFixed(1)}`, 'variation > 0 et ≥ 2 couches actives');
  }

  // Réception : écrasement visible (échelle Y < 0,95) pendant au moins 60 ms autour d'un atterrissage.
  for (const land of events.filter((e) => e.kind === 'land')) {
    const fenetre = samples.filter((s) => s.t >= land.t && s.t <= land.t + 400 && s.layers).sort((a, b) => a.t - b.t);
    let plusLong = 0, courant = 0, dernierT = null;
    for (const s of fenetre) {
      if ((s.layers.squash ?? 1) < 0.95) {
        courant += dernierT != null ? s.t - dernierT : 0;
        plusLong = Math.max(plusLong, courant);
      } else courant = 0;
      dernierT = s.t;
    }
    if (fenetre.length) ajouterTest(sortie, 'Réception (écrasement)', scenario.name, plusLong >= 60, Math.round(plusLong), '≥ 60 ms');
  }

  // T-pose : aucune image sans clip actif.
  if (samples.length) {
    const tposes = samples.filter((s) => !s.clip || s.weight <= 0).length;
    ajouterTest(sortie, 'T-pose', scenario.name, tposes === 0, tposes, '0 image');
  }

  return sortie;
}

// ---- Un scénario = un contexte Playwright séparé = une vidéo (captures/anim/video/<scénario>.webm). ----
async function jouerScenario(scenario) {
  const camLabel = scenario.camera ?? 'réelle (non forcée)';
  console.log(`\n▶ ${scenario.name} (joueur ${scenario.player}, caméra ${camLabel})`);
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: OUT_VIDEO, size: VIEWPORT } });
  const page = await context.newPage();
  const erreursConsole = [];
  page.on('console', (m) => m.type() === 'error' && erreursConsole.push(m.text()));
  page.on('pageerror', (e) => erreursConsole.push(e.message));

  let metrics = null;
  let frames = [];
  try {
    await page.goto(URL_TEST, { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => !!window.gameHooks, null, { timeout: 8000 }).catch(() => manquants.add('window.gameHooks'));
    await page.waitForTimeout(500);

    await verifierContrat(page);
    await reinitialiserMetriques(page);

    // Le banc doit démarrer le match sans menus
    await appelerHook(page, 'startMatch', []);
    await page.waitForTimeout(500);

    // Ordre imposé par le lot LE : reset des métriques, puis caméra, puis étapes.
    if (scenario.camera) await appelerHook(page, 'animCamera', [scenario.player, scenario.camera]);

    for (const step of scenario.steps ?? []) {
      await appelerHook(page, step.hook, step.args);
      if (step.waitMs) await page.waitForTimeout(step.waitMs);
    }

    // Capture : une image toutes les intervalMs pendant captureMs. Le temps affiché sur la planche est
    // celui mesuré (Date.now), pas une valeur supposée : la dérive éventuelle reste honnête.
    const depart = Date.now();
    const captureMs = scenario.captureMs ?? 1600;
    const intervalMs = scenario.intervalMs ?? 66;
    while (Date.now() - depart < captureMs) {
      const buf = await page.screenshot({ type: 'png' });
      frames.push({ b64: buf.toString('base64'), t: Date.now() - depart });
      await page.waitForTimeout(intervalMs);
    }

    metrics = await lireMetriques(page);
  } catch (e) {
    manquants.add(`scénario ${scenario.name} : ${e.message}`);
    console.log(`  ⚠ ${e.message}`);
  }

  // La planche se compose avec ce qu'on a pu capturer, même si la suite a échoué (jamais 0 image si la page a chargé).
  try {
    if (frames.length) await composerPlanche(page, scenario, frames);
    else manquants.add(`scénario ${scenario.name} : aucune image capturée`);
  } catch (e) {
    manquants.add(`scénario ${scenario.name} : planche impossible (${e.message})`);
  }

  try { await context.close(); } catch { /* déjà fermé ou navigateur parti : tant pis */ }
  try {
    const video = page.video();
    const brut = video ? await video.path() : null;
    if (brut && existsSync(brut)) renameSync(brut, `${OUT_VIDEO}/${scenario.name}.webm`);
  } catch { /* pas de vidéo exploitable : on continue sans */ }

  if (erreursConsole.length) console.log(`  console (${erreursConsole.length}) : ${erreursConsole.slice(0, 3).join(' | ')}`);

  let testsScenario = [];
  try { testsScenario = calculerTests(scenario, metrics); } catch (e) { manquants.add(`scénario ${scenario.name} : tests de seuil impossibles (${e.message})`); }
  tests.push(...testsScenario);
  console.log(`  ${metrics ? `${testsScenario.filter((t) => t.ok).length}/${testsScenario.length} tests de seuil` : 'animMetrics absent : pas de test de seuil'} — ${frames.length} images capturées.`);
}

for (const scenario of scenarios) {
  try {
    await jouerScenario(scenario);
  } catch (e) {
    manquants.add(`scénario ${scenario.name} (échec complet) : ${e.message}`);
    console.log(`  ✗ échec complet du scénario ${scenario.name} : ${e.message}`);
  }
}

await browser.close();
server?.kill();

const score = tests.length ? Math.round((100 * tests.filter((t) => t.ok).length) / tests.length) : 0;
const manquantsTries = [...manquants].sort();
const resume = [
  `Score : ${score}/100 (${tests.filter((t) => t.ok).length}/${tests.length} tests de seuil calculés sur ${scenarios.length} scénarios).`,
  manquantsTries.length ? `Manquants (${manquantsTries.length}) : ${manquantsTries.join(', ')}` : 'Rien ne manque au contrat LAN.',
  `Scénarios joués : ${scenarios.map((s) => s.name).join(', ')}.`,
  `Planches : ${OUT}/*-planche.png — vidéos : ${OUT_VIDEO}/*.webm — détail : ${OUT}/rapport.json`,
].join('\n');

writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ score, tests, manquants: manquantsTries, resume }, null, 2));
console.log(`\n${resume}`);

if (SANS_GEMINI) {
  console.log('\n--no-gemini : juge vidéo Gemini ignoré.');
} else {
  console.log('\nLancement du juge vidéo Gemini (tools/anim/juge-gemini.mjs)…');
  const r = spawnSync(process.execPath, ['tools/anim/juge-gemini.mjs'], { stdio: 'inherit' });
  if (r.status !== 0) console.log(`(juge-gemini.mjs a terminé avec le code ${r.status})`);
}

process.exit(0);
