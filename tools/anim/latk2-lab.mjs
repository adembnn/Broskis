// Banc visuel LATK2 (plan/lots/LATK-attaques-defenses.md) : joue chaque action du corps sur le vrai jeu
// (attaques en courant, charge, garde, parade parfaite, coups reçus, vrille d'éjection, bord, victoire,
// réapparition), caméra neutre en vue 3/4 et en vue du défenseur, et compose une planche par scénario et par
// vue (captures/latk/<scénario>-<vue>.png) puis une planche récapitulative (captures/latk/recap.png).
// Pilote le jeu par window.__fighters (accès de mise au point LATK2) : position imposée (course simulée),
// événements du bus. Les images sont prises DANS la page juste après le rendu (système d'ordre 1001) ; tout
// le déroulé est en TEMPS DE JEU (la boucle plafonne à 50 ms par image : sur une machine chargée, le jeu
// ralentit au lieu de sauter des poses, et la planche reste complète).
// Vidéos : si ffmpeg est dans le PATH, chaque planche a aussi sa vidéo en TEMPS DE JEU RÉEL (20 i/s, une image
// toutes les 50 ms de jeu) dans captures/latk/video/, plus notes.json : le juge Gemini les note sans subir la
// lenteur de la machine (node tools/anim/juge-gemini.mjs --videos captures/latk/video --notes captures/latk/video/notes.json).
// Usage : node tools/anim/latk2-lab.mjs [--url http://localhost:5363] [--only lancer-course,tir-course] [--views 34]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_BASE = opt('--url', 'http://localhost:5363');
const ONLY = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const OUT = 'captures/latk';
const OUT_VIDEO = `${OUT}/video`;
mkdirSync(OUT_VIDEO, { recursive: true });
const FFMPEG = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const NOTES = {
  'lancer-course': "Lancer d'une grenade EN COURANT (visée verrouillée sur l'adversaire) : charge (bras armé derrière la tête, torse enroulé, tremblement), puis le bras part, l'objet quitte la main, fente et accompagnement ; les jambes continuent de courir.",
  'lancer-arret': "Lancer d'un objet à l'arrêt : charge (bras armé derrière la tête, torse enroulé et cambré, tremblement), puis lancer par-dessus l'épaule, fente vers l'avant et accompagnement.",
  'tir-course': 'Tir au blaster en courant de côté : bras tendu braqué sur la cible pendant la charge, rafale de 3 tirs avec recul du buste et du bras à chaque tir.',
  'bouclier': "Pose du bouclier : l'objet brandi à deux mains au-dessus de la tête, puis planté au sol d'un coup sec (plongée du buste, écrasement).",
  'garde-parfaite': "Garde levée (en moins de 50 ms) et tenue, buste voûté ; parade parfaite : contre (coup d'épaule vers l'attaquant), puis garde baissée.",
  'garde-course': 'Garde levée en reculant, puis coup encaissé en garde : la garde plie, le buste recule.',
  'coup-face': 'Coup reçu de face : tête et buste rejetés en arrière, écrasement, puis retour.',
  'coup-dos': 'Coup reçu de dos : buste projeté vers l’avant, puis retour.',
  'ejection': 'Coup fort : éjection à reculons en vrille (salto arrière façon Smash) le long de la trajectoire, puis remise droite.',
  'double-saut': 'Saut puis double saut avec salto avant, réception écrasée.',
  'bord': 'Rattrapé au bord : accroché sous le plateau, bras levés, corps qui se balance ; puis remontée en arc et réception.',
  'desequilibre': 'Au bord du vide : moulinet des bras, buste qui bascule vers le vide puis se rattrape.',
  'victoire': 'Fin de match : le gagnant exulte.',
  'reapparition': 'Réapparition : tombe du ciel sur la plateforme, réception.',
};
const notesVideo = [];
mkdirSync(OUT, { recursive: true });

// Chaque scénario : acteur, déplacement simulé, étapes (ms de jeu, action, argument), durée (ms de jeu).
const SCENARIOS = [
  { name: 'lancer-course', actor: 0, move: 'run', ms: 1500, steps: [[0, 'charge', 'grenade'], [550, 'fire', 'grenade']] },
  { name: 'lancer-arret', actor: 0, move: 'still', ms: 1400, steps: [[0, 'charge', 'throwable'], [450, 'fire', 'throwable']] },
  { name: 'tir-course', actor: 0, move: 'strafe', ms: 1400, steps: [[0, 'charge', 'blaster'], [350, 'fire', 'blaster'], [350, 'shot'], [460, 'shot'], [570, 'shot']] },
  { name: 'bouclier', actor: 0, move: 'still', ms: 1300, steps: [[0, 'charge', 'shield'], [350, 'fire', 'shield']] },
  { name: 'garde-parfaite', actor: 1, move: 'still', ms: 1300, steps: [[100, 'block', true], [450, 'parry', 'perfect'], [1100, 'block', false]] },
  { name: 'garde-course', actor: 1, move: 'back', ms: 1200, steps: [[100, 'block', true], [600, 'parry', 'good']] },
  { name: 'coup-face', actor: 1, move: 'still', ms: 1000, steps: [[150, 'hit', 'front']] },
  { name: 'coup-dos', actor: 1, move: 'still', ms: 1000, steps: [[150, 'hit', 'back']] },
  { name: 'ejection', actor: 1, move: 'still', ms: 1700, steps: [[100, 'eject']] },
  { name: 'double-saut', actor: 0, move: 'still', ms: 1300, steps: [[0, 'doublejump']] },
  { name: 'bord', actor: 0, move: 'still', ms: 1900, steps: [[0, 'ledge'], [1100, 'climb']] },
  { name: 'desequilibre', actor: 0, move: 'still', ms: 1400, steps: [[0, 'teeter']] },
  { name: 'victoire', actor: 0, move: 'still', ms: 1600, steps: [[0, 'victory']] },
  { name: 'reapparition', actor: 1, move: 'still', ms: 1600, steps: [[0, 'respawn']] },
].filter((s) => !ONLY.length || ONLY.includes(s.name));
// --clips a,b,c : planche brute de chaque clip (corps entier, vue de côté) pour choisir et caler les images clés.
const CLIPS = opt('--clips', '')?.split(',').filter(Boolean) ?? [];
if (CLIPS.length) SCENARIOS.splice(0, SCENARIOS.length, ...CLIPS.map((c) => ({ name: `clip-${c}`, actor: 0, move: 'still', ms: 1500, steps: [[0, 'clip', c]], clip: c })));
const VIEWS = CLIPS.length ? ['cote'] : opt('--views', '34,defenseur').split(',');

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL_BASE}/?demo=1&animtest=1`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => !!window.gameHooks, null, { timeout: 90000 });

// Outils injectés dans la page.
await page.evaluate(() => {
  const V = (x, y, z) => ({ x, y, z });
  window.__lab = {
    frames: [],
    capture: false,
    everyMs: 50,
    lastCap: -1e9,
    clock: 0,
    installed: false,
    cam: { view: '34', actor: 0 },
    motion: null,
    install() {
      if (this.installed) return;
      this.installed = true;
      const F = window.__fighters;
      const ctx = F.ctx;
      const cam = ctx.three.camera;
      // Caméra neutre (après la caméra du jeu, avant le rendu).
      ctx.loop.addSystem('latk2-lab-cam', (dt) => {
        this.clock += dt * 1000;
        const m = this.motion;
        if (m) m.step(dt);
        if (!this.capture) return;
        const a = F.rigs[this.cam.actor], o = F.rigs[1 - this.cam.actor];
        if (!a || !o) return;
        const ap = a.container.position, op = o.container.position;
        const dx = op.x - ap.x, dz = op.z - ap.z, d = Math.hypot(dx, dz) || 1;
        const fx = dx / d, fz = dz / d; // de l'acteur vers l'autre
        if (this.cam.view === '34') {
          // 3/4 avant, côté droit de l'acteur, plan moyen
          const sx = -fz, sz = fx;
          cam.position.set(ap.x + fx * 2.3 - sx * 1.9, ap.y + 1.45, ap.z + fz * 2.3 - sz * 1.9);
          cam.lookAt(ap.x + fx * 0.3, ap.y + 0.85, ap.z + fz * 0.3);
        } else if (this.cam.view === 'cote') {
          // profil : perpendiculaire à l'axe acteur → adversaire, côté droit de l'acteur
          const sx = -fz, sz = fx;
          cam.position.set(ap.x - sx * 3.4, ap.y + 1.1, ap.z - sz * 3.4);
          cam.lookAt(ap.x, ap.y + 0.8, ap.z);
        } else {
          // vue du défenseur : derrière l'autre perso, regarde l'acteur
          cam.position.set(op.x + fx * 3.0, op.y + 2.2, op.z + fz * 3.0);
          cam.lookAt(ap.x, ap.y + 1.0, ap.z);
        }
        cam.updateMatrixWorld();
      }, 990);
      ctx.loop.addSystem('latk2-lab-cap', () => {
        if (!this.capture || this.clock - this.lastCap < this.everyMs) return;
        this.lastCap = this.clock;
        this.frames.push({ t: Math.round(this.clock - this.t0), url: ctx.three.renderer.domElement.toDataURL('image/jpeg', 0.8) });
      }, 1001);
    },
    reset(actor) {
      const F = window.__fighters;
      const ctx = F.ctx;
      this.motion = null;
      for (const p of [0, 1]) {
        F.lab.pos[p] = null; F.lab.charge[p] = null; F.lab.flying[p] = null; F.blockOn[p] = false;
        const r = F.rigs[p];
        if (r) { r.body.teeter = false; r.body.outcome = null; r.body.upper = null; r.body.spinRate = 0; r.body.spinAngle = 0; r.animator.stopUpper(0.01); r.animator.play('idle', { fade: 0.01 }); }
        ctx.state.players[p].onLedge = false;
      }
      this.cam.actor = actor;
    },
    weaponOf(p, category) {
      const ps = window.__fighters.ctx.state.players[p];
      const w = ps.weapons.find((x) => x.category === category) ?? ps.weapons[0];
      return w.category === category ? w : { ...w, category };
    },
    // Déplacement simulé de l'acteur (position imposée) : course, pas chassés, recul.
    move(actor, kind) {
      const F = window.__fighters;
      const start = F.ctx.state.players[actor].pos.slice();
      const opp = F.ctx.state.players[1 - actor].pos;
      const dx = opp[0] - start[0], dz = opp[2] - start[2], d = Math.hypot(dx, dz) || 1;
      const fx = dx / d, fz = dz / d;
      const speed = kind === 'back' ? 3 : 6.5;
      let dir = null;
      if (kind === 'run') dir = [-fz, fx]; // course de côté par rapport à l'adversaire (visée verrouillée pendant la charge)
      if (kind === 'strafe') dir = [fz, -fx];
      if (kind === 'back') dir = [-fx, -fz];
      if (!dir) { F.lab.pos[actor] = start; return; }
      let t = 0;
      const pos = start.slice();
      F.lab.pos[actor] = pos;
      this.motion = { step: (dt) => { t += dt; pos[0] = start[0] + dir[0] * speed * t; pos[2] = start[2] + dir[1] * speed * t; } };
    },
    act(actor, action, arg) {
      const F = window.__fighters;
      const ctx = F.ctx;
      const ps = ctx.state.players[actor];
      const rig = F.rigs[actor];
      switch (action) {
        case 'charge': {
          const w = this.weaponOf(actor, arg);
          if (!ps.weapons.includes(w)) ps.weapons[ps.selected] = w; // arme recopiée : c'est elle que le perso tient
          ps.selected = ps.weapons.indexOf(w);
          const t0 = this.clock;
          F.lab.charge[actor] = 0.05;
          const self = this;
          const prev = this.motion;
          this.motion = { step: (dt) => { prev?.step(dt); if (F.lab.charge[actor] !== null && F.lab.charge[actor] > 0) F.lab.charge[actor] = Math.min(1, 0.05 + (self.clock - t0) / 600); } };
          this.chargeWeapon = w;
          break;
        }
        case 'fire': {
          const w = this.chargeWeapon ?? this.weaponOf(actor, arg);
          F.lab.charge[actor] = 0;
          ctx.bus.emit('fire', { player: actor, weapon: w, dir: [0, 0, 1], power: 1 });
          if (arg === 'blaster') ctx.bus.emit('projectile:spawn', { id: 'lab', weapon: w, from: ps.pos, vel: [0, 0, 1] });
          break;
        }
        case 'shot': ctx.bus.emit('projectile:spawn', { id: 'lab', weapon: this.chargeWeapon, from: ps.pos, vel: [0, 0, 1] }); break;
        case 'block': ctx.bus.emit('block', { player: actor, on: arg }); break;
        case 'parry': ctx.bus.emit('parry:result', { player: actor, grade: arg, deltaMs: 0 }); break;
        case 'hit': F.fakeHit(actor, arg === 'front', 3); break;
        case 'eject': {
          F.lab.flying[actor] = true;
          const start = ps.pos.slice();
          const pos = start.slice();
          F.lab.pos[actor] = pos;
          const opp = ctx.state.players[1 - actor].pos;
          const dx = start[0] - opp[0], dz = start[2] - opp[2], d = Math.hypot(dx, dz) || 1;
          let t = 0;
          this.motion = { step: (dt) => {
            t += dt;
            const T = 1.1;
            const u = Math.min(t, T);
            pos[0] = start[0] + (dx / d) * 9 * u; pos[2] = start[2] + (dz / d) * 9 * u;
            pos[1] = start[1] + 8 * u - 7.3 * u * u;
            if (t >= T) F.lab.flying[actor] = false;
          } };
          F.fakeHit(actor, true, 14);
          break;
        }
        case 'doublejump': {
          const start = ps.pos.slice();
          const pos = start.slice();
          F.lab.pos[actor] = pos;
          let t = 0, second = false;
          this.motion = { step: (dt) => {
            t += dt;
            if (!second && t > 0.3) { second = true; ctx.bus.emit('move:jump', { player: actor }); }
            const h = t < 0.3 ? 7 * t - 10 * t * t : Math.max(0, (7 * 0.3 - 10 * 0.09) + 6 * (t - 0.3) - 10 * (t - 0.3) ** 2);
            pos[1] = start[1] + Math.max(0, h);
          } };
          ctx.bus.emit('move:jump', { player: actor });
          break;
        }
        case 'ledge': {
          const start = ps.pos.slice();
          F.lab.pos[actor] = [start[0], start[1] - 1.3, start[2]];
          ps.onLedge = true;
          ctx.bus.emit('ledge:grab', { player: actor, pos: start });
          this.ledgeTop = start;
          break;
        }
        case 'climb': {
          ps.onLedge = false;
          F.lab.pos[actor] = this.ledgeTop;
          ctx.bus.emit('ledge:climb', { player: actor });
          break;
        }
        case 'teeter': ctx.bus.emit('teeter', { player: actor, on: true }); break;
        case 'clip': rig.animator.play(arg, { loop: false, fade: 0.01 }); rig.animator.proc.lookWeight = 0; break;
        case 'victory': ctx.bus.emit('match:end', { winner: actor }); break;
        case 'respawn': {
          const p0 = ps.pos.slice();
          const pos = [p0[0], p0[1] + 3, p0[2]];
          F.lab.pos[actor] = pos;
          ctx.bus.emit('respawn', { player: actor, pos: pos.slice() });
          let t = 0;
          this.motion = { step: (dt) => { t += dt; if (t > 0.5) pos[1] = Math.max(p0[1], p0[1] + 3 - 10 * (t - 0.5) ** 2 * 1.6); } };
          break;
        }
      }
    },
  };
});

// Match + attente des persos et du pack d'animations.
await page.evaluate(() => window.gameHooks.startMatch({ seed: 1234 }));
await page.waitForFunction(() => {
  const F = window.__fighters;
  return F && F.rigs[0] && F.rigs[1] && F.packData() && F.rigs[0].animator.has('throwP');
}, null, { timeout: 30000 });
await page.waitForTimeout(2500); // bandeau de début de tour
// Gel du gameplay (pas de tir automatique ni de tour qui passe) : phase inerte, seuls les persos bougent.
await page.evaluate(() => { window.__lab.install(); window.__fighters.ctx.state.phase = 'resolve'; });

async function planche(name, frames) {
  const cols = Math.min(6, frames.length);
  const url = await page.evaluate(async ({ frames, name, cols }) => {
    const w = 320, h = 180, lab = 18, head = 26, pad = 3;
    const rows = Math.ceil(frames.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * (w + pad) + pad; c.height = head + rows * (h + lab + pad) + pad;
    const g = c.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#eee'; g.font = 'bold 15px sans-serif'; g.fillText(name, 8, 18);
    for (let i = 0; i < frames.length; i++) {
      const img = new Image(); img.src = frames[i].url; await img.decode();
      const x = pad + (i % cols) * (w + pad), y = head + Math.floor(i / cols) * (h + lab + pad);
      g.drawImage(img, x, y, w, h);
      g.fillStyle = '#7CFC7C'; g.font = '11px monospace'; g.fillText(`#${i + 1} ${frames[i].t} ms`, x + 4, y + h + 13);
    }
    return c.toDataURL('image/png');
  }, { frames, name, cols });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}

const recap = [];
for (const sc of SCENARIOS) {
  for (const view of VIEWS) {
    const label = `${sc.name}-${view}`;
    await page.evaluate(({ actor, view, move }) => {
      const L = window.__lab;
      L.reset(actor);
      L.cam.view = view;
      L.frames = [];
      L.chargeWeapon = null;
      L.move(actor, move);
    }, { actor: sc.actor, view, move: sc.move });
    await page.evaluate(() => { window.__lab.t0 = window.__lab.clock; });
    await page.waitForFunction(() => window.__lab.clock - window.__lab.t0 >= 400, null, { timeout: 60000, polling: 20 }); // fondus de remise à zéro
    await page.evaluate(() => { const L = window.__lab; L.t0 = L.clock; L.lastCap = -1e9; L.capture = true; });
    // Étapes, en temps de jeu.
    const until = (ms) => page.waitForFunction((ms) => window.__lab.clock - window.__lab.t0 >= ms, ms, { timeout: 120000, polling: 10 });
    for (const [at, action, arg] of sc.steps) {
      await until(at);
      await page.evaluate(({ actor, action, arg }) => window.__lab.act(actor, action, arg), { actor: sc.actor, action, arg });
    }
    await until(sc.ms);
    const frames = await page.evaluate(() => { const L = window.__lab; L.capture = false; return L.frames; });
    await planche(label, frames);
    if (FFMPEG && frames.length > 3) {
      const dir = `${OUT}/frames/${label}`;
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      frames.forEach((f, i) => writeFileSync(`${dir}/${String(i).padStart(3, '0')}.jpg`, Buffer.from(f.url.split(',')[1], 'base64')));
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', `${dir}/%03d.jpg`,
        '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-pix_fmt', 'yuv420p', `${OUT_VIDEO}/${label}.webm`]);
      if (r.status !== 0) console.log(`  ffmpeg : échec (${r.stderr?.toString().slice(0, 200)})`);
      rmSync(dir, { recursive: true, force: true });
      notesVideo.push({ name: label, player: sc.actor, camera: view === '34' ? 'vue 3/4 avant' : view === 'cote' ? 'profil' : 'vue du défenseur (derrière l\'adversaire)', note: NOTES[sc.name] ?? sc.name });
    }
    const pick = frames.filter((_, i) => i % Math.max(1, Math.floor(frames.length / 6)) === 0).slice(0, 6);
    recap.push(...pick.map((f) => ({ ...f, t: `${sc.name} ${view} ${f.t}` })));
    console.log(`${label} : ${frames.length} images`);
  }
}
if (recap.length) await planche(VIEWS.length === 1 && VIEWS[0] !== '34' ? `recap-${VIEWS[0]}` : 'recap', recap);
if (notesVideo.length) writeFileSync(`${OUT_VIDEO}/notes.json`, JSON.stringify(notesVideo, null, 2));
if (errors.length) console.log(`Erreurs console (${errors.length}) : ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
await browser.close();
