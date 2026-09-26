// Banc de scan (lot LBENCH, plan/lots/LBENCH-boucle-scan.md) : `npm run scan-bench [-- options]`.
// Pour chaque photo réelle d'Adem (2 à la fois) : réduction à 768 px (code du jeu), VRAIES API /api/scan-object et
// /api/sticker (serveur Vite lancé ici, port 5300-5399, .env trouvé en remontant les dossiers), rendu 3D avec le
// vrai code du jeu (tools/scan-bench/banc.ts), règles (physique vs attendus.json, catégorie, liseré magenta),
// juge Gemini 3.1 Pro en vision, temps de chaque étape. Écrit reports/scan-bench/<horodatage>/index.html + resume.json.
//
// Options :
//   --seulement=tasse-verre,montre   ne passe que ces objets (rapport marqué partiel, journal inchangé)
//   --reprendre=dernier|<dossier>     réutilise les réponses API d'un passage précédent (on ne teste que le rendu)
//   --sans-juge                       pas d'appel au juge Gemini
//   --note="ce qui a changé"          ligne du journal des itérations
//
// Les photos et les réponses brutes restent HORS du dépôt : photos lues dans tools/scan-bench/photos/objets du
// dépôt principal (dossier ignoré par git), brut dans le dossier temporaire du système. La page n'en montre rien.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from 'vite';
import { ecrireRapport } from './rapport.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '../..');
const PARALLELE = 2; // machine chargée (alerte RAM de 16h40) : 2 appels d'API à la fois
const JUGE_MODELE = 'gemini-3.1-pro-preview'; // consigne du lot : Gemini 3.1 Pro en vision
const SEUIL_ROSE = 0.03; // part de pixels roses tolérée sur la bande de contour
const SEUIL_FOND = 0.05; // en dessous, le fond n'a pas été retiré (pas magenta)

// ---------------------------------------------------------------------------
// Arguments et chemins
// ---------------------------------------------------------------------------
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

/** Premier dossier `rel` trouvé en remontant depuis `depart` (les copies de travail des agents lisent le dépôt principal). */
function remonter(rel, depart = RACINE) {
  let d = depart;
  for (;;) {
    if (existsSync(join(d, rel))) return join(d, rel);
    const p = dirname(d);
    if (p === d) return null;
    d = p;
  }
}

function envDir() {
  let d = RACINE;
  while (!existsSync(join(d, '.env'))) { const p = dirname(d); if (p === d) return RACINE; d = p; }
  return d;
}

const DOSSIER_PHOTOS = remonter('tools/scan-bench/photos/objets');
const ATTENDUS = JSON.parse(readFileSync(remonter('tools/scan-bench/attendus.json'), 'utf8'));
const JOURNAL = join(ICI, 'journal.json');
const BRUT = join(tmpdir(), 'broskis-scan-bench');

const pad = (n) => String(n).padStart(2, '0');
const maintenant = new Date();
const HORODATAGE = `${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}_${pad(maintenant.getHours())}h${pad(maintenant.getMinutes())}`;
const SORTIE = join(RACINE, 'reports/scan-bench', HORODATAGE);

// ---------------------------------------------------------------------------
// Serveur Vite (le nôtre : on garde son PID et on n'arrête que lui)
// ---------------------------------------------------------------------------
function portLibre(port) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.once('listening', () => s.close(() => ok(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function lancerVite() {
  let port = 0;
  for (let i = 0; i < 40 && !port; i++) {
    const p = 5300 + Math.floor(Math.random() * 100);
    if (await portLibre(p)) port = p;
  }
  if (!port) throw new Error('aucun port libre entre 5300 et 5399');
  const bin = join(RACINE, 'node_modules/vite/bin/vite.js');
  const proc = spawn(process.execPath, [bin, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: RACINE, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let journalVite = '';
  proc.stdout.on('data', (d) => { journalVite += d; });
  proc.stderr.on('data', (d) => { journalVite += d; });
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    try {
      const r = await fetch(`${base}/tools/scan-bench/banc.html`);
      if (r.ok) return { proc, base, port };
    } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  arreterVite(proc);
  throw new Error(`Vite ne répond pas sur ${base}\n${journalVite.slice(-800)}`);
}

function arreterVite(proc) {
  if (!proc?.pid || proc.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGTERM');
  } catch { /* déjà arrêté */ }
}

// ---------------------------------------------------------------------------
// Appels API (les vrais, sur notre serveur)
// ---------------------------------------------------------------------------
async function appeler(base, route, corps, delaiMs = 60_000) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(delaiMs),
    });
    const json = await r.json().catch(() => null);
    return { ok: r.ok, statut: r.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, statut: 0, json: null, ms: Date.now() - t0, erreur: String(e?.message ?? e) };
  }
}

// ---------------------------------------------------------------------------
// Règles (le code arbitre) : physique vs attendus, catégorie, sticker, liseré
// ---------------------------------------------------------------------------
const dans = (v, [lo, hi]) => typeof v === 'number' && v >= lo && v <= hi;
const liste = (v) => (Array.isArray(v) ? v : [v]);

function regles(attendu, scan, mesures, stickerOk) {
  const r = [];
  const p = scan?.physics;
  if (!p) {
    // Toujours 7 vérifications : une physique absente compte comme 6 échecs (sinon la note serait flatteuse).
    const absentes = [['masse', 'Masse (kg)', attendu.masseKg.join(' à ')], ['taille', 'Plus grande dimension (m)', attendu.tailleMaxM.join(' à ')],
      ['matiere', 'Matière', attendu.matieres.join(', ')], ['forme', 'Forme', attendu.formes.join(', ')],
      ['fragile', 'Fragile', liste(attendu.fragile).join(' ou ')], ['liquide', 'Liquide', liste(attendu.liquide).join(' ou ')]];
    for (const [cle, libelle, att] of absentes) r.push({ cle, libelle, ok: false, trouve: 'absente', attendu: att, groupe: 'physique' });
  } else {
    const maxDim = Math.max(...p.sizeM);
    r.push({ cle: 'masse', libelle: 'Masse (kg)', ok: dans(p.massKg, attendu.masseKg), trouve: p.massKg, attendu: attendu.masseKg.join(' à '), groupe: 'physique' });
    r.push({ cle: 'taille', libelle: 'Plus grande dimension (m)', ok: dans(maxDim, attendu.tailleMaxM), trouve: +maxDim.toFixed(3), attendu: attendu.tailleMaxM.join(' à '), groupe: 'physique' });
    r.push({ cle: 'matiere', libelle: 'Matière', ok: attendu.matieres.includes(p.material), trouve: p.material, attendu: attendu.matieres.join(', '), groupe: 'physique' });
    r.push({ cle: 'forme', libelle: 'Forme', ok: attendu.formes.includes(p.shape), trouve: p.shape, attendu: attendu.formes.join(', '), groupe: 'physique' });
    r.push({ cle: 'fragile', libelle: 'Fragile', ok: liste(attendu.fragile).includes(p.fragile), trouve: p.fragile, attendu: liste(attendu.fragile).join(' ou '), groupe: 'physique' });
    r.push({ cle: 'liquide', libelle: 'Liquide', ok: liste(attendu.liquide).includes(p.liquid), trouve: p.liquid, attendu: liste(attendu.liquide).join(' ou '), groupe: 'physique' });
  }
  r.push({ cle: 'categorie', libelle: 'Catégorie', ok: !!scan && attendu.categories.includes(scan.category), trouve: scan?.category ?? '—', attendu: attendu.categories.join(', '), groupe: 'physique' });
  r.push({ cle: 'sticker', libelle: 'Sticker présent et détouré', ok: stickerOk && !mesures?.repli, trouve: stickerOk ? (mesures?.repli ? 'contour introuvable' : 'oui') : 'absent', attendu: 'oui', groupe: 'image' });
  const pourtour = mesures?.pourtourMagenta;
  r.push({ cle: 'pourtour', libelle: 'Accepté par le jeu (magenta au pourtour)', ok: stickerOk && typeof pourtour === 'number' && pourtour > 0.6, trouve: typeof pourtour === 'number' ? `${Math.round(100 * pourtour)} %` : '—', attendu: '> 60 %', groupe: 'image' });
  const rose = mesures?.roseBord ?? null;
  const fond = mesures?.fondRetire ?? null;
  r.push({
    cle: 'magenta', libelle: 'Fond magenta retiré, sans liseré rose',
    ok: stickerOk && fond !== null && fond >= SEUIL_FOND && rose <= SEUIL_ROSE,
    trouve: stickerOk ? `${(100 * (rose ?? 0)).toFixed(1)} % de rose au bord, ${(100 * (fond ?? 0)).toFixed(0)} % de fond retiré` : '—',
    attendu: `≤ ${SEUIL_ROSE * 100} % de rose, fond retiré`, groupe: 'image',
  });
  return r;
}

// ---------------------------------------------------------------------------
// Juge Gemini 3.1 Pro (vision)
// ---------------------------------------------------------------------------
// Grille v2 (retour d'Adem, 16h55 : « penser à l'esthétique et à la fidélité à la réalité ») : fidélité à la photo
// (comptée double) et volume 3D (un seul objet lisible sous tous les angles) s'ajoutent aux critères du départ.
const NOTES_JUGE = ['fidelite', 'reconnaissable', 'style', 'volume', 'detourage', 'jouable', 'note'];
const SCHEMA_JUGE = {
  type: 'OBJECT',
  properties: {
    objetVu: { type: 'STRING' },
    ...Object.fromEntries(NOTES_JUGE.map((k) => [k, { type: 'NUMBER' }])),
    injouable: { type: 'BOOLEAN' },
    justification: { type: 'STRING' },
    defauts: { type: 'ARRAY', items: { type: 'STRING' } },
    piste: { type: 'STRING' },
  },
  required: ['objetVu', ...NOTES_JUGE, 'injouable', 'justification', 'defauts', 'piste'],
  propertyOrdering: ['objetVu', ...NOTES_JUGE, 'injouable', 'justification', 'defauts', 'piste'],
};

function consigneJuge(attendu) {
  return `Tu es directeur artistique et game designer d'un jeu de combat 3D cartoon (Broskis). Les persos sont des KayKit : cartoon "chunky", formes simples et épaisses, aplats de couleurs franches, contours nets.
Le joueur photographie un objet réel ; le jeu le redessine en sticker cartoon (IA d'image), retire le fond magenta, puis en fait un objet 3D qu'il tient et lance sur l'adversaire.
Objet réellement photographié : « ${attendu.objet} ».
Images, dans l'ordre : 1) la photo d'origine (référence pour juger la fidélité, jamais montrée au joueur) ; 2) le sticker détouré sur damier sombre (damier = transparent) ; 3-5) l'objet 3D de face, de trois-quarts, de profil ; 6) l'objet à côté d'un perso KayKit (≈ 1,7 m), à la taille du jeu (taille réelle bornée pour rester lisible) ; 7) l'objet en vol, vu de l'épaule du lanceur, à la même taille.
Note chaque critère sur 10, sévèrement mais justement (7 = correct, 9 = vraiment bon) :
- fidelite : compare l'objet 3D à la photo 1, au détail près : forme et proportions, couleurs, matières, détails distinctifs (par exemple la coque et le piètement noir à roulettes d'une chaise de bureau, le cadran et le bracelet d'une montre, le cannage d'un tabouret, les billes d'un pendule). Un objet générique de la même famille vaut au plus 5.
- reconnaissable : un joueur qui ne voit QUE l'objet 3D reconnaît-il ${attendu.objet} ?
- style : colle-t-il aux persos KayKit (chunky, aplats, contour net) ? Pénalise photoréalisme, dégradés, détails fins illisibles, texte ou logos.
- volume : sous tous les angles (images 3 à 5), lit-on UN seul objet au volume crédible ? Pénalise l'effet brique, une tranche épaisse ou sombre, une double silhouette.
- detourage : contour propre, sans liseré rose ni reste de fond, sans main, doigt ou autre objet, trous de l'objet bien vides, objet entier et pas coupé.
- jouable : se lit-il d'un coup d'œil en main et en vol (image 7) ?
- note : ta note globale sur 10.
- injouable : true seulement si l'objet est inutilisable en démo (méconnaissable, invisible en vol, cassé, main dessinée…).
- objetVu : ce que tu vois dans l'objet 3D, en 2 à 5 mots, sans t'aider du nom donné plus haut.
- justification : 2 phrases maximum. defauts : 3 défauts concrets au plus. piste : UNE correction concrète (consigne de l'IA d'image, ou volume 3D).
Réponds en français, en JSON conforme au schéma.`;
}

function partieImage(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

async function juger(cle, attendu, photoBase64, images) {
  const t0 = Date.now();
  const parts = [{ text: consigneJuge(attendu) }, { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } }];
  for (const nom of ['detoure', 'face', 'troisQuarts', 'profil', 'perso', 'vol']) {
    const p = images[nom] ? partieImage(images[nom]) : null;
    if (p) parts.push(p);
    else parts.push({ text: `(image « ${nom} » absente)` });
  }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${JUGE_MODELE}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_JUGE, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) return { erreur: `HTTP ${r.status} : ${(await r.text().catch(() => '')).slice(0, 200)}`, ms: Date.now() - t0 };
    const env = await r.json();
    const texte = env?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
    const v = JSON.parse(texte.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
    for (const k of NOTES_JUGE) v[k] = Math.max(0, Math.min(10, Number(v[k]) || 0));
    return { ...v, ms: Date.now() - t0 };
  } catch (e) {
    return { erreur: String(e?.message ?? e), ms: Date.now() - t0 };
  }
}

// ---------------------------------------------------------------------------
// Note d'un objet : moyenne pondérée de 7 critères (6 du juge, fidélité comptée double, + physique du code),
// plafonds si le code constate un échec. Esthétique = moyenne de style, volume et détourage.
// ---------------------------------------------------------------------------
const POIDS = { fidelite: 2, reconnaissable: 1, style: 1, volume: 1, detourage: 1, jouable: 1, physique: 1 };

function noter(juge, reglesObj) {
  const phys = reglesObj.filter((r) => r.groupe === 'physique');
  const physique = +(10 * phys.filter((r) => r.ok).length / phys.length).toFixed(1);
  // Un sticker que le client du jeu rejette (pas de magenta au pourtour) équivaut à pas de sticker.
  const sticker = reglesObj.find((r) => r.cle === 'sticker')?.ok && reglesObj.find((r) => r.cle === 'pourtour')?.ok;
  const magenta = reglesObj.find((r) => r.cle === 'magenta')?.ok;
  if (!juge || juge.erreur) {
    return { note: null, physique, injouable: !sticker, criteres: null };
  }
  const criteres = {
    fidelite: juge.fidelite,
    reconnaissable: juge.reconnaissable,
    style: juge.style,
    volume: juge.volume,
    detourage: magenta ? juge.detourage : Math.min(juge.detourage, 5),
    jouable: juge.jouable,
    physique,
  };
  const poidsTotal = Object.values(POIDS).reduce((a, b) => a + b, 0);
  let note = Object.entries(criteres).reduce((s, [k, v]) => s + POIDS[k] * v, 0) / poidsTotal;
  if (!sticker) note = Math.min(note, 3);
  const injouable = !sticker || juge.injouable === true || juge.jouable < 5;
  const esthetique = +((criteres.style + criteres.volume + criteres.detourage) / 3).toFixed(2);
  return { note: +note.toFixed(2), physique, injouable, criteres, esthetique, fidelite: criteres.fidelite };
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
function dossierBrut() {
  if (!args.reprendre) return null;
  if (args.reprendre !== 'dernier') return join(BRUT, String(args.reprendre));
  const dossiers = existsSync(BRUT) ? readdirSync(BRUT).sort() : [];
  return dossiers.length ? join(BRUT, dossiers[dossiers.length - 1]) : null;
}

async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

async function main() {
  if (!DOSSIER_PHOTOS) throw new Error('photos introuvables : tools/scan-bench/photos/objets (dépôt principal)');
  const ids = Object.keys(ATTENDUS).filter((k) => !k.startsWith('_'))
    .filter((id) => existsSync(join(DOSSIER_PHOTOS, `${id}.jpg`)))
    .filter((id) => !args.seulement || String(args.seulement).split(',').includes(id));
  if (!ids.length) throw new Error('aucune photo à tester');
  const reprise = dossierBrut();
  if (args.reprendre && !reprise) throw new Error('rien à reprendre');
  const brut = reprise ?? join(BRUT, HORODATAGE);
  mkdirSync(brut, { recursive: true });
  const cleJuge = args['sans-juge'] ? null : loadEnv('development', envDir(), '').GEMINI_API_KEY || null;
  console.log(`Banc de scan : ${ids.length} objets, ${PARALLELE} à la fois${reprise ? ` (reprise de ${reprise})` : ''}${cleJuge ? '' : ', sans juge'}.`);

  const { proc, base } = await lancerVite();
  let navigateur = null;
  try {
    navigateur = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
    const page = await navigateur.newPage();
    const erreursPage = [];
    page.on('pageerror', (e) => erreursPage.push(String(e.message)));
    await page.goto(`${base}/tools/scan-bench/banc.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.banc, null, { timeout: 60_000 });
    await page.evaluate(() => window.banc.pret());

    /** page.evaluate qui survit à un rechargement de Vite (dépendances optimisées au premier passage). */
    const evaluer = async (fn, arg) => {
      for (let essai = 0; ; essai++) {
        try {
          return await page.evaluate(fn, arg);
        } catch (e) {
          if (essai >= 2 || !/context was destroyed|navigation|banc/i.test(String(e?.message))) throw e;
          await page.waitForFunction(() => !!window.banc, null, { timeout: 60_000 });
        }
      }
    };
    let verrou = Promise.resolve();
    const exclusif = (fn) => { const p = verrou.then(fn, fn); verrou = p.catch(() => {}); return p; };

    const resultats = await pool(ids, PARALLELE, async (id) => {
      const attendu = ATTENDUS[id];
      const temps = {};
      const fichierBrut = join(brut, `${id}.json`);
      let donnees;
      if (reprise && existsSync(fichierBrut)) {
        donnees = JSON.parse(readFileSync(fichierBrut, 'utf8'));
      } else {
        const photo = `data:image/jpeg;base64,${readFileSync(join(DOSSIER_PHOTOS, `${id}.jpg`)).toString('base64')}`;
        const petit = await evaluer((d) => window.banc.redimensionner(d), photo);
        temps.redim = petit.ms;
        const corps = { imageBase64: petit.base64, mimeType: petit.mimeType };
        const [scan, sticker] = await Promise.all([appeler(base, 'scan-object', corps, 30_000), appeler(base, 'sticker', corps, 60_000)]);
        donnees = { photo: petit.base64, scan, sticker };
        writeFileSync(fichierBrut, JSON.stringify(donnees));
      }
      const { scan, sticker } = donnees;
      temps.scan = scan.ms;
      temps.sticker = sticker.ms;
      const s = scan.ok ? scan.json : null;
      const dataUrl = sticker.ok ? sticker.json?.dataUrl ?? null : null;
      const t3d = Date.now();
      // L'arme telle que le jeu la construit après le scan (src/ia/scan.ts), sticker compris.
      const arme = {
        object: s?.object ?? attendu.objet, name: s?.weaponName ?? '?', category: s?.category ?? 'throwable', why: s?.why ?? '',
        stats: s?.stats ?? { a: 4, b: 3, c: 3 }, trait: s?.trait ?? 'heavy', palette: s?.palette ?? ['#c9a36a', '#8a6b3d'],
        lines: s?.lines ?? { intro: '', hit: '', miss: '', parried: '' },
        ...(s?.physics ? { physics: s.physics } : {}), ...(dataUrl ? { stickerUrl: dataUrl } : {}),
      };
      const rendu = await exclusif(() => evaluer((e) => window.banc.rendre(e), arme));
      temps.rendu3d = Date.now() - t3d;
      temps.extrusion = rendu.mesures.msSticker ?? null;
      const reglages = s?.physics ? await evaluer((e) => window.banc.reglages(e.p, e.c), { p: s.physics, c: s.category }) : null;
      const r = regles(attendu, s, rendu.mesures, !!dataUrl);
      const juge = cleJuge ? await juger(cleJuge, attendu, donnees.photo, rendu.images) : null;
      if (juge) temps.juge = juge.ms;
      const n = noter(juge, r);
      console.log(`  ${id.padEnd(18)} ${n.note ?? '—'}/10${n.injouable ? '  INJOUABLE' : ''}  (juge ${juge?.erreur ? 'échec' : juge?.note ?? '—'}, physique ${n.physique}/10, sticker ${(sticker.ms / 1000).toFixed(1)} s)`);
      return {
        id, attendu, scan: s, erreurScan: scan.ok ? null : `${scan.statut} ${scan.erreur ?? JSON.stringify(scan.json)?.slice(0, 160)}`,
        stickerRaison: sticker.json?.reason ?? (sticker.ok ? null : `HTTP ${sticker.statut}`),
        stickerModele: sticker.json?.model ?? null, stickerRelais: sticker.json?.relais ?? null,
        images: rendu.images, mesures: rendu.mesures, regles: r, reglages, juge, temps, ...n,
      };
    });

    // --- Résumé, journal, rapport ---
    const notes = resultats.map((o) => o.note).filter((x) => typeof x === 'number');
    const moyenne = notes.length ? +(notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2) : null;
    const moy = (k) => { const v = resultats.map((o) => o[k]).filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
    const fidelite = moy('fidelite');
    const esthetique = moy('esthetique');
    const injouables = resultats.filter((o) => o.injouable).map((o) => o.id);
    const partiel = !!args.seulement;
    const journal = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : { iterations: [] };
    const iteration = {
      n: journal.iterations.length + 1,
      horodatage: HORODATAGE,
      changement: typeof args.note === 'string' ? args.note : '',
      moyenne, fidelite, esthetique, grille: 2, injouables: injouables.length,
      notes: Object.fromEntries(resultats.map((o) => [o.id, o.note])),
      reprise: !!reprise,
    };
    if (!partiel) {
      journal.iterations.push(iteration);
      writeFileSync(JOURNAL, `${JSON.stringify(journal, null, 2)}\n`);
    }
    const resume = {
      horodatage: HORODATAGE, iteration: partiel ? null : iteration.n, partiel, reprise: !!reprise,
      juge: cleJuge ? JUGE_MODELE : null, moyenne, fidelite, esthetique, grille: 2, injouables,
      objets: resultats.map(({ images, ...o }) => o),
      erreursPage,
    };
    mkdirSync(SORTIE, { recursive: true });
    writeFileSync(join(SORTIE, 'resume.json'), `${JSON.stringify(resume, null, 2)}\n`);
    ecrireRapport(join(SORTIE, 'index.html'), resume, resultats, journal);
    console.log(`\nNote moyenne : ${moyenne ?? '—'}/10 · injouables : ${injouables.length ? injouables.join(', ') : 'aucun'}`);
    console.log(`Rapport : ${join(SORTIE, 'index.html')}`);
    if (erreursPage.length) console.log(`Erreurs dans la page : ${erreursPage.slice(0, 3).join(' | ')}`);
  } finally {
    if (navigateur) await navigateur.close().catch(() => {});
    arreterVite(proc);
  }
}

main().catch((e) => {
  console.error(`Banc de scan : échec (${e?.message ?? e})`);
  process.exitCode = 1;
});
