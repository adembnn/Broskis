// Lot LE2E : de la photo à l'objet jouable, DANS le vrai jeu, de bout en bout (plan/lots/LE2E-photo-jouable.md).
//   npm run e2e:photo -- [--port 5372] [--visages <dossier>] [--map 1] [--headed] [--un-match]
// Joue le parcours avec de VRAIS clics, dépôts de fichier et touches : titre → persos (2 visages FICTIFS) → arsenal
// (photos réelles d'Adem, lues à leur chemin absolu, jamais copiées) → présentation → arène → combat en écran scindé.
// En combat, chaque arme est lancée 2 fois : un coup au but à 7 m (dégâts, recul, vitesse, recharge), puis un tir long
// sur une cible rendue intouchable (portée réelle, rebonds, éclats, giclée). Mesures = événements du bus.
// Rapport : reports/e2e/<horodatage>/index.html + mesures.json. Les photos d'origine sont MASQUÉES sur les captures.
// Vraies API : lance son propre Vite (port 5300-5399) et n'arrête que ce processus-là.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PHOTOS = opt('--photos', 'C:\\Users\\Adem\\Documents\\Hackathon Voodoo\\Voodoo-Hack\\tools\\scan-bench\\photos\\objets');
const VISAGES = opt('--visages', null);
const MAP_INDEX = Number(opt('--map', '1')) - 1;
const HEADED = args.includes('--headed');
const UN_MATCH = args.includes('--un-match');
let PORT = Number(opt('--port', '5372'));

const ATTENDUS = JSON.parse(readFileSync('tools/scan-bench/attendus.json', 'utf8'));
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const OUT = join('reports', 'e2e', stamp);
mkdirSync(OUT, { recursive: true });

// Les 4 objets comparés (lancés tous les deux en « throwable » : même règle, seule la physique change) + le reste.
const COMPARES = ['chaise-bureau', 'canette', 'feutre-velleda', 'tabouret-rotin'];
// Match 1 : P1 = chaise, feutre, tasse · P2 = canette, tabouret, téléphone. Match 2 : les 5 autres + canard (rebond).
const MATCHES = [
  [['chaise-bureau', 'feutre-velleda', 'tasse-verre'], ['canette', 'tabouret-rotin', 'telephone']],
  [['mocassin', 'pendule-newton', 'lampe-champignon'], ['roi-echecs', 'montre', 'preset:rubber duck']],
];
const FIRE = ['KeyF', 'KeyL'];
const WEAPON_KEYS = [['Digit1', 'Digit2', 'Digit3'], ['Digit8', 'Digit9', 'Digit0']];
// Seuls les endroits où la VRAIE photo apparaît (carte, forge, capture) : les stickers et portraits restent visibles.
const MASK = ['.wc-photo-wrap', '.lload-forge-photo', '.capture-zone', 'video'];

const log = (...a) => console.log(`[e2e ${new Date().toTimeString().slice(0, 8)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const shots = []; // captures du rapport
const rows = new Map(); // clé objet → mesures
const persosInfo = { s: null, issues: [] }; // durée du scan des 2 persos, messages d'échec affichés (LFACE)

// ---------------------------------------------------------------------------------------------------------------
// Canette : Adem n'a pas de photo de canette → une canette dessinée (SVG) photographiée par le navigateur.
const CANETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
<defs>
<linearGradient id="mur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8e2d6"/><stop offset="1" stop-color="#d3cbbb"/></linearGradient>
<linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98b5e"/><stop offset="1" stop-color="#8a6240"/></linearGradient>
<linearGradient id="corps" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e0a0a"/><stop offset="0.16" stop-color="#c81c1c"/><stop offset="0.3" stop-color="#ff7a7a"/><stop offset="0.42" stop-color="#d92626"/><stop offset="0.8" stop-color="#9c1414"/><stop offset="1" stop-color="#520606"/></linearGradient>
<linearGradient id="alu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d8288"/><stop offset="0.3" stop-color="#f1f4f7"/><stop offset="0.62" stop-color="#b9bec4"/><stop offset="1" stop-color="#666b71"/></linearGradient>
<radialGradient id="ombre"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<rect width="768" height="480" fill="url(#mur)"/><rect y="470" width="768" height="298" fill="url(#table)"/>
<ellipse cx="400" cy="600" rx="170" ry="34" fill="url(#ombre)"/>
<path d="M284 214 L284 560 Q384 602 484 560 L484 214 Z" fill="url(#corps)"/>
<path d="M284 330 C340 300 420 380 484 330 L484 372 C420 420 340 342 284 372 Z" fill="#fff" opacity="0.92"/>
<text x="384" y="300" font-family="Arial Black, Arial" font-weight="900" font-size="58" fill="#fff" text-anchor="middle" letter-spacing="4">COLA</text>
<text x="384" y="470" font-family="Arial" font-weight="700" font-size="26" fill="#ffd9d9" text-anchor="middle">330 ml</text>
<path d="M284 560 Q384 602 484 560 L476 580 Q384 618 292 580 Z" fill="url(#alu)"/>
<path d="M292 190 L284 214 Q384 250 484 214 L476 190 Z" fill="url(#alu)"/>
<ellipse cx="384" cy="190" rx="92" ry="24" fill="#c9cdd2" stroke="#8d9298" stroke-width="5"/>
<ellipse cx="384" cy="192" rx="76" ry="17" fill="#aeb3b9"/>
<rect x="352" y="178" width="58" height="22" rx="10" fill="#d9dde1" stroke="#80858b" stroke-width="3"/>
<ellipse cx="392" cy="189" rx="10" ry="5" fill="#80858b"/>
<rect x="300" y="222" width="18" height="330" fill="#fff" opacity="0.18"/>
</svg>`;

async function photoCanette(browser) {
  // Déjà « photographiée » une fois (tools/e2e/canette-dessinee.jpg, notre dessin) : pas de capture au démarrage.
  if (existsSync('tools/e2e/canette-dessinee.jpg')) return 'tools/e2e/canette-dessinee.jpg';
  const f = join(OUT, 'canette-dessinee.jpg');
  const p = await browser.newPage({ viewport: { width: 768, height: 768 } });
  await p.setContent(`<html><body style="margin:0">${CANETTE_SVG}</body></html>`);
  await p.screenshot({ path: f, type: 'jpeg', quality: 90 });
  await p.close();
  return f;
}

function photoOf(key, canette) {
  if (key === 'canette') return canette;
  return join(PHOTOS, `${key}.jpg`);
}

// ---------------------------------------------------------------------------------------------------------------
// Serveur Vite (vraies API) : le nôtre, sur un port libre, arrêté à la fin (et lui seul).
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
let server = null;
async function startServer() {
  for (let tries = 0; tries < 20 && (await up(`http://localhost:${PORT}/`)); tries++) PORT += 1;
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/e2e/vite.e2e.config.mjs', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const base = `http://localhost:${PORT}`;
  for (let i = 0; i < 120 && !(await up(base)); i++) await sleep(500);
  log(`Vite lancé (PID ${server.pid}) sur ${base}`);
  return base;
}
function stopServer() {
  if (!server?.pid) return;
  try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { try { server.kill(); } catch { /* déjà arrêté */ } }
  log(`Vite arrêté (PID ${server.pid})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Enregistreur posé AVANT le jeu : événements utiles du bus, allégés (jamais les images en data URL).
const RECORDER = () => {
  const KEEP = new Set(['phase:change', 'match:start', 'scan:start', 'scan:result', 'scan:progress', 'fire', 'projectile:spawn',
    'projectile:end', 'projectile:bounce', 'ground:slippery', 'hit', 'weapon:ready', 'weapon:pick', 'shield:placed',
    'match:banner', 'stock:lost', 'respawn', 'parry:result', 'ko', 'match:end']);
  const slim = (v, d = 0) => {
    if (v == null || typeof v !== 'object') return typeof v === 'string' && v.length > 200 ? `${v.length}c` : v;
    if (Array.isArray(v)) return v.slice(0, 16).map((x) => slim(x, d + 1));
    if (d > 4) return '[obj]';
    const o = {};
    for (const k of Object.keys(v)) o[k] = /Url$/.test(k) ? (v[k] ? `${String(v[k]).length}c` : null) : slim(v[k], d + 1);
    return o;
  };
  const E = (window.__e2e = { ev: [], hooked: false, glLost: [] });
  const hook = () => {
    const ctx = window.ctx;
    if (!ctx?.bus) return false;
    // Contexte WebGL perdu (processus GPU tombé, machine saturée) : la scène 3D devient blanche, à signaler.
    ctx.three?.canvas?.addEventListener('webglcontextlost', () => E.glLost.push(Math.round(performance.now())));
    ctx.bus.onAny((name, p) => {
      if (!KEEP.has(name)) return;
      const rec = { t: performance.now(), name, p: slim(p) };
      if (name === 'fire') { const ps = ctx.state.players[p.player]; rec.cooldown = ps.cooldowns[ps.selected]; rec.selected = ps.selected; }
      if (name === 'scan:progress' && p.step === 'sticker') rec.sticker = true;
      E.ev.push(rec);
    });
    E.hooked = true;
    return true;
  };
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 30);
};

const evCount = (page) => page.evaluate(() => window.__e2e.ev.length);
const evSince = (page, n) => page.evaluate((k) => window.__e2e.ev.slice(k), n);
async function waitEv(page, n, pred, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const list = await evSince(page, n);
    const hit = list.find(pred);
    if (hit) return hit;
    await sleep(60);
  }
  return null;
}

async function shot(page, name, legend, opts = {}) {
  const file = `${name}.jpg`;
  const mask = opts.noMask ? [] : MASK.map((s) => page.locator(s));
  for (let essai = 0; essai < 2; essai++) {
    try {
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 62, mask, maskColor: '#2a2530', clip: opts.clip });
      shots.push({ file, legend, group: opts.group });
      return;
    } catch (e) {
      if (essai) errors.push(`capture ${name} : ${e.message.split('\n')[0]}`);
      else await sleep(400);
    }
  }
}

/** Étape nommée du parcours : journal, et capture + message si elle casse (le parcours s'arrête là). */
async function step(page, name, fn) {
  log(name);
  try { return await fn(); } catch (e) {
    await shot(page, `echec-${name.replace(/\W+/g, '-')}`, `Échec : ${name}`, { group: 'échecs' });
    throw new Error(`${name} : ${e.message.split('\n')[0]}`);
  }
}

function row(key) {
  if (!rows.has(key)) rows.set(key, { key });
  return rows.get(key);
}

// ---------------------------------------------------------------------------------------------------------------
// Parcours UI
async function importPhoto(page, scope, file, viaDrop) {
  await page.locator(`${scope} .capture`).first().waitFor({ timeout: 15000 });
  if (viaDrop) {
    // Glisser-déposer : un vrai événement drop avec le fichier dans la zone de capture.
    const b64 = readFileSync(file).toString('base64');
    const dt = await page.evaluateHandle(({ b64, name }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bin], name, { type: 'image/jpeg' }));
      return d;
    }, { b64, name: file.split(/[\\/]/).pop() });
    const zone = page.locator(`${scope} .capture-zone`).first();
    await zone.dispatchEvent('dragenter', { dataTransfer: dt });
    await zone.dispatchEvent('dragover', { dataTransfer: dt });
    await zone.dispatchEvent('drop', { dataTransfer: dt });
  } else {
    // Import : vrai clic sur « Import a photo » → sélecteur de fichiers → fichier choisi.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.locator(`${scope} button:has-text("Import a photo")`).first().click(),
    ]);
    await chooser.setFiles(file);
  }
}

async function pickFighters(page, withPhotos) {
  await page.locator('.fighter-grid').waitFor({ timeout: 30000 });
  const t0 = Date.now();
  const confirm = page.locator('.fighters-card button:has-text("Confirm")').first();
  for (const p of [0, 1]) {
    const face = withPhotos && VISAGES ? join(VISAGES, `visage-fictif-${p + 1}.jpg`) : null;
    if (face && existsSync(face)) {
      await page.locator('.fighter-grid .snap-tile').first().click();
      await importPhoto(page, '.fighters-card', face, p === 1);
      // Forge dans l'encart du joueur (LFACE) : l'autre joueur enchaîne tout de suite. Ancienne version : Confirm.
      const t1 = Date.now();
      while (Date.now() - t1 < 90000) {
        if (await confirm.isVisible().catch(() => false)) { await confirm.click(); break; }
        const started = await page.evaluate((k) => { const b = document.querySelector(`.fighter-panel.p${k + 1}`); return !!b && !b.querySelector('.fighter-panel-empty'); }, p);
        if (started && !(await page.locator('.fighter-side .capture').count())) break;
        await sleep(250);
      }
    } else {
      await page.locator('.fighter-grid .fighter-tile:not(.snap-tile)').nth(p).click();
    }
  }
  // Portraits dessinés : le bouton « Ready to fight! » s'active.
  const ready = page.locator('.ready-bar');
  while (Date.now() - t0 < 120000 && (await ready.isDisabled())) {
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await sleep(300);
  }
  if (withPhotos) {
    const issues = await page.evaluate(() => [...document.querySelectorAll('.fighter-panel .fighter-issue')].map((e) => e.textContent.trim()));
    persosInfo.s = Math.round((Date.now() - t0) / 1000);
    persosInfo.issues = issues;
    log(`  persos photo prêts en ${persosInfo.s} s${issues.length ? ` · message : ${issues.join(' / ')}` : ''}`);
  }
  await sleep(1200); // vitrine 3D des 2 persos
  await shot(page, `persos-${withPhotos ? 'photos' : 'presets'}`, withPhotos ? `Persos tirés de 2 visages FICTIFS (${Math.round((Date.now() - t0) / 1000)} s)` : 'Persos préréglés', { group: 'persos', noMask: true });
  await ready.click({ force: true }); // bouton animé (pulsation) : jamais « stable » pour Playwright
}

async function scanInArsenal(page, player, slot, key, canette) {
  const scope = `.arsenal-card.p${player + 1}`;
  const r = row(key);
  r.player = player; r.slot = slot;
  if (key.startsWith('preset:')) {
    const name = key.slice(7);
    const tiles = page.locator(`${scope} .rack-tile:not(.snap-tile)`);
    // Le canard (rebond) : tuile du râtelier dont le nom d'objet contient le mot.
    const idx = await page.evaluate(async (name) => {
      const m = await import('/src/ui/presets.ts');
      return m.weaponPresets().findIndex((w) => w.object.toLowerCase().includes(name));
    }, name);
    if (idx < 0) { errors.push(`preset introuvable : ${name}`); await tiles.first().click(); return; }
    await tiles.nth(idx).click();
    r.preset = true;
    return;
  }
  const file = photoOf(key, canette);
  if (!existsSync(file)) { errors.push(`photo absente : ${file}`); return; }
  const n0 = await evCount(page);
  const t0 = Date.now();
  await page.locator(`${scope} .weapon-rack .snap-tile`).click();
  await importPhoto(page, scope, file, player === 1);
  await page.locator(`${scope} .weapon-confirm`).waitFor({ timeout: 30000 });
  r.cardS = (Date.now() - t0) / 1000;
  let card = await readCard(page, scope);
  log(`  P${player + 1} emplacement ${slot + 1} : ${key} → « ${card.name} » (${card.category}) en ${r.cardS} s${card.physicsText ? ` · ${card.physicsText}` : ''}`);
  // Comparaison : les 4 objets en « throwable » (vrai clic sur la pastille de catégorie).
  if (COMPARES.includes(key) && card.category !== 'throwable') {
    r.categoryScan = card.category;
    await page.locator(`${scope} .cat-pill:has-text("throwable")`).first().click();
    await page.waitForFunction((s) => {
      const c = document.querySelector(`${s} .weapon-confirm .wc-category`);
      return c && c.textContent.trim().toLowerCase().includes('throwable');
    }, scope, { timeout: 30000 }).catch(() => errors.push(`${key} : relance en throwable sans effet`));
    card = await readCard(page, scope);
  }
  // L'arme affichée : dernier scan:result dont le nom correspond à la carte.
  const list = await evSince(page, n0);
  const res = [...list].reverse().find((e) => e.name === 'scan:result' && e.p.weapon?.name === card.name) ?? [...list].reverse().find((e) => e.name === 'scan:result');
  r.weapon = res?.p.weapon ?? null;
  r.card = card;
  r.stickerAtConfirm = !!(r.weapon && list.some((e) => e.sticker && e.p.weaponId === r.weapon.id));
  await shot(page, `carte-${key}`, `Carte d'arme : ${key} (photo masquée)`, { group: 'cartes', clip: await clipOf(page, `${scope} .weapon-confirm`) });
  r.confirmAt = Date.now();
  await page.locator(`${scope} .weapon-confirm button:has-text("Confirm")`).click();
}

async function clipOf(page, sel) {
  const b = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!b) return undefined;
  return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, 1280 - b.x), height: Math.min(b.height, 720 - b.y) };
}

async function readCard(page, scope) {
  return page.evaluate((s) => {
    const q = (x) => document.querySelector(`${s} .weapon-confirm ${x}`);
    const card = q('.weapon-card');
    return {
      name: q('.wc-band-name')?.textContent?.trim() ?? null,
      category: q('.wc-category')?.textContent?.trim().toLowerCase() ?? null,
      object: q('.weapon-object')?.textContent?.trim() ?? null,
      pips: document.querySelectorAll(`${s} .weapon-confirm .pip.filled`).length,
      physicsText: q('.wc-physics')?.textContent?.trim() ?? null,
      text: card?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null,
    };
  }, scope);
}

async function runArsenal(page, match, canette) {
  for (const player of [0, 1]) {
    const scope = `.arsenal-card.p${player + 1}`;
    await page.locator(scope).waitFor({ timeout: 30000 });
    for (let slot = 0; slot < 3; slot++) {
      const key = match[player][slot];
      try { await scanInArsenal(page, player, slot, key, canette); } catch (e) { errors.push(`arsenal ${key} : ${e.message.split('\n')[0]}`); }
    }
    await shot(page, `arsenal-p${player + 1}-${match[player][0]}`, `Arsenal P${player + 1} rempli`, { group: 'cartes' });
    await page.locator(`${scope} .screen-foot button.cta`).click({ timeout: 10000, force: true });
  }
}

async function toFight(page) {
  const skip = page.locator('button:has-text("Skip presentation")');
  await skip.waitFor({ timeout: 15000 }).then(() => skip.click()).catch(() => {});
  await page.locator('.map-tile').first().waitFor({ timeout: 30000 });
  await page.locator('.map-tile').nth(MAP_INDEX).click();
  await page.waitForFunction(() => window.gameState?.phase === 'fight', null, { timeout: 90000 });
  await sleep(800);
}

// ---------------------------------------------------------------------------------------------------------------
// Mesures en combat
const PAGE_TOOLS = async () => {
  const { teleport } = await import('/src/gameplay/character.ts');
  const { getRuntime } = await import('/src/gameplay/runtime.ts');
  const { LAUNCH_K2 } = await import('/src/gameplay/tuning.ts');
  const { WEAPON_FX } = await import('/src/scene/weapons/tokens.ts');
  const ctx = window.ctx;
  const bbox = (obj) => {
    obj.updateMatrixWorld(true);
    let box = null;
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      box = box ? box.union(b) : b;
    });
    if (!box) return null;
    const s = box.getSize(obj.position.clone());
    return [s.x, s.y, s.z].map((v) => Math.round(v * 100) / 100);
  };
  window.__e2eTools = {
    place(p, pos) {
      const rt = getRuntime().players[p];
      rt.launch = null; rt.ledge = null; rt.teetering = false; rt.vy = 0; rt.vel = [0, 0, 0]; rt.hvel = [0, 0];
      teleport(ctx, p, pos);
      rt.prevPos = [...pos];
    },
    reset(p) { window.__lsmash.setPct(p, 0); ctx.state.players[p].cooldowns = ctx.state.players[p].cooldowns.map(() => 0); },
    untouchable(p, s) { getRuntime().players[p].invulnUntil = s > 0 ? ctx.loop.time + s : 0; },
    held(p) {
      const ps = ctx.state.players[p];
      const w = ps.weapons[ps.selected];
      const main = ctx.three.scene.getObjectByName('latk-main');
      const m = main?.getObjectByName(`arme-${w.id}`);
      return { id: w.id, name: w.name, category: w.category, size: m && m.visible ? bbox(m) : null, sticker: !!w.stickerUrl, physics: w.physics ?? null };
    },
    flying() {
      const vol = ctx.three.scene.getObjectByName('latk-vol');
      const out = [];
      vol?.traverse((o) => { if (/^arme-/.test(o.name) && o.visible) out.push(bbox(o)); });
      return out.filter(Boolean);
    },
    alive: () => getRuntime().matchSeq,
    /** Murs-boucliers encore debout (ils arrêteraient les tirs suivants). */
    walls: () => getRuntime().shieldBodies.length,
    /** Recul « à 0 % » : l'éjection grandit avec le % APRÈS le coup (et donc avec un critique) ; on retire ce facteur. */
    k2: LAUNCH_K2,
    /** Bornes de la taille affichée (lot LATK1) : la vraie taille, ramenée entre ces 2 valeurs pour rester lisible. */
    tailles: [WEAPON_FX.physique.tailleMin, WEAPON_FX.physique.tailleMax],
  };
  return true;
};

const maxDim = (s) => (s ? Math.max(...s) : null);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

async function measureMatch(page, match, idx) {
  // Sonde du rendu : fonction de rendu en place (pause LLOAD restée ?), contexte WebGL perdu ?
  const sonde = await page.evaluate(() => ({
    render: String(window.ctx.three.render).replace(/\s+/g, ' ').slice(0, 50),
    perdu: window.ctx.three.renderer.getContext().isContextLost(),
    vues: window.ctx.three.views().length,
    transition: window.__lloadTransition ?? null,
  }));
  log(`  sonde du rendu : ${JSON.stringify(sonde)}`);
  if (sonde.perdu || /^\(\) => \{ ?\}$/.test(sonde.render)) errors.push(`match ${idx} : rendu 3D arrêté (${sonde.perdu ? 'contexte WebGL perdu' : 'fonction de rendu restée en pause'})`);
  await page.evaluate(PAGE_TOOLS);
  const st = await page.evaluate(() => window.gameState);
  const split = st.split;
  const fighters = st.players.map((p) => ({ name: p.fighter?.name, model: p.fighter?.model, face: !!p.fighter?.look?.faceUrl }));
  const s0 = st.players[0].pos, s1 = st.players[1].pos;
  const ax = [s1[0] - s0[0], 0, s1[2] - s0[2]];
  const L = Math.hypot(ax[0], ax[2]) || 1;
  const u = [ax[0] / L, 0, ax[2] / L];
  const c = [(s0[0] + s1[0]) / 2, Math.max(s0[1], s1[1]), (s0[2] + s1[2]) / 2];
  const at = (k) => [c[0] + u[0] * k, c[1] + 0.05, c[2] + u[2] * k];
  await shot(page, `match${idx}-depart`, `Match ${idx} : écran scindé, P1 à gauche, P2 à droite`, { group: 'match' });

  for (const shooter of [0, 1]) {
    const target = 1 - shooter;
    const sign = shooter === 0 ? 1 : -1;
    for (let slot = 0; slot < 3; slot++) {
      const key = match[shooter][slot];
      const r = row(key);
      try {
        // 1) Coup au but à 7 m, % remis à 0, aucun mur-bouclier encore debout (il arrêterait le tir).
        for (let i = 0; i < 40 && (await page.evaluate(() => window.__e2eTools.walls())) > 0; i++) await sleep(200);
        await page.evaluate(({ a, b, s, t }) => { const T = window.__e2eTools; T.place(s, a); T.place(t, b); T.reset(0); T.reset(1); T.untouchable(t, 0); }, { a: at(-3.5 * sign), b: at(3.5 * sign), s: shooter, t: target });
        await page.keyboard.press(WEAPON_KEYS[shooter][slot]);
        await sleep(450);
        const held = await page.evaluate((p) => window.__e2eTools.held(p), shooter);
        r.held = held.size; r.stickerInMatch = held.sticker; r.physicsInMatch = !!held.physics;
        if (r.preset) r.weapon = { name: held.name, category: held.category, physics: held.physics };
        const half = { x: shooter === 0 ? 0 : 640, y: 0, width: 640, height: 720 };
        await shot(page, `main-${key}`, `${key} : en main (P${shooter + 1})`, { group: key, clip: half });
        const n0 = await evCount(page);
        await page.evaluate(() => window.ctx.bus.emit('slowmo', { factor: 0.25, ms: 3500 }));
        await page.keyboard.down(FIRE[shooter]);
        await sleep(60);
        await page.keyboard.up(FIRE[shooter]);
        const sp = await waitEv(page, n0, (e) => e.name === 'projectile:spawn' || e.name === 'shield:placed', 3000);
        const fire = (await evSince(page, n0)).find((e) => e.name === 'fire');
        r.cooldown = r2(fire?.cooldown);
        r.category = fire?.p.weapon?.category ?? r.weapon?.category;
        if (!sp) { errors.push(`${key} : aucun tir (ni projectile ni bouclier)`); continue; }
        if (sp.name === 'shield:placed') {
          r.shield = true;
          await sleep(300);
          await shot(page, `vol-${key}`, `${key} : mur-bouclier posé`, { group: key });
        } else {
          const v = sp.p.vel;
          r.speed = r2(Math.hypot(v[0], v[1], v[2]));
          r.gravity = r2(sp.p.gravity);
          r.massSpawn = r2(sp.p.mass);
          r.materialSpawn = sp.p.material;
          await sleep(600);
          r.flying = (await page.evaluate(() => window.__e2eTools.flying())).map(maxDim).map(r2);
          await shot(page, `vol-${key}`, `${key} : en vol`, { group: key });
          const end = await waitEv(page, n0, (e) => e.name === 'projectile:end' && e.p.id === sp.p.id, 6000);
          await shot(page, `impact-${key}`, `${key} : impact (${end?.p.reason ?? '?'})`, { group: key });
          await sleep(900);
          const evs = await evSince(page, n0);
          const hits = evs.filter((e) => e.name === 'hit' && e.p.attacker === shooter);
          const first = hits[0];
          r.endReason = end?.p.reason ?? null;
          if (first) {
            r.damage = first.p.crit ? r2(first.p.damage / 1.35) : first.p.damage;
            r.crit = first.p.crit;
            const l = first.p.launch ?? first.p.knockback;
            const k2 = await page.evaluate(() => window.__e2eTools.k2);
            // Recul ramené à 0 % (retire l'effet du % après le coup, donc d'un critique) : compare les objets, pas le hasard.
            r.launch = r2(l ? Math.hypot(l[0], l[1], l[2]) / (1 + ((first.p.pct ?? 0) / 100) * k2) : null);
            r.launchRaw = r2(l ? Math.hypot(l[0], l[1], l[2]) : null);
            r.massHit = r2(first.p.mass);
          }
          r.hits = hits.map((h) => h.p.damage);
          r.bouncesNear = evs.filter((e) => e.name === 'projectile:bounce').length;
          r.splashNear = evs.filter((e) => e.name === 'ground:slippery').length;
        }
        // 2) Tir long : cible un peu au-delà des points d'apparition, rendue intouchable → portée réelle, rebonds,
        //    éclats, giclée au sol (l'objet traverse la cible et finit sa course dans le décor).
        if (!r.shield) {
          const far = L / 2 + 1.5;
          await page.evaluate(({ a, b, s, t }) => { const T = window.__e2eTools; T.place(s, a); T.place(t, b); T.reset(s); T.untouchable(t, 6); }, { a: at(-far * sign), b: at(far * sign), s: shooter, t: target });
          await sleep(250);
          const n1 = await evCount(page);
          await page.keyboard.down(FIRE[shooter]);
          await sleep(60);
          await page.keyboard.up(FIRE[shooter]);
          const sp2 = await waitEv(page, n1, (e) => e.name === 'projectile:spawn', 3000);
          if (sp2) {
            const end2 = await waitEv(page, n1, (e) => e.name === 'projectile:end' && e.p.id === sp2.p.id, 6000);
            await sleep(700);
            const evs2 = await evSince(page, n1);
            const o = sp2.p.from;
            const pe = end2?.p.pos ?? o;
            r.range = r2(Math.hypot(pe[0] - o[0], pe[2] - o[2]));
            r.rangeEnd = end2?.p.reason ?? null;
            r.bounces = evs2.filter((e) => e.name === 'projectile:bounce' && e.p.id === sp2.p.id).length;
            r.splash = evs2.filter((e) => e.name === 'ground:slippery').length;
            if (r.bounces || r.splash) await shot(page, `sol-${key}`, `${key} : au sol (${r.bounces} rebond(s), ${r.splash ? 'flaque' : 'pas de flaque'})`, { group: key });
          }
          await page.evaluate((t) => window.__e2eTools.untouchable(t, 0), target);
        }
      } catch (e) {
        errors.push(`combat ${key} : ${e.message.split('\n')[0]}`);
      }
    }
  }
  const tailles = await page.evaluate(() => window.__e2eTools.tailles);
  return { split, fighters, phase: st.phase, tailles };
}

async function stickersLate(page) {
  // Stickers arrivés après la validation (branchés sur l'arme en match par installStickers).
  const ev = await page.evaluate(() => window.__e2e.ev.filter((e) => e.sticker || (e.name === 'scan:progress' && e.p.step === 'sticker-failed')).map((e) => ({ t: e.t, id: e.p.weaponId, ok: !!e.sticker })));
  for (const r of rows.values()) {
    if (!r.weapon) continue;
    const s = ev.find((e) => e.id === r.weapon.id);
    r.sticker = s ? (s.ok ? 'ok' : 'raté') : 'absent';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Verdicts
function verdicts(matches) {
  const V = [];
  const add = (id, label, ok, detail) => V.push({ id, label, ok, detail });
  const scanned = [...rows.values()].filter((r) => r.weapon && !r.preset);
  const adem = Object.keys(ATTENDUS).filter((k) => !k.startsWith('_'));

  add('arsenal', 'Arsenal : la carte se remplit (nom, catégorie, stats, physique) pour chaque photo',
    scanned.length >= adem.length && scanned.every((r) => r.card?.name && r.card?.category && r.card?.pips >= 3 && r.weapon?.physics && r.card?.physicsText),
    `${scanned.length} cartes ; physique sur l'arme : ${scanned.filter((r) => r.weapon?.physics).length} ; physique affichée sur la carte : ${scanned.filter((r) => r.card?.physicsText).length}`);

  add('sticker', 'On valide sans attendre le sticker ; le sticker arrive ensuite et passe sur l\'arme en match',
    scanned.length > 0 && scanned.some((r) => !r.stickerAtConfirm) && scanned.every((r) => r.sticker === 'ok'),
    `validés avant le sticker : ${scanned.filter((r) => !r.stickerAtConfirm).length}/${scanned.length} ; stickers arrivés : ${scanned.filter((r) => r.sticker === 'ok').length} ; sur l'arme en match : ${scanned.filter((r) => r.stickerInMatch).length}`);

  const m1 = matches[0];
  add('persos', '2 persos tirés de photos (visages fictifs)', !!m1 && m1.fighters.every((f) => f.face),
    m1 ? `${m1.fighters.map((f) => `${f.name} (${f.model}${f.face ? ', visage' : ', sans visage'})`).join(' · ')} ; scan ${persosInfo.s ?? '?'} s${persosInfo.issues.length ? ` ; message : ${persosInfo.issues.join(' / ')}` : ''}` : 'match non atteint');

  add('match', 'Match en écran scindé, chaque joueur avec SES objets', !!m1 && m1.split === true && m1.phase === 'fight', m1 ? `split=${m1.split}, phase=${m1.phase}` : 'match non atteint');

  const withHeld = scanned.filter((r) => r.held && r.weapon?.physics);
  const T = matches[0]?.tailles ?? [0.35, 1.6];
  const heldOk = (r) => {
    const real = maxDim(r.weapon.physics.sizeM);
    const want = Math.min(T[1], Math.max(T[0], real));
    return Math.abs(maxDim(r.held) - want) / want <= 0.35;
  };
  const ch = rows.get('chaise-bureau'), ca = rows.get('canette'), fe = rows.get('feutre-velleda'), ta = rows.get('tabouret-rotin');
  add('en-main', `Chaque objet en main à sa taille réelle (bornée ${T[0]}-${T[1]} m pour rester lisible, ±35 %), la chaise nettement plus grande que la canette`,
    withHeld.length >= adem.length && withHeld.every(heldOk) && !!(ch?.held && ca?.held && maxDim(ch.held) >= 1.5 * maxDim(ca.held)),
    `${withHeld.filter(heldOk).length}/${scanned.length} à la bonne taille ; chaise ${maxDim(ch?.held) ?? '?'} m, canette ${maxDim(ca?.held) ?? '?'} m`);

  const cmp = (a, b, f, sens) => a && b && a[f] != null && b[f] != null && (sens > 0 ? a[f] > b[f] : a[f] < b[f]);
  const subs = [
    ['plus de dégâts', cmp(ch, ca, 'damage', 1)], ['plus de recul', cmp(ch, ca, 'launch', 1)], ['plus lente', cmp(ch, ca, 'speed', -1)],
    ['moins loin', cmp(ch, ca, 'range', -1)], ['recharge plus longue', cmp(ch, ca, 'cooldown', 1)],
  ];
  add('chaise-canette', 'Chaise contre canette (toutes deux lancées) : ' + subs.map(([l]) => l).join(', '), subs.every(([, ok]) => ok),
    subs.map(([l, ok]) => `${l} ${ok ? 'oui' : 'NON'}`).join(' · '));

  const four = [ch, ca, fe, ta].filter((r) => r?.weapon?.physics && r.damage != null && r.category === 'throwable').sort((a, b) => a.weapon.physics.massKg - b.weapon.physics.massKg);
  const mono = (f, sens) => four.every((r, i) => i === 0 || (sens > 0 ? r[f] >= four[i - 1][f] : r[f] <= four[i - 1][f]));
  add('quatre', 'Feutre, canette, tabouret, chaise : plus c\'est lourd, plus ça frappe et recule, plus c\'est lent et long à recharger',
    four.length === 4 && mono('damage', 1) && mono('launch', 1) && mono('speed', -1) && mono('cooldown', 1),
    four.length ? four.map((r) => `${r.key} ${r2(r.weapon.physics.massKg)} kg`).join(' < ') : 'objets manquants');

  const fragile = scanned.filter((r) => r.weapon?.physics?.fragile && !r.shield);
  add('fragile', 'Un objet fragile se brise (éclats à l\'impact)', fragile.length > 0 && fragile.every((r) => (r.hits?.length ?? 0) >= 2 || r.rangeEnd === 'world'),
    fragile.length ? fragile.map((r) => `${r.key} : ${r.hits?.length ?? 0} coup(s) ${r.hits?.join('+') ?? ''}`).join(' · ') : 'aucun objet fragile détecté');
  const liquid = scanned.filter((r) => r.weapon?.physics?.liquid && !r.shield && r.category !== 'blaster');
  add('liquide', 'Un liquide gicle (sol glissant)', liquid.length > 0 && liquid.every((r) => r.splash > 0 || r.splashNear > 0),
    liquid.length ? liquid.map((r) => `${r.key} : ${(r.splash ?? 0) + (r.splashNear ?? 0)} flaque(s)`).join(' · ') : 'aucun objet liquide détecté');
  const bouncy = [...rows.values()].filter((r) => (r.weapon?.physics?.bounciness ?? r.physicsPreset?.bounciness ?? 0) > 0.3 && !r.shield && r.category !== 'blaster');
  add('rebond', 'Un objet rebondissant rebondit', bouncy.length > 0 && bouncy.every((r) => r.bounces > 0),
    bouncy.length ? bouncy.map((r) => `${r.key} : ${r.bounces ?? 0} rebond(s)`).join(' · ') : 'aucun objet rebondissant détecté');

  const ok10 = adem.map((k) => {
    const r = rows.get(k); const a = ATTENDUS[k];
    if (!r?.weapon?.physics) return [k, false, 'pas de physique'];
    const ph = r.weapon.physics;
    const inMass = ph.massKg >= a.masseKg[0] * 0.7 && ph.massKg <= a.masseKg[1] * 1.3;
    const fired = r.shield || r.massSpawn != null;
    const joined = r.shield || Math.abs((r.massSpawn ?? -1) - Math.min(25, Math.max(0.02, ph.massKg))) < 0.05;
    return [k, inMass && fired && joined, `${r2(ph.massKg)} kg${inMass ? '' : ' (hors attendu)'}${fired ? '' : ', pas lancé'}${joined ? '' : ', masse perdue en route'}`];
  });
  add('dix', 'Les 10 objets d\'Adem : physique plausible, lancés en match avec LEUR masse', ok10.every(([, ok]) => ok),
    ok10.map(([k, ok, d]) => `${k} ${ok ? '✓' : '✗'} ${d}`).join(' · '));
  return V;
}

// ---------------------------------------------------------------------------------------------------------------
function html(V, matches, meta) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nb = V.filter((v) => v.ok).length;
  const cell = (x) => (x == null ? '<td class="na">—</td>' : `<td>${esc(Array.isArray(x) ? x.join(' / ') : x)}</td>`);
  const order = [...rows.values()].filter((r) => r.weapon || r.preset);
  const ch = rows.get('chaise-bureau'), ca = rows.get('canette');
  const ratio = (f) => (ch?.[f] != null && ca?.[f] ? `×${r2(ch[f] / ca[f])}` : '—');
  const cmpRows = [['Masse (kg)', ch?.weapon?.physics?.massKg, ca?.weapon?.physics?.massKg, 'massKg'], ['Dégâts (%)', ch?.damage, ca?.damage, 'damage'],
    ['Recul à 0 % (m/s)', ch?.launch, ca?.launch, 'launch'], ['Vitesse (m/s)', ch?.speed, ca?.speed, 'speed'], ['Portée (m)', ch?.range, ca?.range, 'range'],
    ['Recharge (s)', ch?.cooldown, ca?.cooldown, 'cooldown'], ['Taille en main (m)', maxDim(ch?.held), maxDim(ca?.held), null]];
  const groups = [...new Set(shots.map((s) => s.group ?? 'autres'))];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>LE2E photo jouable</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--fond:#f6f3ee;--encre:#1d1a22;--doux:#6b6470;--vert:#1f8a4c;--rouge:#c2362b;--carte:#fff;--trait:#e2dcd2}
@media (prefers-color-scheme:dark){:root{--fond:#16141a;--encre:#f0ece6;--doux:#a39ca8;--vert:#43c47a;--rouge:#ff6b5e;--carte:#211e26;--trait:#35303b}}
body{margin:0;background:var(--fond);color:var(--encre);font:15px/1.45 system-ui,Segoe UI,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{margin:36px 0 10px;font-size:19px}
.meta{color:var(--doux);font-size:13px}.score{font-size:18px;margin:14px 0}
table{border-collapse:collapse;width:100%;background:var(--carte);font-size:13px}td,th{border-bottom:1px solid var(--trait);padding:6px 8px;text-align:left;vertical-align:top}
th{font-weight:600;color:var(--doux)}td.na{color:var(--doux)}.wrap{overflow-x:auto}
.v{font-weight:700;white-space:nowrap}.v.ok{color:var(--vert)}.v.ko{color:var(--rouge)}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.gal figure{margin:0;background:var(--carte);border:1px solid var(--trait)}
.gal img{width:100%;display:block}.gal figcaption{padding:6px 8px;font-size:12px;color:var(--doux)}
ul.err{color:var(--rouge);font-size:13px}
</style></head><body><main>
<h1>Photo → objet jouable, dans le vrai jeu</h1>
<p class="meta">${esc(meta.date)} · branche ${esc(meta.branch)} @ ${esc(meta.commit)} · durée ${meta.dureeS} s · test : tools/e2e/photo-jouable.mjs · photos d'Adem masquées sur les captures ; canette dessinée ; visages fictifs</p>
<p class="score"><strong>${nb}/${V.length}</strong> critères verts</p>
<table><tr><th>Critère</th><th>Verdict</th><th>Mesure</th></tr>
${V.map((v) => `<tr><td>${esc(v.label)}</td><td class="v ${v.ok ? 'ok' : 'ko'}">${v.ok ? 'VERT' : 'ROUGE'}</td><td>${esc(v.detail)}</td></tr>`).join('\n')}
</table>
<h2>Chaise contre canette (lancées toutes les deux)</h2>
<table><tr><th>Mesure en jeu</th><th>Chaise de bureau</th><th>Canette</th><th>Rapport</th></tr>
${cmpRows.map(([l, a, b, f]) => `<tr><td>${l}</td>${cell(r2(a))}${cell(r2(b))}<td>${f ? ratio(f) : '—'}</td></tr>`).join('\n')}
</table>
<h2>Toutes les mesures (événements du bus)</h2>
<div class="wrap"><table><tr><th>Objet</th><th>Arme</th><th>Cat.</th><th>Masse kg</th><th>Taille réelle m</th><th>Matière</th><th>Fragile</th><th>Liquide</th><th>Rebond</th><th>En main m</th><th>Vitesse m/s</th><th>Dégâts %</th><th>Recul à 0 % m/s</th><th>Recharge s</th><th>Portée m</th><th>Rebonds</th><th>Flaques</th><th>Coups</th><th>Sticker</th></tr>
${order.map((r) => { const ph = r.weapon?.physics; return `<tr><td>${esc(r.key)}${r.categoryScan ? ` <span class="meta">(scan : ${esc(r.categoryScan)})</span>` : ''}</td>${cell(r.weapon?.name ?? (r.preset ? 'preset' : null))}${cell(r.category ?? r.weapon?.category)}${cell(r2(ph?.massKg))}${cell(ph ? r2(maxDim(ph.sizeM)) : null)}${cell(ph?.material)}${cell(ph ? (ph.fragile ? 'oui' : 'non') : null)}${cell(ph ? (ph.liquid ? 'oui' : 'non') : null)}${cell(r2(ph?.bounciness))}${cell(r2(maxDim(r.held)))}${cell(r.speed)}${cell(r.damage)}${cell(r.launch)}${cell(r.cooldown)}${cell(r.range != null ? `${r.range} (${r.rangeEnd})` : null)}${cell(r.bounces)}${cell(r.splash != null ? r.splash + (r.splashNear ?? 0) : null)}${cell(r.hits?.length ? r.hits.join('+') : null)}${cell(r.sticker)}</tr>`; }).join('\n')}
</table></div>
${errors.length ? `<h2>Maillons cassés relevés</h2><ul class="err">${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
<h2>Captures</h2>
${groups.map((g) => `<h3>${esc(g)}</h3><div class="gal">${shots.filter((s) => (s.group ?? 'autres') === g).map((s) => `<figure><img loading="lazy" src="${esc(s.file)}" alt=""><figcaption>${esc(s.legend)}</figcaption></figure>`).join('')}</div>`).join('\n')}
</main></body></html>`;
}

// ---------------------------------------------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  const base = await startServer();
  // Carte NVIDIA (mémoire vidéo à elle) : la puce Intel partage la RAM, saturée par les agents → contexte WebGL perdu.
  const gpu = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'];
  const browser = await chromium.launch({ headless: !HEADED, args: gpu });
  const matches = [];
  let renderer = '?', glLost = [];
  let page = null;
  try {
    const canette = await photoCanette(browser);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(RECORDER);
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`erreur page : ${String(e.message).slice(0, 160)}`));
    let nConsole = 0;
    page.on('console', (m) => { if (m.type() === 'error' && nConsole++ < 12 && !/Failed to load resource/.test(m.text())) errors.push(`console : ${m.text().slice(0, 200)}`); });
    await page.goto(`${base}/`, { waitUntil: 'load', timeout: 180000 });
    await page.waitForFunction(() => window.__e2e?.hooked, null, { timeout: 120000 });
    renderer = await page.evaluate(() => {
      const gl = window.ctx?.three?.renderer?.getContext();
      const d = gl?.getExtension('WEBGL_debug_renderer_info');
      return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'inconnu';
    });
    log(`rendu : ${renderer}`);
    for (let m = 0; m < (UN_MATCH ? 1 : MATCHES.length); m++) {
      // Titre : le clic peut tomber pendant l'apparition de l'écran (après « Menu ») → on reclique jusqu'aux persos.
      await step(page, `match ${m + 1} : titre`, async () => {
        for (let essai = 0; essai < 6; essai++) {
          await page.locator('.title-play').click({ timeout: 60000, force: true });
          if (await page.locator('.fighter-grid').waitFor({ timeout: 4000 }).then(() => true, () => false)) return;
        }
        throw new Error('écran des persos jamais atteint');
      });
      await step(page, `match ${m + 1} : persos`, () => pickFighters(page, m === 0));
      await step(page, `match ${m + 1} : arsenal`, () => runArsenal(page, MATCHES[m], canette));
      await step(page, `match ${m + 1} : vers le combat`, () => toFight(page));
      matches.push(await step(page, `match ${m + 1} : combat et mesures`, () => measureMatch(page, MATCHES[m], m + 1)));
      await page.evaluate(() => window.gameHooks.forcerVictoire(0));
      if (m + 1 < (UN_MATCH ? 1 : MATCHES.length)) {
        await page.locator('button:has-text("Menu")').waitFor({ timeout: 20000 });
        await sleep(600);
        await page.locator('button:has-text("Menu")').click({ force: true });
        await page.locator('.title-play').waitFor({ timeout: 20000 });
        await sleep(1200);
      }
    }
  } catch (e) {
    errors.push(`arrêt du parcours : ${e.message.split('\n')[0]}`);
  } finally {
    // Toujours : stickers arrivés, journal des événements, pertes du contexte WebGL.
    if (page) {
      try {
        await stickersLate(page);
        glLost = await page.evaluate(() => window.__e2e.glLost);
        writeFileSync(join(OUT, 'evenements.json'), JSON.stringify(await page.evaluate(() => window.__e2e.ev.filter((e) => e.name !== 'weapon:pick').slice(-900))));
      } catch (e) { errors.push(`fin : ${e.message.split('\n')[0]}`); }
    }
    await browser.close().catch(() => {});
    stopServer();
  }
  if (glLost.length) errors.push(`contexte WebGL perdu ${glLost.length} fois (scène blanche sur les captures suivantes : processus GPU saturé)`);
  let branch = '?', commit = '?';
  try { branch = execSync('git branch --show-current').toString().trim(); commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* hors git */ }
  const V = verdicts(matches);
  const meta = { date: new Date().toLocaleString('fr-FR'), branch, commit, dureeS: Math.round((Date.now() - t0) / 1000), rendu: renderer, glLost };
  writeFileSync(join(OUT, 'mesures.json'), JSON.stringify({ meta, verdicts: V, matches, objets: [...rows.values()], erreurs: errors }, null, 1));
  writeFileSync(join(OUT, 'index.html'), html(V, matches, meta));
  for (const v of V) log(`${v.ok ? 'VERT ' : 'ROUGE'} ${v.label} — ${v.detail}`);
  if (errors.length) log(`maillons cassés : \n  ${errors.join('\n  ')}`);
  log(`rapport : ${join(OUT, 'index.html')}`);
}

main().catch((e) => { console.error(e); stopServer(); process.exit(1); });
