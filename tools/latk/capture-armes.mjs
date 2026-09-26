// Banc visuel du lot LATK1 (l'arme, c'est l'objet) : joue chaque catégorie avec de vrais stickers (presets),
// capture des séquences en vue 3/4 et en vue défenseur, puis une planche récapitulative.
// Usage : node tools/latk/capture-armes.mjs [--port 5361] [--lent 0.35] [--swiftshader]
//   → captures/latk/*.jpg + captures/latk/planche.png
// Les images sont prises DANS la page, juste après le rendu de l'image voulue (système de boucle à l'ordre
// 1001) : l'instant est exact même si Playwright met 1 s par capture sur une machine chargée. Le HUD HTML
// n'y figure pas (on juge les objets et les effets).
// Vrai gameplay temps réel (hooks fire / input) : chaque objet de la liste OBJETS est lancé par P1 sur P2
// (écran scindé : vue du tireur à gauche, du défenseur à droite), puis plans rapprochés en vue unique.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(opt('--port', 5361));
const OUT = 'captures/latk';
const ONLY = opt('--only', '');
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (/\.(png|jpg)$/.test(f)) unlinkSync(`${OUT}/${f}`);

const url = `http://localhost:${PORT}/?demo=1`;
async function up(u) { try { return (await fetch(u)).ok; } catch { return false; } }
// Toujours NOTRE serveur (le code de ce dossier) : un port déjà pris est peut-être celui d'un autre agent.
if (await up(url)) {
  console.error(`Port ${PORT} déjà occupé (serveur d'un autre ?) : choisis un port libre avec --port.`);
  process.exit(2);
}
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
console.log(`Vite lancé (PID ${server.pid}) sur ${PORT}`);
for (let i = 0; i < 90 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));

const gpu = args.includes('--swiftshader')
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: gpu });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const erreurs = [];
page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().split('\n')[0]); });
page.on('pageerror', (e) => erreurs.push(e.message));
// Temps de jeu ralenti pendant le banc (window.__fast) : sur une machine chargée, les images longues ne sautent
// plus les instants clés. Les délais ci-dessous sont en temps de JEU ; les noms de fichiers aussi.
const SLOW = Number(opt('--lent', 0.35));
const sleep = (ms) => page.waitForTimeout(ms / SLOW);
const files = [];

/** Programme des captures à t0 + ms de jeu, attend qu'elles soient prises, les écrit. */
async function sequence(prefix, t0, times) {
  await page.evaluate(([p, t, ts, k]) => { for (const ms of ts) window.__latk.queue.push({ name: p, t0: t, at: t + ms / k, k }); window.__latk.queue.sort((a, b) => a.at - b.at); }, [prefix, t0, times, SLOW]);
  await page.waitForFunction(() => window.__latk.queue.length === 0, null, { timeout: 120000 });
  await flush();
}
async function snap(name) {
  await page.evaluate((n) => { const t = performance.now(); window.__latk.queue.push({ name: n, t0: t, at: t }); }, name);
  await page.waitForFunction(() => window.__latk.queue.length === 0, null, { timeout: 20000 });
  await flush();
}
async function flush() {
  const grabs = await page.evaluate(() => window.__latk.grabs.splice(0));
  for (const g of grabs) {
    const path = `${OUT}/${String(files.length + 1).padStart(2, '0')}-${g.name}-${String(g.t).padStart(4, '0')}ms.jpg`;
    writeFileSync(path, Buffer.from(g.data.split(',')[1], 'base64'));
    files.push(path);
  }
}
/** Caméra fixée pour la capture : 'tq' (3/4 proche), 'def' (derrière la cible), 'att' (derrière le tireur), null (jeu). */
async function pose(kind, shooter = 0) {
  await page.evaluate(([k, s]) => { window.__latk.pose = k ? { kind: k, shooter: s } : null; }, [kind, shooter]);
}

try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.gameHooks && window.ctx, null, { timeout: 120000 });
  await page.evaluate((k) => {
    const c = window.ctx;
    void k;
    window.__latk = { queue: [], grabs: [], pose: null };
    const V = c.three.camera.position.constructor;
    const a = new V(), b = new V(), mid = new V(), dir = new V(), side = new V();
    c.loop.addSystem('latk-banc-camera', () => {
      const P = window.__latk.pose;
      if (!P) return;
      const s = c.state, cam = c.three.camera;
      const sh = s.players[P.shooter].pos, tg = s.players[1 - P.shooter].pos;
      a.set(sh[0], sh[1], sh[2]); b.set(tg[0], tg[1], tg[2]);
      dir.subVectors(b, a).setY(0).normalize();
      side.set(-dir.z, 0, dir.x);
      if (P.kind === 'tq') {
        mid.addVectors(a, b).multiplyScalar(0.5);
        cam.position.copy(mid).addScaledVector(side, -9.5).addScaledVector(dir, -1.5).setY(mid.y + 6.5); // côté ombre, assez haut pour passer les dalles
        cam.lookAt(mid.x, mid.y + 1.2, mid.z);
      } else if (P.kind === 'def') {
        cam.position.copy(b).addScaledVector(dir, 4.2).addScaledVector(side, 1.1).setY(b.y + 2.3);
        cam.lookAt(a.x, a.y + 1.3, a.z);
      } else {
        cam.position.copy(a).addScaledVector(dir, -4.2).addScaledVector(side, 1.1).setY(a.y + 2.3);
        cam.lookAt(b.x, b.y + 1.3, b.z);
      }
    }, 350);
    c.loop.addSystem('latk-banc-grab', () => {
      const L = window.__latk;
      const now = performance.now();
      while (L.queue.length && L.queue[0].at <= now) {
        const q = L.queue.shift();
        L.grabs.push({ name: q.name, t: Math.round((now - q.t0) * (q.k ?? 1)), data: c.three.canvas.toDataURL('image/jpeg', 0.86) });
      }
    }, 1001);
  }, SLOW);
  await sleep(1200);
  const presets = JSON.parse(readFileSync('public/assets/presets/presets.json', 'utf8'));
  const list = Array.isArray(presets) ? presets : presets.weapons ?? Object.values(presets);
  const byId = Object.fromEntries(list.map((w) => [w.id, { ...w, cooldown: 0, source: 'preset' }]));
  const p0 = [byId['preset-rubber-duck'], byId['preset-garden-gnome'], byId['preset-stapler']];
  const p1 = [byId['preset-frying-pan'], byId['preset-banana'], byId['preset-baguette']];

  // ---------------------------------------------------------------- vrai gameplay temps réel
  // « Une chaise n'est pas une canette » : chaque objet lancé par P1 sur P2, avec sa physique (vraie ou devinée).
  const fight = async () => page.waitForFunction(() => window.ctx.state.phase === 'fight', null, { timeout: 120000 });
  const input = (p, a, d) => page.evaluate(([pp, aa, dd]) => window.gameHooks.input(pp, aa, dd), [p, a, d]);
  const start = async () => {
    // Temps normal pour le compte à rebours (sinon il n'aboutit pas), ralenti seulement pendant le combat.
    await page.evaluate(([a, b]) => { window.__fast = 1; window.gameHooks.startMatch({ weapons: [a, b], map: 'archipel', seed: 7, stocks: 9, split: true }); }, [p0, p1]);
    await fight();
    await page.evaluate((k) => { window.__fast = k; }, SLOW);
    await sleep(600);
  };
  const arm = (w) => page.evaluate((ww) => {
    const s = window.ctx.state;
    s.players[0].weapons[0] = { ...ww, id: `${ww.id}-${Math.random().toString(36).slice(2, 6)}` };
    s.players[0].cooldowns[0] = 0;
    s.players[0].selected = 0;
    s.players[0].pct = 0; s.players[1].pct = 0;
    window.ctx.bus.emit('weapon:pick', { player: 0, index: 0 });
  }, w);
  /** Attend la fin du vol (projectile:end ou délai), pour ne pas mélanger deux lancers. */
  const settle = () => page.evaluate(() => new Promise((res) => {
    const off = window.ctx.bus.on('projectile:end', () => { off?.(); setTimeout(res, 900); });
    setTimeout(res, 6000);
  }));
  const OBJETS = [
    { nom: 'chaise-12kg', vue: 'tq', w: { ...byId['preset-office-chair'], category: 'throwable', physics: { massKg: 12, sizeM: [1.1, 0.65, 0.65], material: 'plastic', shape: 'irregular', bounciness: 0.2, fragile: false, liquid: false } } },
    { nom: 'canard-caoutchouc', vue: 'tq', w: { ...byId['preset-rubber-duck'], physics: { massKg: 0.1, sizeM: [0.12, 0.12, 0.1], material: 'rubber', shape: 'round', bounciness: 0.85, fragile: false, liquid: false } } },
    { nom: 'poele-frisbee', vue: 'def', w: { ...byId['preset-frying-pan'], category: 'throwable', physics: { massKg: 1.6, sizeM: [0.06, 0.3, 0.5], material: 'metal', shape: 'flat', bounciness: 0.3, fragile: false, liquid: false } } },
    { nom: 'telephone-verre', vue: 'def', w: { ...byId['preset-smartphone'], category: 'throwable', trait: 'heavy', physics: { massKg: 0.2, sizeM: [0.15, 0.075, 0.009], material: 'glass', shape: 'flat', bounciness: 0.1, fragile: true, liquid: false } } },
    { nom: 'canette-liquide', vue: 'tq', w: { ...byId['preset-rubber-duck'], id: 'canette', object: 'soda can', name: 'Fizz Bomb', category: 'grenade', palette: ['#D7263D', '#F4F4F4'], stickerUrl: undefined, trait: 'loud', physics: { massKg: 0.37, sizeM: [0.12, 0.066, 0.066], material: 'metal', shape: 'round', bounciness: 0.3, fragile: false, liquid: true } } },
    { nom: 'baguette-longue', vue: 'tq', w: { ...byId['preset-baguette'], category: 'throwable', physics: { massKg: 0.25, sizeM: [0.65, 0.07, 0.06], material: 'food', shape: 'long', bounciness: 0.1, fragile: false, liquid: false } } },
    { nom: 'nain-ceramique', vue: 'att', w: { ...byId['preset-garden-gnome'], physics: { massKg: 3, sizeM: [0.45, 0.22, 0.22], material: 'ceramic', shape: 'irregular', bounciness: 0.1, fragile: true, liquid: false } } },
  ];

  if (!ONLY || ONLY === 'rt') {
    await start(); // échauffement : charge la map et les persos
    await sleep(2500);
    await start();
    await pose('att', 0);
    await arm(OBJETS[1].w);
    await sleep(1200);
    await input(0, 'fire', true);
    await sleep(850);
    await snap('charge-canard');
    await input(0, 'fire', false);
    await settle();
    for (const o of OBJETS) {
      await pose(o.vue, 0);
      await arm(o.w);
      await sleep(1300);
      await snap(`${o.nom}-en-main`);
      const t0 = await page.evaluate(() => { window.gameHooks.fire(0.8); return performance.now(); });
      await sequence(o.nom, t0, [70, 200, 340, 480, 620, 780, 1000, 1300]);
      await settle();
    }
    // Bouclier de P2 (poêle), vu de côté.
    await pose('tq', 0);
    await input(1, 'weapon1', true); await input(1, 'weapon1', false);
    await sleep(500);
    await input(1, 'fire', true); await sleep(350);
    const t1 = await page.evaluate(() => { window.gameHooks.input(1, 'fire', false); return performance.now(); });
    await sequence('bouclier', t1, [40, 140, 260, 420, 800]);
    await sleep(5500);
    // Parade parfaite de P1 sur la banane de P2 (vue de P1 = défenseur).
    await pose('def', 1);
    await page.evaluate(() => {
      window.__parryArmed = true;
      window.ctx.bus.on('projectile:incoming', ({ target, etaMs }) => {
        if (!window.__parryArmed || target !== 0) return;
        window.__parryArmed = false;
        setTimeout(() => { window.gameHooks.input(0, 'parry', true); setTimeout(() => window.gameHooks.input(0, 'parry', false), 350); }, Math.max(0, etaMs - 90));
      });
    });
    await input(1, 'weapon2', true); await input(1, 'weapon2', false);
    await sleep(500);
    await input(1, 'fire', true); await sleep(400);
    const t3 = await page.evaluate(() => { window.gameHooks.input(1, 'fire', false); return performance.now(); });
    await sequence('banane-parade', t3, [60, 200, 330, 450, 560, 680, 800, 950, 1150]);
    await sleep(1500);
    // Rafales de blaster des 2 joueurs en même temps (vue de côté).
    await pose('tq', 0);
    await page.evaluate(() => { const s = window.ctx.state; s.players[0].cooldowns[2] = 0; window.gameHooks.pickWeapon(2); });
    await input(1, 'weapon3', true); await input(1, 'weapon3', false);
    await sleep(900);
    await input(1, 'fire', true);
    await sleep(320);
    const t4 = await page.evaluate(() => { window.gameHooks.fire(0.6); window.gameHooks.input(1, 'fire', false); return performance.now(); });
    await sequence('blasters', t4, [15, 60, 110, 170, 240, 330, 450, 600]);
  }
} catch (e) {
  console.error('Échec :', e);
  erreurs.push(String(e));
} finally {
  try {
    await flush().catch(() => {});
    const img = (f) => `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`;
    const cells = files.map((f) => `<figure style="margin:0"><img src="${img(f)}" style="width:100%;display:block"><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('');
    const sheet = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
    await sheet.setContent(`<body style="margin:0;background:#2B1D14;color:#F3E3C3;font:13px sans-serif"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px">${cells}</div></body>`);
    await sheet.waitForTimeout(300);
    await sheet.screenshot({ path: `${OUT}/planche.png`, fullPage: true });
    await sheet.close();
  } catch (e) { console.error('Planche :', e); }
  await browser.close();
  server.kill();
  console.log(`${files.length} captures dans ${OUT} ; erreurs console : ${erreurs.length}`);
  for (const e of [...new Set(erreurs)].slice(0, 12)) console.log('  ✗', e);
}
