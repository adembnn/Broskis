// Lot LE2E · film des attentes (demande d'Adem, 17h55) : pendant la génération d'une tête (visage FICTIF) et d'un objet
// (chaise d'Adem, chemin absolu, photo masquée), une capture toutes les 0,5 s de l'encart, assemblées en bande, et un
// verdict VERT / ROUGE par critère. 3 passages : réseau normal, réseau ralenti de 8 s, API coupée.
//   npm run e2e:attente -- --visages <dossier> [--port 5375]
// Rapport : reports/e2e/attente-<horodatage>/index.html (+ images de chaque bande, resultat.json).
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VISAGES = opt('--visages', null);
const PHOTO_OBJET = opt('--objet', 'C:\\Users\\Adem\\Documents\\Hackathon Voodoo\\Voodoo-Hack\\tools\\scan-bench\\photos\\objets\\chaise-bureau.jpg');
let PORT = Number(opt('--port', '5375'));
const PAS_MS = 500;
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const OUT = join('reports', 'e2e', `attente-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(`[attente ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };
const MASQUE = ['.wc-photo-wrap', '.lload-forge-photo', '.capture-zone', 'video'];
const APIS = /\/api\/(scan-fighter|scan-object|sticker)$/;

if (!VISAGES || !existsSync(join(VISAGES, 'visage-fictif-1.jpg'))) { console.error('--visages <dossier> requis (visage-fictif-1.jpg)'); process.exit(1); }

/** Filme `zone` toutes les 0,5 s jusqu'à `fini()` ou `maxMs` ; chaque image : texte et images de l'encart `mesure`
 *  (par défaut la zone), canvas de la zone, bouton de validation, empreinte de la capture. */
async function filmer(page, nom, zone, bouton, estAffiche, maxMs, mesure = zone) {
  const images = [];
  const t0 = Date.now();
  for (let i = 0; Date.now() - t0 < maxMs; i++) {
    const tick = Date.now();
    const loc = page.locator(zone).first();
    const box = await loc.boundingBox().catch(() => null);
    const etat = await page.evaluate(({ zone, mesure, bouton }) => {
      const z = document.querySelector(zone);
      const m = document.querySelector(mesure) ?? z;
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && Number(s.opacity) > 0.1; };
      const b = bouton ? [...document.querySelectorAll(bouton.sel)].find((e) => e.textContent.trim().match(new RegExp(bouton.texte, 'i'))) : null;
      return {
        texte: (m?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 240),
        imgs: m ? [...m.querySelectorAll('img')].filter((e) => e.complete && e.naturalWidth > 0 && vis(e)).length : 0,
        canvas: z ? [...z.querySelectorAll('canvas')].filter(vis).length : 0,
        bouton: b ? (b.disabled ? 'bloqué' : 'actif') : 'absent',
        boutons: [...document.querySelectorAll('button')].filter(vis).map((e) => e.textContent.trim()).filter(Boolean).slice(0, 12),
        present: !!z,
      };
    }, { zone, mesure, bouton });
    etat.affiche = await estAffiche();
    etat.t = Math.round((tick - t0) / 100) / 10;
    let buf = null;
    try {
      buf = await page.screenshot({ type: 'jpeg', quality: 55, clip: box ?? undefined, mask: MASQUE.map((s) => page.locator(s)), maskColor: '#2a2530' });
    } catch { /* image perdue : on garde l'état */ }
    if (buf) {
      const f = `${nom}-${String(i).padStart(3, '0')}.jpg`;
      writeFileSync(join(OUT, f), buf);
      etat.fichier = f;
      etat.empreinte = createHash('md5').update(buf).digest('hex').slice(0, 10);
    }
    images.push(etat);
    if (etat.affiche && etat.bouton === 'actif') break;
    const reste = PAS_MS - (Date.now() - tick);
    if (reste > 0) await sleep(reste);
  }
  return images;
}

/** Critères communs d'un film. */
function juger(film, { texteMin = 3 } = {}) {
  const avant = film.filter((f) => !f.affiche);
  const textes = new Set(avant.map((f) => f.texte).filter(Boolean));
  let immobileMax = 1, run = 1;
  for (let i = 1; i < film.length; i++) {
    run = film[i].empreinte && film[i].empreinte === film[i - 1].empreinte ? run + 1 : 1;
    immobileMax = Math.max(immobileMax, run);
  }
  const imgDebut = film[0]?.imgs ?? 0;
  return {
    textesIntermediaires: textes.size,
    texteProgressif: textes.size >= texteMin,
    imageRevelee: film.some((f) => f.imgs > imgDebut),
    construction3D: film.some((f) => f.canvas > 0),
    immobileMaxS: Math.round(((immobileMax - 1) * PAS_MS) / 100) / 10,
    toujoursEnMouvement: immobileMax < 3, // 3 images identiques d'affilée = 1 s sans rien qui bouge
    boutonBloque: avant.every((f) => f.bouton !== 'actif'),
    fini: film.some((f) => f.affiche),
    dureeS: film.at(-1)?.t ?? 0,
  };
}

async function versEcranPersos(page, base) {
  await page.goto(`${base}/`, { timeout: 180000 });
  await page.waitForFunction(() => !!window.ctx?.bus, null, { timeout: 180000 });
  await page.locator('.title-play').click({ force: true, timeout: 60000 });
  await page.locator('.fighter-grid').waitFor({ timeout: 30000 });
}

async function importer(page, scope, fichier) {
  await page.locator(`${scope} .capture`).first().waitFor({ timeout: 15000 });
  const [ch] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.locator(`${scope} button:has-text("Import a photo")`).first().click()]);
  await ch.setFiles(fichier);
}

/** Un passage complet : tête de P1 (visage fictif), puis objet de P1 (chaise). `reseau` : 'normal' | 'lent' | 'coupe'. */
async function passage(page, base, reseau) {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  if (reseau === 'lent') await page.route(APIS, async (r) => { await sleep(8000); await r.continue().catch(() => {}); });
  if (reseau === 'coupe') await page.route(APIS, (r) => r.abort('failed'));
  const res = { reseau };
  await versEcranPersos(page, base);
  // Tête
  await page.locator('.fighter-grid .snap-tile').first().click();
  await importer(page, '.fighters-card', join(VISAGES, 'visage-fictif-1.jpg'));
  // P2 prend tout de suite un perso préréglé : « Ready » ne dépend plus que de la tête de P1.
  await page.locator('.fighter-grid .fighter-tile:not(.snap-tile)').first().click({ timeout: 5000 }).catch(() => {});
  const teteAffichee = () => page.evaluate(() => !!document.querySelector('.fighter-panel.p1 img.face, .fighter-panel.p1 .portrait-img.face, .fighter-panel.p1 canvas, .fighter-stage canvas'));
  // Capture : toute la carte (encart + vitrine 3D) ; texte et images mesurés dans l'encart de P1 seulement.
  res.tete = await filmer(page, `${reseau}-tete`, '.fighters-card', { sel: '.ready-bar', texte: 'ready' }, teteAffichee, reseau === 'lent' ? 60000 : reseau === 'coupe' ? 15000 : 40000, '.fighter-panel.p1');
  res.teteFin = await page.evaluate(() => ({
    ecran: document.querySelector('.fighters-card') ? 'persos' : 'autre',
    boutons: [...document.querySelectorAll('.fighters-card button')].map((e) => e.textContent.trim()).filter(Boolean),
    message: [...document.querySelectorAll('.fighter-panel .fighter-issue')].map((e) => e.textContent.trim()),
  }));
  if (reseau === 'coupe') return res; // API coupée : on juge l'écran des persos, puis l'arsenal via un passage à part
  // Objet (arsenal)
  const ready = page.locator('.ready-bar');
  for (let i = 0; i < 120 && (await ready.isDisabled().catch(() => true)); i++) await sleep(500);
  await ready.click({ force: true }).catch(() => {});
  await page.locator('.arsenal-card.p1 .weapon-rack .snap-tile').waitFor({ timeout: 30000 });
  await page.locator('.arsenal-card.p1 .weapon-rack .snap-tile').click();
  await importer(page, '.arsenal-card.p1', PHOTO_OBJET);
  const objetAffiche = () => page.evaluate(() => !!document.querySelector('.arsenal-card.p1 .weapon-snap-area canvas, .arsenal-card.p1 .lload-forge[data-step="sticker"]'));
  res.objet = await filmer(page, `${reseau}-objet`, '.arsenal-card.p1 .weapon-snap-area', { sel: '.arsenal-card.p1 .weapon-snap-area button', texte: 'confirm' }, objetAffiche, reseau === 'lent' ? 70000 : 45000);
  res.objetFin = await page.evaluate(() => ({
    ecran: document.querySelector('.arsenal-card.p1') ? 'arsenal' : 'autre',
    boutons: [...document.querySelectorAll('.arsenal-card.p1 .weapon-snap-area button')].map((e) => e.textContent.trim()).filter(Boolean),
    note: document.querySelector('.arsenal-card.p1 .weapon-confirm .capture-error')?.textContent?.trim() ?? null,
  }));
  return res;
}

/** API coupée côté objet : on arrive à l'arsenal avec un perso préréglé, puis on coupe les API et on scanne. */
async function objetCoupe(page, base) {
  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await versEcranPersos(page, base);
  await page.locator('.fighter-grid .fighter-tile:not(.snap-tile)').nth(0).click();
  await page.locator('.fighter-grid .fighter-tile:not(.snap-tile)').nth(1).click();
  await page.locator('.ready-bar').click({ force: true });
  await page.route(APIS, (r) => r.abort('failed'));
  await page.locator('.arsenal-card.p1 .weapon-rack .snap-tile').click();
  await importer(page, '.arsenal-card.p1', PHOTO_OBJET);
  const film = await filmer(page, 'coupe-objet', '.arsenal-card.p1 .weapon-snap-area', { sel: '.arsenal-card.p1 .weapon-snap-area button', texte: 'default' }, async () => false, 30000);
  return { objet: film, boutons: film.at(-1)?.boutons ?? [] };
}

const bande = (nom, legende) => existsSync(join(OUT, `bande-${nom}.jpg`)) ? `<h3>${legende}</h3><img class="planche" src="bande-${nom}.jpg" alt="">` : '';

// ---------------------------------------------------------------------------------------------------------------
for (let i = 0; i < 20 && (await up(`http://localhost:${PORT}/`)); i++) PORT += 1;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/e2e/vite.e2e.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${PORT}`;
const R = {};
try {
  for (let i = 0; i < 120 && !(await up(`${base}/`)); i++) await sleep(500);
  log(`Vite (PID ${server.pid}) sur ${PORT}`);
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu'] });
  // Un contexte neuf par passage : aucun cache (scan, sticker, portrait) ne court-circuite le réseau ralenti ou coupé.
  const nouvellePage = async () => (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  for (const reseau of ['normal', 'lent', 'coupe']) {
    log(`passage ${reseau}`);
    const page = await nouvellePage();
    try { R[reseau] = await passage(page, base, reseau); } catch (e) { R[reseau] = { erreur: e.message.split('\n')[0] }; log(`  ${reseau} : ${R[reseau].erreur}`); }
    await page.context().close();
  }
  log('passage objet API coupée');
  const page = await nouvellePage();
  try { R.coupeObjet = await objetCoupe(page, base); } catch (e) { R.coupeObjet = { erreur: e.message.split('\n')[0] }; }
  await page.context().close();
  // Planches chronologiques : chaque film devient UNE image (8 vignettes par ligne, temps sous chacune), puis les images
  // unitaires sont effacées (le rapport reste léger).
  const films = { 'normal-tete': R.normal?.tete, 'normal-objet': R.normal?.objet, 'lent-tete': R.lent?.tete, 'lent-objet': R.lent?.objet, 'coupe-tete': R.coupe?.tete, 'coupe-objet': R.coupeObjet?.objet };
  const planche = await (await browser.newContext({ viewport: { width: 1480, height: 400 } })).newPage();
  for (const [nom, film] of Object.entries(films)) {
    const vues = (film ?? []).filter((f) => f.fichier);
    if (!vues.length) continue;
    // Images en data URL : une page about:blank n'a pas le droit de lire des fichiers locaux.
    const src = (f) => `data:image/jpeg;base64,${readFileSync(join(OUT, f.fichier)).toString('base64')}`;
    await planche.setContent(`<html><body style="margin:0;background:#f6f3ee;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(8,180px);gap:4px;padding:4px">${vues.map((f) => `<div><img src="${src(f)}" style="width:180px;display:block;border:2px solid ${f.affiche ? '#1f8a4c' : '#e2dcd2'}"><div>${f.t} s${f.affiche ? ' ✓' : ''}${f.bouton === 'actif' ? ' ▶' : ''}</div></div>`).join('')}</div></body></html>`);
    await planche.waitForLoadState('load');
    await planche.screenshot({ path: join(OUT, `bande-${nom}.jpg`), type: 'jpeg', quality: 70, fullPage: true });
    for (const f of vues) { try { unlinkSync(join(OUT, f.fichier)); } catch { /* déjà effacée */ } }
  }
  await planche.context().close();
  await browser.close();
} finally {
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
}

// Verdicts
const V = [];
const add = (label, ok, detail) => V.push({ label, ok: !!ok, detail });
const jt = R.normal?.tete ? juger(R.normal.tete) : null;
const jo = R.normal?.objet ? juger(R.normal.objet) : null;
add('Texte progressif (≥ 3 états intermédiaires) — tête', jt?.texteProgressif, jt ? `${jt.textesIntermediaires} textes différents avant la tête` : 'non filmé');
add('Texte progressif (≥ 3 états intermédiaires) — objet', jo?.texteProgressif, jo ? `${jo.textesIntermediaires} textes différents avant l'objet 3D` : 'non filmé');
add("L'image se révèle — tête", jt?.imageRevelee, jt ? `images visibles : ${R.normal.tete[0]?.imgs} → ${Math.max(...R.normal.tete.map((f) => f.imgs))}` : '—');
add("L'image se révèle — objet", jo?.imageRevelee, jo ? `images visibles : ${R.normal.objet[0]?.imgs} → ${Math.max(...R.normal.objet.map((f) => f.imgs))}` : '—');
add('Le 3D se construit — tête', jt?.construction3D, jt ? `canvas dans l'écran : ${Math.max(...R.normal.tete.map((f) => f.canvas))}` : '—');
add('Le 3D se construit — objet', jo?.construction3D, jo ? `canvas dans l'encart : ${Math.max(...R.normal.objet.map((f) => f.canvas))}` : '—');
add('Aucune seconde où rien ne bouge — tête', jt?.toujoursEnMouvement, jt ? `plus longue immobilité : ${jt.immobileMaxS} s` : '—');
add('Aucune seconde où rien ne bouge — objet', jo?.toujoursEnMouvement, jo ? `plus longue immobilité : ${jo.immobileMaxS} s` : '—');
add('Validation bloquée tant que la tête n\'est pas affichée', jt?.boutonBloque && jt?.fini, jt ? `bouton « Ready » ${jt.boutonBloque ? 'bloqué' : 'ACTIF'} avant la tête ; tête affichée : ${jt.fini ? `oui (${jt.dureeS} s)` : 'non'}` : '—');
add("Validation bloquée tant que l'objet 3D n'est pas affiché", jo?.boutonBloque && jo?.fini, jo ? `bouton « Confirm » ${jo.boutonBloque ? 'bloqué/absent' : 'ACTIF'} avant l'objet 3D ; objet 3D affiché : ${jo.fini ? `oui (${jo.dureeS} s)` : 'non'}` : '—');
const lt = R.lent?.tete ? juger(R.lent.tete) : null;
const lo = R.lent?.objet ? juger(R.lent.objet) : null;
add('Réseau ralenti de 8 s : on reste sur l\'écran, la progression continue', lt && lo && R.lent.teteFin?.ecran === 'persos' && lt.toujoursEnMouvement && lo.toujoursEnMouvement && R.lent.objetFin?.ecran === 'arsenal' && !R.lent.objetFin?.note && !(R.lent.teteFin?.message ?? []).length,
  lt && lo ? `tête ${lt.fini ? `affichée à ${lt.dureeS} s` : 'non affichée'}, immobilité max ${lt.immobileMaxS} s, message : ${(R.lent.teteFin?.message ?? []).join(' / ') || 'aucun'} · objet ${lo.fini ? `affiché à ${lo.dureeS} s` : 'non affiché'}, immobilité max ${lo.immobileMaxS} s, note : ${R.lent.objetFin?.note ?? 'aucune'}` : (R.lent?.erreur ?? 'non filmé'));
const btnT = R.coupe?.teteFin?.boutons ?? [];
const btnO = R.coupeObjet?.boutons ?? [];
add('API coupée : boutons Retry et Default — tête', btnT.some((b) => /retry/i.test(b)) && btnT.some((b) => /default/i.test(b)), `boutons : ${btnT.join(', ') || 'aucun'} ; message : ${(R.coupe?.teteFin?.message ?? []).join(' / ') || 'aucun'}`);
add('API coupée : boutons Retry et Default — objet', btnO.some((b) => /retry/i.test(b)) && btnO.some((b) => /default/i.test(b)), `boutons : ${btnO.join(', ') || 'aucun'}`);

const nb = V.filter((v) => v.ok).length;
let branch = '?', commit = '?';
try { branch = execSync('git branch --show-current').toString().trim(); commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* hors git */ }
writeFileSync(join(OUT, 'resultat.json'), JSON.stringify({ branch, commit, verdicts: V, films: R }, null, 1));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Film des attentes</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>
:root{--fond:#f6f3ee;--encre:#1d1a22;--doux:#6b6470;--vert:#1f8a4c;--rouge:#c2362b;--carte:#fff;--trait:#e2dcd2}
@media (prefers-color-scheme:dark){:root{--fond:#16141a;--encre:#f0ece6;--doux:#a39ca8;--vert:#43c47a;--rouge:#ff6b5e;--carte:#211e26;--trait:#35303b}}
body{margin:0;background:var(--fond);color:var(--encre);font:15px/1.45 system-ui,Segoe UI,sans-serif}main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
table{border-collapse:collapse;width:100%;background:var(--carte);font-size:13px}td,th{border-bottom:1px solid var(--trait);padding:6px 8px;text-align:left;vertical-align:top}
.v{font-weight:700}.ok{color:var(--vert)}.ko{color:var(--rouge)}.meta{color:var(--doux);font-size:13px}
.bande{display:flex;gap:4px;overflow-x:auto;padding-bottom:8px}.bande figure{margin:0;flex:0 0 150px;background:var(--carte);border:1px solid var(--trait)}
.bande img{width:150px;display:block}.bande figcaption{font-size:11px;color:var(--doux);padding:2px 4px}
.planche{width:100%;display:block;border:1px solid var(--trait)}
</style></head><body><main><h1>Film des attentes : têtes et objets</h1>
<p class="meta">${esc(new Date().toLocaleString('fr-FR'))} · ${esc(branch)} @ ${esc(commit)} · une image toutes les 0,5 s · ✓ = tête / objet 3D affiché · ▶ = bouton de validation actif · photo d'Adem masquée, visage fictif</p>
<p><strong>${nb}/${V.length}</strong> critères verts</p>
<table><tr><th>Critère</th><th>Verdict</th><th>Mesure</th></tr>${V.map((v) => `<tr><td>${esc(v.label)}</td><td class="v ${v.ok ? 'ok' : 'ko'}">${v.ok ? 'VERT' : 'ROUGE'}</td><td>${esc(v.detail)}</td></tr>`).join('')}</table>
<h2>Bandes</h2>
${bande('normal-tete', 'Réseau normal — tête (visage fictif)')}
${bande('normal-objet', 'Réseau normal — objet (chaise, photo masquée)')}
${bande('lent-tete', 'Réseau ralenti de 8 s — tête')}
${bande('lent-objet', 'Réseau ralenti de 8 s — objet')}
${bande('coupe-tete', 'API coupée — tête')}
${bande('coupe-objet', 'API coupée — objet')}
</main></body></html>`);
for (const v of V) log(`${v.ok ? 'VERT ' : 'ROUGE'} ${v.label} — ${v.detail}`);
log(`rapport : ${join(OUT, 'index.html')}`);
