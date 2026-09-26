// Labo du scan (lot LSCAN, demande d'Adem : « aucun visu sur le scan »), page public/scan-lab.html en `npm run dev`.
// Une photo (dépôt, fichier ou webcam) passe par les VRAIS /api/scan-object et /api/sticker ; on voit la photo, le
// JSON de Gemini (proposition brute de physique et physique arbitrée), les stats dérivées, les réglages de jeu
// (src/gameplay/physics-feel.ts), le sticker détouré, l'objet 3D qui tourne et un lancer simulé contre un mannequin
// avec les vraies formules (dégâts, recul, vitesse, portée, recharge). Deux emplacements pour comparer.
// Outil de développement : jamais montré en démo, pas de tokens d'interface ici.
import * as THREE from 'three';
import { STAT_NAMES, type Category, type Weapon } from '../../core/types';
import { damagePct, flatAirDistance, launchSpeed, NO_MODS } from '../../gameplay/formulas';
import { physicsFeel, type PhysicsFeel } from '../../gameplay/physics-feel';
import { RT } from '../../gameplay/tuning';
import { makeSticker } from '../../scene/sticker';
import { detourSticker } from '../../ui/sticker2d';
import { toResizedJpegBase64 } from '../image';
import { clampPhysics } from '../physics';
import { clampCategory, clampLines, clampObject, clampPalette, clampTrait, clampWeaponName, clampWhy } from '../sanitize';

interface LabScan {
  id: number;
  photoUrl: string;
  status: string;
  weapon?: Weapon;
  json?: Record<string, unknown>;
  jsonMs?: number;
  stickerMs?: number;
  stickerUrl?: string | null;
  cutUrl?: string | null;
}

const history: LabScan[] = [];
const slots: [LabScan | null, LabScan | null] = [null, null];
let seq = 0;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function post(name: string, body: object): Promise<{ ms: number; json: Record<string, unknown> | null }> {
  const t0 = performance.now();
  try {
    const res = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ms: Math.round(performance.now() - t0), json: res.ok ? await res.json() : { error: `${res.status} ${await res.text()}` } };
  } catch (e) {
    return { ms: Math.round(performance.now() - t0), json: { error: String(e) } };
  }
}

function toWeapon(j: Record<string, unknown>): Weapon {
  const category = clampCategory(j.category);
  const object = clampObject(j.object);
  return {
    id: `lab-${seq}`, object, name: clampWeaponName(j.weaponName), category, why: clampWhy(j.why),
    stats: (j.stats as Weapon['stats']) ?? { a: 3, b: 3, c: 4 }, trait: clampTrait(j.trait), palette: clampPalette(j.palette),
    lines: clampLines(j.lines), physics: clampPhysics(j.physics, category, object), source: 'scan', cooldown: 0,
  };
}

async function scan(blob: Blob): Promise<void> {
  const s: LabScan = { id: ++seq, photoUrl: URL.createObjectURL(blob), status: 'Reading the photo…' };
  history.unshift(s);
  history.length = Math.min(history.length, 12);
  slots[1] = slots[0];
  slots[0] = s;
  renderAll();
  const { base64, mimeType } = await toResizedJpegBase64(blob);
  const body = { imageBase64: base64, mimeType };
  const sticker = post('sticker', body).then(async ({ ms, json }) => {
    s.stickerMs = ms;
    s.stickerUrl = (json?.dataUrl as string) ?? null;
    s.cutUrl = s.stickerUrl ? await detourSticker(s.stickerUrl) : null;
    s.status = s.stickerUrl ? '' : `Sticker failed (${(json?.reason as string) ?? (json?.error as string) ?? '?'})`;
    renderAll();
  });
  const { ms, json } = await post('scan-object', body);
  s.jsonMs = ms;
  s.json = json ?? {};
  if (json && !json.error) {
    s.weapon = toWeapon(json);
    s.status = 'Drawing the sticker…';
  } else s.status = `Scan failed: ${String(json?.error)}`;
  renderAll();
  await sticker;
}

// ---------- Rendu d'un emplacement ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function bar(label: string, value: number, max: number, shown = value.toFixed(2), color?: string): HTMLDivElement {
  const row = el('div', 'bar');
  const track = el('div', 'track');
  const fill = el('i');
  fill.style.width = `${Math.max(3, Math.min(100, (100 * value) / max))}%`;
  if (color) fill.style.background = color;
  track.append(fill);
  row.append(el('span', '', label), track, el('b', '', shown));
  return row;
}

const cleanups: [(() => void) | null, (() => void) | null] = [null, null];

function renderSlot(i: 0 | 1): void {
  cleanups[i]?.();
  cleanups[i] = null;
  const root = $(`slot${i}`);
  root.replaceChildren();
  const s = slots[i];
  if (!s) {
    root.append(el('p', 'sub', i === 0 ? 'Drop a photo to start.' : 'The previous scan lands here for comparison.'));
    return;
  }
  const w = s.weapon;
  root.append(el('h2', '', w ? w.name : `Scan #${s.id}`));
  const sub = el('p', 'sub');
  if (w) {
    sub.append(el('span', 'tag', w.category), el('span', 'tag', w.trait), `from: ${w.object}`);
  }
  sub.append(`  ·  JSON ${s.jsonMs ?? '…'} ms  ·  sticker ${s.stickerMs ?? '…'} ms`);
  root.append(sub);
  if (s.status) root.append(el('p', s.status.includes('failed') ? 'err' : 'status', s.status));

  const vis = el('div', 'vis');
  const photo = el('img');
  photo.src = s.photoUrl;
  const cut = el('img');
  if (s.cutUrl) cut.src = s.cutUrl;
  const three = el('canvas');
  vis.append(photo, cut, three);
  root.append(vis);
  if (!w) return;

  const ph = w.physics!;
  const feel = physicsFeel(w);
  const cols = el('div', 'cols');
  const left = el('div');
  const t = el('table');
  const raw = (s.json?.geminiPhysics ?? {}) as Record<string, unknown>;
  const rows: [string, string][] = [
    ['mass', `${ph.massKg} kg  (Gemini: ${raw.massKg ?? '?'} kg, ${raw.physicsConfidence ?? '?'})`],
    ['size h×w×d', `${ph.sizeM.map((v) => v.toFixed(2)).join(' × ')} m`],
    ['material', ph.material],
    ['shape', ph.shape],
    ['bounciness', String(ph.bounciness)],
    ['fragile / liquid', `${ph.fragile ? 'fragile' : '—'} / ${ph.liquid ? 'liquid' : '—'}`],
  ];
  for (const [k, v] of rows) {
    const tr = el('tr');
    tr.append(el('td', '', k), el('td', '', v));
    t.append(tr);
  }
  left.append(t);
  const names = STAT_NAMES[w.category];
  const statsBox = el('div');
  statsBox.append(el('p', 'sub', 'Stats (10-point budget, derived from physics)'));
  statsBox.append(bar(names[0], w.stats.a, 6, String(w.stats.a)), bar(names[1], w.stats.b, 6, String(w.stats.b)), bar(names[2], w.stats.c, 6, String(w.stats.c)));
  left.append(statsBox);
  const right = el('div');
  right.append(el('p', 'sub', 'In-game feel (physics-feel.ts, 1 = average object)'));
  right.append(
    bar('damage ×', feel.damageMult, 1.7, undefined, '#c0392b'),
    bar('knockback ×', feel.launchMult, 1.8, undefined, '#8e44ad'),
    bar('speed ×', feel.speedMult, 1.4, undefined, '#2e86de'),
    bar('range ×', feel.rangeMult, 1.3, undefined, '#16a085'),
    bar('cooldown ×', feel.cooldownMult, 1.9, undefined, '#7f8c8d'),
    bar('bounces', feel.bounces, 3, String(feel.bounces), '#f39c12'),
  );
  cols.append(left, right);
  root.append(cols);

  const sim = el('canvas', 'sim');
  sim.width = 640;
  sim.height = 230;
  const nums = el('div', 'nums');
  root.append(sim, nums);
  const details = el('details');
  details.append(el('summary', '', 'Gemini JSON (as returned by /api/scan-object)'), el('pre', '', JSON.stringify(s.json, null, 2)));
  root.append(details);

  const stops: (() => void)[] = [];
  stops.push(runSim(sim, nums, w, feel, s.cutUrl ?? null));
  if (s.stickerUrl) void spin3D(three, s.stickerUrl).then((stop) => stops.push(stop));
  cleanups[i] = () => stops.forEach((f) => f());
}

function renderAll(): void {
  renderSlot(0);
  renderSlot(1);
  const h = $('history');
  h.replaceChildren();
  for (const s of history) {
    const card = el('div', 'h');
    const img = el('img');
    img.src = s.photoUrl;
    card.append(img, el('div', '', s.weapon ? `${s.weapon.object} · ${s.weapon.physics?.massKg} kg` : `#${s.id}…`));
    card.title = 'Compare with the left slot';
    card.addEventListener('click', () => {
      slots[1] = s;
      renderSlot(1);
    });
    h.append(card);
  }
}

// ---------- Objet 3D qui tourne (sticker extrudé du jeu, src/scene/sticker) ----------

async function spin3D(canvas: HTMLCanvasElement, url: string): Promise<() => void> {
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 150;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x886644, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 50);
  camera.position.set(0, 0.25, 2.4);
  camera.lookAt(0, 0, 0);
  const group = await makeSticker(url, { height: 1 });
  scene.add(group);
  let raf = 0;
  const t0 = performance.now();
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    group.rotation.y = t * 0.9;
    group.rotation.x = Math.sin(t * 0.7) * 0.15;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    renderer.dispose();
  };
}

// ---------- Lancer simulé contre un mannequin, formules du jeu ----------

const DUMMY_X = 9; // m ; le lanceur est à x = 1 (8 m de distance)
const HAND_Y = 1.3;
const PCT_BEFORE = 60; // le mannequin a déjà 60 % : le recul se lit mieux

interface Shot { path: (t: number) => [number, number]; duration: number; hits: boolean; landX: number }

function planShot(cat: Category, feel: PhysicsFeel): Shot {
  const D = DUMMY_X - 1;
  if (cat === 'blaster' || cat === 'shield') {
    const v = RT.speed.blaster * feel.speedMult;
    return { path: (t) => [1 + v * t, HAND_Y], duration: D / v, hits: cat === 'blaster', landX: DUMMY_X };
  }
  if (cat === 'grenade') {
    const range = RT.grenadeBaseRange * feel.rangeMult;
    const dist = Math.min(D, range);
    const T = Math.min(RT.grenadeFlight.max, RT.grenadeFlight.min + dist * RT.grenadeFlight.perM);
    const g = RT.grenadeGravity * feel.lobGravityMult;
    const vx = dist / T;
    const vy = (g * T) / 2 - HAND_Y / T + 0.9 / T; // retombe vers le torse du mannequin (0,9 m)
    return { path: (t) => [1 + vx * t, HAND_Y + vy * t - (g * t * t) / 2], duration: T, hits: dist >= D - 0.3, landX: 1 + dist };
  }
  // throwable : lancer tendu ; un objet lourd a sa propre gravité et peut retomber court (relèvement max).
  const v = RT.speed.throwable * feel.speedMult;
  const g = feel.throwGravity;
  if (g <= 0.01) return { path: (t) => [1 + v * t, HAND_Y], duration: D / v, hits: true, landX: DUMMY_X };
  const need = (g * D) / (v * v);
  const maxEl = (RT.throwMaxElevationDeg * Math.PI) / 180;
  const el = need <= Math.sin(2 * maxEl) ? 0.5 * Math.asin(need) : maxEl;
  const vx = v * Math.cos(el);
  const vy = v * Math.sin(el);
  const tLand = (vy + Math.sqrt(vy * vy + 2 * g * HAND_Y)) / g;
  const reach = vx * tLand;
  const hits = reach >= D - 0.2;
  const duration = hits ? D / vx : tLand;
  return { path: (t) => [1 + vx * t, HAND_Y + vy * t - (g * t * t) / 2], duration, hits, landX: 1 + Math.min(D, reach) };
}

function runSim(canvas: HTMLCanvasElement, nums: HTMLElement, w: Weapon, feel: PhysicsFeel, cutUrl: string | null): () => void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const S = W / 12; // px par mètre (12 m visibles)
  const ground = H - 24;
  const X = (m: number) => m * S;
  const Y = (m: number) => ground - m * S;
  const shot = planShot(w.category, feel);
  const shots = w.category === 'blaster' ? RT.blasterShots : 1;
  const mods = { ...NO_MODS, charge: 0.5, burst: shots, massDamage: feel.damageMult, massLaunch: feel.launchMult };
  const dmgOne = damagePct(w, 5, mods, 1);
  const dmg = shot.hits ? dmgOne * shots : 0;
  const push = shot.hits ? flatAirDistance(launchSpeed(w, PCT_BEFORE + dmg, mods)) : 0;
  const cooldown = RT.cooldownS[w.category] * feel.cooldownMult;
  nums.replaceChildren();
  const num = (k: string, v: string) => {
    const sp = el('span', '', `${k} `);
    sp.append(el('b', '', v));
    nums.append(sp);
  };
  if (w.category === 'shield') {
    num('shield', `wall ${Math.max(...feel.sizeM).toFixed(2)} m, lasts ${RT.shieldLifeS} s`);
  } else {
    num('damage', shot.hits ? `${dmg}%${shots > 1 ? ` (${shots}×${dmgOne})` : ''}` : 'missed (fell short)');
    num('knockback', `${push.toFixed(1)} m at ${PCT_BEFORE}%`);
    num('flight', `${shot.duration.toFixed(2)} s`);
  }
  num('cooldown', `${cooldown.toFixed(1)} s`);
  num('mass', `${feel.massKg} kg`);

  const img = new Image();
  if (cutUrl) img.src = cutUrl;
  const size = Math.max(...feel.sizeM);
  const drawObject = (x: number, y: number, rot: number) => {
    const px = Math.max(6, size * S);
    g.save();
    g.translate(X(x), Y(y));
    g.rotate(rot);
    if (img.complete && img.naturalWidth) {
      const r = img.naturalWidth / img.naturalHeight;
      const pw = r >= 1 ? px : px * r;
      const phh = r >= 1 ? px / r : px;
      g.drawImage(img, -pw / 2, -phh / 2, pw, phh);
    } else {
      g.fillStyle = w.palette[0];
      g.beginPath();
      g.arc(0, 0, px / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  const person = (x: number, color: string, lean = 0) => {
    g.save();
    g.translate(X(x), Y(0));
    g.rotate(lean);
    g.fillStyle = color;
    g.fillRect(-0.18 * S, -1.45 * S, 0.36 * S, 1.45 * S);
    g.beginPath();
    g.arc(0, -1.62 * S, 0.17 * S, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  let raf = 0;
  const t0 = performance.now();
  const CYCLE = shot.duration + 2.2;
  const spin = feel.material ? { long: 12, flat: 8, round: 6, box: 4, irregular: 5 }[w.physics?.shape ?? 'box'] : 0;
  const frame = () => {
    const t = ((performance.now() - t0) / 1000) % CYCLE;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#e9dcc3';
    g.fillRect(0, ground, W, H - ground);
    g.fillStyle = '#8a7a66';
    for (let m = 0; m <= 12; m += 2) g.fillText(`${m} m`, X(m) + 2, H - 8);
    person(1, '#e0662b');
    // Mannequin : recule après l'impact, en ease-out, de la distance d'éjection du jeu.
    const after = Math.max(0, t - shot.duration);
    const k = shot.hits ? 1 - Math.pow(1 - Math.min(1, after / 0.6), 3) : 0;
    const dx = Math.min(push, 12 - DUMMY_X - 0.3) * k;
    person(DUMMY_X + dx, '#3a7bd5', k * 0.35);
    if (w.category === 'shield') {
      g.fillStyle = 'rgba(224,102,43,.5)';
      g.fillRect(X(1.6), Y(Math.min(2.2, size + 0.2)), 0.12 * S, Math.min(2.2, size + 0.2) * S);
    }
    if (w.category !== 'shield' && t <= shot.duration) {
      for (let b = 0; b < shots; b++) {
        const tb = t - b * RT.blasterIntervalS;
        if (tb < 0) continue;
        const [x, y] = shot.path(Math.min(tb, shot.duration));
        drawObject(x, Math.max(0.05, y), tb * spin);
      }
    } else if (w.category !== 'shield' && !shot.hits) {
      drawObject(shot.landX, 0.08, 0);
    }
    if (shot.hits && after > 0 && after < 0.8 && w.category !== 'shield') {
      g.fillStyle = '#c0392b';
      g.font = 'bold 20px system-ui';
      g.fillText(`${dmg}%`, X(DUMMY_X + dx) - 14, Y(2.1) - after * 30);
      g.font = '12px system-ui';
    }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => cancelAnimationFrame(raf);
}

// ---------- Entrées : dépôt, fichier, webcam ----------

const drop = $('drop');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.style.display = 'block';
});
window.addEventListener('dragleave', () => (drop.style.display = 'none'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.style.display = 'none';
  const f = e.dataTransfer?.files?.[0];
  if (f && f.type.startsWith('image/')) void scan(f);
});
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void scan(f);
});
const video = $<HTMLVideoElement>('cam');
$('camBtn').addEventListener('click', async () => {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    video.style.display = 'block';
    $('snap').hidden = false;
  } catch (e) {
    alert(`Camera unavailable: ${String(e)}`);
  }
});
$('snap').addEventListener('click', () => {
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d')!.drawImage(video, 0, 0);
  c.toBlob((b) => b && void scan(b), 'image/jpeg', 0.9);
});

/** Pont de test : window.labScan('/chemin/photo.jpg'). */
(window as unknown as { labScan: (url: string) => Promise<void> }).labScan = async (url: string) => scan(await (await fetch(url)).blob());
renderAll();
