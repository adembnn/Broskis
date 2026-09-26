// Impacts des objets-armes : explosion de grenade (flash, bouffées aux couleurs de l'objet, anneau au sol AU
// RAYON RÉEL, éclats, fumée, trace, BOOM), impact de throwable (anneau de poussière, fissure, WHAM), étincelles,
// ondes sonores, flaque, éclaboussure. Tout en pools fixes (InstancedMesh / ParticleBurstSystem) : aucune
// allocation par image une fois lancé ; 300 particules au plus pour tout le lot.
import * as THREE from 'three';
import { palette, polices, rendu, ui } from '../../art/tokens.js';
import { TEXTURE_VIDE } from '../../core/shaders';
import type { Ctx, Material, PlayerId } from '../../core/types';
import { cameraShake } from '../api';
import { ParticleBurstSystem } from '../fx/particles';
import { excludeFromOcclusion } from '../registry';
import { WEAPON_FX } from './tokens';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function easeOutBack(t: number): number {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// ---------------------------------------------------------------------------
// Textures dessinées (canvas) : trace de brûlure, fissure, flaque, éclaboussure, mot.
// ---------------------------------------------------------------------------
function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blobPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, lobes: number, jitter: number, seed: number): void {
  c.beginPath();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + jitter * Math.sin(a * lobes + seed) * Math.cos(a * (lobes - 2) + seed * 1.7);
    const x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

const scorchTex = () => canvasTexture(256, (c, s) => {
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(43,29,20,0.85)');
  g.addColorStop(0.55, 'rgba(43,29,20,0.55)');
  g.addColorStop(1, 'rgba(43,29,20,0)');
  c.fillStyle = g;
  blobPath(c, s / 2, s / 2, s * 0.46, 7, 0.12, 1.3);
  c.fill();
});

const crackTex = () => canvasTexture(256, (c, s) => {
  c.strokeStyle = rendu.contour.encre;
  c.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4 * Math.sin(i * 3.1);
    let x = s / 2, y = s / 2;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 1; k <= 4; k++) {
      const r = (s * 0.46 * k) / 4;
      x = s / 2 + Math.cos(a + 0.25 * Math.sin(k * 2.3 + i)) * r;
      y = s / 2 + Math.sin(a + 0.25 * Math.sin(k * 2.3 + i)) * r;
      c.lineTo(x, y);
      c.lineWidth = 9 - k * 1.8;
    }
    c.stroke();
  }
});

function puddleTex(color: string): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = color;
    blobPath(c, s / 2, s / 2, s * 0.4, 5, 0.16, 2.1);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = rendu.contour.encre;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.75)'; // reflet luisant
    c.beginPath(); c.ellipse(s * 0.38, s * 0.38, s * 0.12, s * 0.05, -0.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(s * 0.58, s * 0.62, s * 0.05, s * 0.02, -0.6, 0, Math.PI * 2); c.fill();
  });
}

function splatTex(color: string): THREE.CanvasTexture {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = color;
    c.strokeStyle = rendu.contour.encre;
    c.lineWidth = 7;
    blobPath(c, s / 2, s / 2, s * 0.28, 9, 0.28, 0.7);
    c.fill(); c.stroke();
    for (let i = 0; i < 9; i++) { // gouttes projetées
      const a = i * 2.3, r = s * (0.34 + 0.1 * Math.sin(i * 5.7));
      c.beginPath();
      c.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * (0.025 + 0.02 * ((i * 7) % 3)), 0, Math.PI * 2);
      c.fill(); c.stroke();
    }
  });
}

const wordCache = new Map<string, THREE.CanvasTexture>();
function wordTex(word: string, color: string): THREE.CanvasTexture {
  const key = `${word}|${color}`;
  let t = wordCache.get(key);
  if (t) return t;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  const size = Math.round(Math.min(170, 1300 / Math.max(3, word.length)));
  c.font = `400 ${size}px ${polices.titre}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.translate(256, 132);
  c.rotate(-0.08);
  c.lineWidth = size * 0.34; c.strokeStyle = rendu.contour.vinyle; c.strokeText(word, 0, 0);
  c.lineWidth = size * 0.16; c.strokeStyle = rendu.contour.encre; c.strokeText(word, 0, 0);
  c.fillStyle = color; c.fillText(word, 0, 0);
  t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  wordCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------
interface Timed { t: number; dur: number; active: boolean }
interface Ring extends Timed { mesh: THREE.Mesh; fill: THREE.Mesh; radius: number; hold: number }
interface Decal extends Timed { mesh: THREE.Mesh; fadeFrom: number }
interface Flash extends Timed { mesh: THREE.Mesh; radius: number }
interface Word extends Timed { sprite: THREE.Sprite; size: number; viewer: PlayerId | null; alpha: number }
interface Wave extends Timed { mesh: THREE.Mesh; radius: number }
interface Puff { active: boolean; t: number; dur: number; pos: THREE.Vector3; size: number; rise: number; delay: number; c0: THREE.Color; c1: THREE.Color }
interface Shard { active: boolean; t: number; life: number; pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; ground: number; scale: THREE.Vector3; gravity: number; drag: number }

/** Forme des éclats : morceau, écharde (bois), confetti (papier, voile de verre). */
export type ShardForm = 'chunk' | 'splinter' | 'flake';

/** `viewer` : joueur dont la vue affiche le mot (le tireur) ; absent = toutes les vues. */
export interface BoomOptions { big?: boolean; air?: boolean; word?: boolean; viewer?: PlayerId }

/** Ce qu'un objet réel fait en touchant quelque chose : poids (0..1) et matière (contrat WeaponPhysics). */
export interface ObjectHit { colors: [string, string]; weight: number; size: number; material: Material; fragile: boolean; liquid: boolean; viewer?: PlayerId }

export interface BlastFx {
  /** Explosion au rayon réel `radius` (m) centrée sur `pos` (au sol, sauf `air`). */
  explosion(pos: THREE.Vector3, radius: number, colors: [string, string], opts?: BoomOptions): void;
  /** Impact d'un objet lancé : force selon son poids, effet selon sa matière. */
  objectHit(pos: THREE.Vector3, ground: number, o: ObjectHit): void;
  /** Signature de matière seule (grenade qui explose : le verre se brise, le liquide gicle…). */
  materialBurst(pos: THREE.Vector3, ground: number, o: ObjectHit, k?: number): void;
  /** Petit impact de tir (blaster) ou de ricochet. */
  sparks(pos: THREE.Vector3, colors: [string, string], count?: number, dir?: THREE.Vector3 | null): void;
  dust(pos: THREE.Vector3, radius: number, count?: number): void;
  puddle(pos: THREE.Vector3, color: string, radius: number, ms: number): void;
  splat(pos: THREE.Vector3, color: string, radius: number): void;
  soundWaves(pos: THREE.Vector3, color: string): void;
  heal(pos: THREE.Vector3): void;
  word(pos: THREE.Vector3, text: string, color: string, size?: number, viewer?: PlayerId): void;
  flash(pos: THREE.Vector3, radius: number): void;
  fxAdd: ParticleBurstSystem;
  fxNorm: ParticleBurstSystem;
  clear(): void;
  update(dt: number, real: number): void;
}

export function installBlast(ctx: Ctx): BlastFx {
  const { scene, renderer, camera } = ctx.three;
  const root = new THREE.Group();
  root.name = 'latk-impacts';
  scene.add(root);
  excludeFromOcclusion(root);

  const fxAdd = new ParticleBurstSystem(WEAPON_FX.budget.additif, 'additive');
  const fxNorm = new ParticleBurstSystem(WEAPON_FX.budget.normal, 'normal');
  root.add(fxAdd.points, fxNorm.points);
  fxAdd.resize(renderer, camera);
  fxNorm.resize(renderer, camera);
  window.addEventListener('resize', () => { fxAdd.resize(renderer, camera); fxNorm.resize(renderer, camera); });

  const noRay = (o: THREE.Object3D) => { o.raycast = () => {}; return o; };

  // Flash : sphère palette.lumiere (franchit le bloom).
  const flashGeo = new THREE.IcosahedronGeometry(1, 2);
  const flashes: Flash[] = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: palette.lumiere, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    mesh.visible = false; noRay(mesh); root.add(mesh);
    flashes.push({ mesh, t: 0, dur: 0.18, active: false, radius: 1 });
  }

  // Anneau au sol : liseré qui s'étend jusqu'au rayon réel + disque translucide qui montre la zone.
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64, 1);
  const discGeo = new THREE.CircleGeometry(1, 48);
  const rings: Ring[] = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: palette.lumiere, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    for (const m of [mesh, fill]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5; noRay(m); root.add(m); }
    rings.push({ mesh, fill, t: 0, dur: 0.8, active: false, radius: 1, hold: 0.25 });
  }

  // Décalques au sol (trace, fissure, flaque, éclaboussure).
  const decalGeo = new THREE.PlaneGeometry(2, 2);
  const decals: Decal[] = [];
  for (let i = 0; i < 8; i++) {
    // perf : map posée dès la création (LPERF) : le shader « avec image » est compilé par la préchauffe, pas au 1er impact.
    const mesh = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ map: TEXTURE_VIDE, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.renderOrder = 4; noRay(mesh); root.add(mesh);
    decals.push({ mesh, t: 0, dur: 6, active: false, fadeFrom: 0.7 });
  }
  const texScorch = scorchTex();
  const texCrack = crackTex();
  const texPuddle = new Map<string, THREE.CanvasTexture>();
  const texSplat = new Map<string, THREE.CanvasTexture>();

  // Mots (BOOM, WHAM…) : sprites qui claquent puis s'envolent. Écran scindé : le mot est la récompense du TIREUR,
  // il n'apparaît que dans sa vue (jamais un mot géant collé sur la caméra de celui qui se fait toucher).
  const words: Word[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.SpriteMaterial({ map: TEXTURE_VIDE, transparent: true, depthWrite: false, depthTest: false, fog: false }); // vraie couleur de l'objet, même dans la brume ; map : voir décalques (perf)
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false; sprite.renderOrder = 30; noRay(sprite); root.add(sprite);
    const w: Word = { sprite, t: 0, dur: 0.75, active: false, size: 2, viewer: null, alpha: 1 };
    sprite.onBeforeRender = (_r, _s, cam) => {
      const cams = ctx.three.cameras;
      const inOther = !!cams && w.viewer != null && cams[w.viewer] !== cam && (cams[0] === cam || cams[1] === cam);
      mat.opacity = inOther ? 0 : w.alpha;
    };
    words.push(w);
  }

  // Ondes sonores (trait loud) : anneaux face caméra.
  const waves: Wave[] = [];
  const waveGeo = new THREE.RingGeometry(0.86, 1, 40);
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.visible = false; noRay(mesh); root.add(mesh);
    waves.push({ mesh, t: 0, dur: 0.6, active: false, radius: 2 });
  }

  // Bouffées d'explosion (dessin animé) : sphères plates + contour d'encre, 2 draw calls.
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }); // translucide : on voit le perso au travers
  const puffInkMat = new THREE.MeshBasicMaterial({ color: rendu.contour.encre, side: THREE.BackSide });
  const puffN = WEAPON_FX.budget.bouffees;
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, puffN);
  const puffInk = new THREE.InstancedMesh(puffGeo, puffInkMat, puffN);
  for (const m of [puffMesh, puffInk]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; noRay(m); root.add(m); }
  puffMesh.renderOrder = 6; puffInk.renderOrder = 5;
  const puffs: Puff[] = Array.from({ length: puffN }, () => ({ active: false, t: 0, dur: 0.6, pos: new THREE.Vector3(), size: 1, rise: 0, delay: 0, c0: new THREE.Color(), c1: new THREE.Color() }));
  for (let i = 0; i < puffN; i++) puffMesh.setColorAt(i, _c.set('#ffffff'));

  // Éclats aux couleurs de l'objet : tétraèdres qui retombent et rebondissent.
  const shardGeo = new THREE.TetrahedronGeometry(1, 0);
  const shardMat = new THREE.MeshToonMaterial({ color: '#ffffff' });
  const shardN = WEAPON_FX.budget.eclats;
  const shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, shardN);
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shardMesh.frustumCulled = false; shardMesh.count = 0; noRay(shardMesh); root.add(shardMesh);
  const shards: Shard[] = Array.from({ length: shardN }, () => ({ active: false, t: 0, life: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), ground: 0, scale: new THREE.Vector3(), gravity: 18, drag: 0 }));
  for (let i = 0; i < shardN; i++) shardMesh.setColorAt(i, _c.set('#ffffff'));

  function take<T extends { active: boolean }>(pool: T[], older?: (a: T, b: T) => number): T {
    const free = pool.find((e) => !e.active);
    if (free) return free;
    return older ? [...pool].sort(older)[0] : pool[0];
  }

  function flash(pos: THREE.Vector3, radius: number): void {
    const f = take(flashes);
    f.active = true; f.t = 0; f.dur = 0.2; f.radius = radius;
    f.mesh.position.copy(pos); f.mesh.visible = true; f.mesh.scale.setScalar(radius * 0.2);
  }

  function ring(pos: THREE.Vector3, radius: number, edge: string, fillColor: string, hold: number): void {
    const r = take(rings);
    r.active = true; r.t = 0; r.radius = radius; r.hold = hold / 1000; r.dur = 0.22 + r.hold + 0.35;
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(edge);
    (r.fill.material as THREE.MeshBasicMaterial).color.set(fillColor);
    r.mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    r.fill.position.set(pos.x, pos.y + 0.04, pos.z);
    r.mesh.visible = r.fill.visible = true;
  }

  function decal(pos: THREE.Vector3, tex: THREE.Texture, radius: number, dur: number, opacity: number): void {
    const d = take(decals, (a, b) => b.t - a.t);
    d.active = true; d.t = 0; d.dur = dur; d.fadeFrom = opacity;
    const mat = d.mesh.material as THREE.MeshBasicMaterial;
    mat.map = tex; mat.opacity = opacity; mat.needsUpdate = true;
    d.mesh.position.set(pos.x, pos.y + 0.03, pos.z);
    d.mesh.rotation.z = Math.random() * Math.PI * 2;
    d.mesh.scale.setScalar(radius);
    d.mesh.visible = true;
  }

  function word(pos: THREE.Vector3, text: string, color: string, size = 2.2, viewer?: PlayerId): void {
    const w = take(words, (a, b) => b.t - a.t);
    w.active = true; w.t = 0; w.dur = 0.8; w.size = size;
    w.viewer = viewer ?? null;
    // Objet très sombre (téléphone noir…) : le mot prend la couleur claire de sa palette, sinon il disparaît.
    w.sprite.material.map = wordTex(text, _c.set(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.18 ? rendu.contour.vinyle : color); // vinyle : sous le seuil du bloom, reste lisible
    w.sprite.material.needsUpdate = true;
    w.alpha = 1;
    w.sprite.position.copy(pos);
    w.sprite.scale.set(0.01, 0.01, 1);
    w.sprite.visible = true;
  }

  function puffCluster(pos: THREE.Vector3, radius: number, count: number, colors: [string, string]): void {
    for (let k = 0; k < count; k++) {
      const p = puffs.find((e) => !e.active);
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const r = radius * 0.35 * Math.sqrt(Math.random());
      p.active = true; p.t = 0; p.delay = k * 0.018; p.dur = 0.22 + Math.random() * 0.12; // critique AAA 18h21 : à 0,55-0,9 s les bouffées cachaient le perso touché dans sa propre vue
      p.pos.set(pos.x + Math.cos(a) * r, pos.y + 0.2 + Math.random() * radius * 0.35, pos.z + Math.sin(a) * r);
      p.size = radius * (0.22 + Math.random() * 0.16);
      p.rise = 0.6 + Math.random() * 0.9;
      // Du cœur clair (lumière) vers la couleur de l'objet, puis la 2e couleur en fin de vie.
      p.c0.set(k % 3 === 0 ? palette.lumiere : colors[0]);
      p.c1.set(k % 2 === 0 ? colors[1] : colors[0]).lerp(_c.set(rendu.contour.encre), 0.25);
    }
  }

  function shardBurst(pos: THREE.Vector3, count: number, colors: string[], speed: number, size: number, form: ShardForm = 'chunk', ground = pos.y): void {
    for (let k = 0; k < count; k++) {
      const s = shards.find((e) => !e.active);
      if (!s) break;
      const i = shards.indexOf(s);
      const a = Math.random() * Math.PI * 2;
      const up = 0.45 + Math.random() * 0.9;
      const v = speed * (0.5 + Math.random() * 0.7);
      s.active = true; s.t = 0; s.life = (form === 'flake' ? 1.8 : 1.1) + Math.random() * 0.8;
      s.pos.copy(pos).addScaledVector(UP, 0.25);
      s.vel.set(Math.cos(a) * v, up * v, Math.sin(a) * v);
      s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const sp = form === 'flake' ? 8 : 18;
      s.spin.set((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp);
      s.ground = ground;
      const k1 = size * (0.6 + Math.random() * 0.8);
      // Écharde : longue et fine ; confetti : plat et léger (il flotte en retombant).
      if (form === 'splinter') s.scale.set(k1 * 0.35, k1 * 0.35, k1 * 2.6);
      else if (form === 'flake') s.scale.set(k1 * 1.3, k1 * 0.08, k1 * 1.3);
      else s.scale.setScalar(k1);
      s.gravity = form === 'flake' ? 3 : 18;
      s.drag = form === 'flake' ? 2.2 : 0;
      shardMesh.setColorAt(i, _c.set(colors[k % colors.length]));
    }
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  }

  function explosion(pos: THREE.Vector3, radius: number, colors: [string, string], opts: BoomOptions = {}): void {
    const { big = false, air = false, word: withWord = true, viewer } = opts;
    const R = Math.max(1, radius);
    flash(_p.copy(pos).addScaledVector(UP, 0.5), Math.min(1.6, R * WEAPON_FX.boom.flash)); // borné : ne blanchit pas la vue du défenseur
    puffCluster(pos, R, big ? WEAPON_FX.boom.bouffeesExplosive : WEAPON_FX.boom.bouffees, colors);
    if (!air) ring(pos, radius, palette.lumiere, colors[0], WEAPON_FX.boom.anneauTenue);
    shardBurst(pos, WEAPON_FX.boom.eclats + (big ? 8 : 0), [colors[0], colors[1], colors[0], rendu.contour.vinyle], 7 + R * 1.2, 0.09 + R * 0.012);
    fxAdd.burst(_p.copy(pos).addScaledVector(UP, 0.4), { count: big ? 40 : 28, color: [palette.lumiere, colors[0]], speed: [4, 9 + R], life: [0.2, 0.45], size: [0.12, 0.3], gravity: 5, drag: 2.5 });
    fxNorm.burst(_p.copy(pos).addScaledVector(UP, 0.6), { count: big ? 22 : 14, color: [rendu.contour.encre, colors[1], ui.carton], speed: [0.6, 2.2], life: [0.8, 1.5], size: [0.5, 1.1], gravity: -1.4, drag: 1.6 });
    if (!air) decal(pos, texScorch, R * WEAPON_FX.boom.trace, 7, 0.75);
    cameraShake((big ? WEAPON_FX.trauma.boomExplosive : WEAPON_FX.trauma.boom) * (air ? 0.5 : 1));
    if (withWord) word(_p.copy(pos).addScaledVector(UP, 1.6 + R * 0.25), big ? 'KABOOM!' : 'BOOM!', colors[0], big ? 3.2 : 2.6, viewer);
  }

  function dust(pos: THREE.Vector3, radius: number, count = 14): void {
    ring(pos, radius, ui.carton, ui.papier, 60);
    fxNorm.burst(_p.copy(pos).addScaledVector(UP, 0.15), { count, color: [ui.carton, ui.papier], speed: [1.5, 3.5 + radius], life: [0.45, 0.9], size: [0.3, 0.6], gravity: 2.5, drag: 3, direction: UP, spread: 3 });
  }

  /** Signature de la matière (lot « une chaise n'est pas une canette ») ; k = intensité (0..1+). */
  function materialBurst(pos: THREE.Vector3, ground: number, o: ObjectHit, k = 1): void {
    const g = new THREE.Vector3(pos.x, ground, pos.z);
    const [c0, c1] = o.colors;
    const n = (x: number) => Math.max(1, Math.round(x * k));
    if (o.fragile) {
      // Verre, céramique : l'objet se brise en éclats (morceaux à sa couleur + voile clair qui brille).
      shardBurst(pos, n(18), [c0, c1, c0, WEAPON_FX.matiere.verre], 5 + 3 * o.weight, 0.06 + 0.05 * o.size, 'chunk', ground);
      shardBurst(pos, n(8), [WEAPON_FX.matiere.verre, palette.lumiere], 4, 0.05, 'flake', ground);
      fxAdd.burst(pos, { count: n(14), color: [palette.lumiere, WEAPON_FX.matiere.verre], speed: [3, 7], life: [0.1, 0.3], size: [0.06, 0.14], gravity: 8 });
    }
    if (o.liquid) {
      // Giclée de la couleur de l'objet. La flaque, elle, suit `ground:slippery` (rayon et durée du gameplay).
      fxNorm.burst(_p.copy(pos).addScaledVector(UP, 0.1), { count: n(22), color: [c0, c1, c0], speed: [2.5, 6], life: [0.45, 0.8], size: [0.14, 0.3], gravity: 14, drag: 0.6, direction: UP, spread: 1.6 });
      void g;
    }
    switch (o.material) {
      case 'metal':
        fxAdd.burst(pos, { count: n(26), color: [palette.lumiere, palette.danger, c0], speed: [5, 11], life: [0.15, 0.4], size: [0.06, 0.14], gravity: 12, drag: 1 });
        break;
      case 'wood':
        shardBurst(pos, n(12), [WEAPON_FX.matiere.sciure, c0, c1], 5, 0.07 + 0.04 * o.size, 'splinter', ground);
        break;
      case 'fabric':
        puffCluster(pos, 1 + o.size, n(5), [c0, c1]); // bouffée molle, pas d'éclat
        break;
      case 'paper':
        shardBurst(pos, n(22), [c0, c1, palette.matiere, rendu.contour.vinyle], 4, 0.09, 'flake', ground);
        break;
      case 'food':
        splat(g, c0, 0.8 + 0.6 * o.size);
        break;
      case 'stone':
        shardBurst(pos, n(12), [WEAPON_FX.matiere.pierre, c0], 5, 0.09 + 0.05 * o.size, 'chunk', ground);
        fxNorm.burst(pos, { count: n(10), color: [WEAPON_FX.matiere.pierre, ui.carton], speed: [1, 3], life: [0.5, 1], size: [0.3, 0.6], gravity: 1, drag: 2.5 });
        break;
      default: // plastique, caoutchouc : l'objet rebondit (voir flight.ts), quelques éclats de sa couleur
        shardBurst(pos, n(5), [c0, c1], 4, 0.06, 'chunk', ground);
    }
  }

  /** Impact d'un objet : un objet lourd frappe fort (secousse, poussière, fissure, THUD), un léger fait « pop ». */
  function objectHit(pos: THREE.Vector3, ground: number, o: ObjectHit): void {
    const g = new THREE.Vector3(pos.x, ground, pos.z);
    const w = o.weight;
    flash(pos, 0.3 + 0.5 * w);
    fxAdd.burst(pos, { count: Math.round(6 + 14 * w), color: [palette.lumiere, o.colors[0]], speed: [3, 6 + 5 * w], life: [0.12, 0.3], size: [0.08, 0.2], gravity: 4 });
    if (w > 0.25 && pos.y - ground < 2.5) dust(g, 0.8 + 2.2 * w, Math.round(6 + 18 * w));
    if (w > 0.45 && pos.y - ground < 2.5) decal(g, texCrack, WEAPON_FX.wham.fissure * (0.7 + w), 6, 0.8);
    materialBurst(pos, ground, o, 0.7 + 0.6 * w);
    cameraShake(THREE.MathUtils.lerp(WEAPON_FX.trauma.impactLeger, WEAPON_FX.trauma.impactLourd, w));
    const text = o.fragile ? 'CRASH!' : o.liquid ? 'SPLASH!' : o.material === 'metal' ? 'CLANG!' : w > 0.6 ? 'THUD!' : w < 0.25 ? 'POP!' : 'WHAM!';
    word(_p.copy(pos).addScaledVector(UP, 1.1 + 0.4 * w), text, o.colors[0], 1.5 + 1.3 * w, o.viewer);
  }

  function sparks(pos: THREE.Vector3, colors: [string, string], count = 10, dir: THREE.Vector3 | null = null): void {
    fxAdd.burst(pos, { count, color: [palette.lumiere, colors[0]], speed: [3, 8], life: [0.12, 0.3], size: [0.08, 0.18], gravity: 6, direction: dir, spread: dir ? 1.4 : 1 });
  }

  function puddle(pos: THREE.Vector3, color: string, radius: number, ms: number): void {
    let t = texPuddle.get(color);
    if (!t) { t = puddleTex(color); texPuddle.set(color, t); }
    decal(pos, t, radius, ms / 1000 + 0.6, 0.95);
  }

  function splat(pos: THREE.Vector3, color: string, radius: number): void {
    let t = texSplat.get(color);
    if (!t) { t = splatTex(color); texSplat.set(color, t); }
    decal(pos, t, radius, 5, 1);
    fxNorm.burst(_p.copy(pos).addScaledVector(UP, 0.3), { count: 12, color: [color, rendu.contour.encre], speed: [1, 3], life: [0.5, 0.9], size: [0.18, 0.32], gravity: 9, drag: 1 });
  }

  function soundWaves(pos: THREE.Vector3, color: string): void {
    for (let k = 0; k < 3; k++) {
      const w = take(waves, (a, b) => b.t - a.t);
      w.active = true; w.t = -k * 0.12; w.dur = 0.55; w.radius = 1.6 + k * 0.5;
      (w.mesh.material as THREE.MeshBasicMaterial).color.set(k % 2 ? color : rendu.contour.vinyle);
      w.mesh.position.copy(pos);
      w.mesh.visible = false;
    }
  }

  function heal(pos: THREE.Vector3): void {
    fxAdd.burst(_p.copy(pos).addScaledVector(UP, 0.8), { count: 18, color: [WEAPON_FX.soin, palette.lumiere], speed: [0.6, 1.8], life: [0.6, 1.1], size: [0.14, 0.28], gravity: -3, drag: 1.5, direction: UP, spread: 2.5 });
  }

  function clear(): void {
    for (const pool of [flashes, rings, decals, words, waves] as Timed[][]) for (const e of pool) e.active = false;
    for (const f of flashes) f.mesh.visible = false;
    for (const r of rings) r.mesh.visible = r.fill.visible = false;
    for (const d of decals) d.mesh.visible = false;
    for (const w of words) w.sprite.visible = false;
    for (const w of waves) w.mesh.visible = false;
    for (const p of puffs) p.active = false;
    for (const s of shards) s.active = false;
  }

  function update(dt: number, real: number): void {
    fxAdd.update(dt);
    fxNorm.update(dt);
    if (dt <= 0 && real <= 0) return;
    for (const f of flashes) {
      if (!f.active) continue;
      f.t += dt;
      const u = f.t / f.dur;
      if (u >= 1) { f.active = false; f.mesh.visible = false; continue; }
      f.mesh.scale.setScalar(f.radius * (0.25 + 0.75 * Math.min(1, u * 2.5)));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - u * u;
    }
    for (const r of rings) {
      if (!r.active) continue;
      r.t += dt;
      if (r.t >= r.dur) { r.active = false; r.mesh.visible = r.fill.visible = false; continue; }
      const grow = Math.min(1, r.t / 0.22);
      const s = r.radius * (1 - Math.pow(1 - grow, 3));
      r.mesh.scale.setScalar(Math.max(0.01, s));
      r.fill.scale.setScalar(Math.max(0.01, s * 0.95));
      const fade = r.t < 0.22 + r.hold ? 1 : 1 - (r.t - 0.22 - r.hold) / 0.35;
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade;
      (r.fill.material as THREE.MeshBasicMaterial).opacity = 0.28 * fade;
    }
    for (const d of decals) {
      if (!d.active) continue;
      d.t += dt;
      if (d.t >= d.dur) { d.active = false; d.mesh.visible = false; continue; }
      const pop = Math.min(1, d.t / 0.08);
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = d.fadeFrom * pop * Math.min(1, (d.dur - d.t) / 1.2);
    }
    for (const w of words) {
      if (!w.active) continue;
      w.t += real; // lisible même pendant un ralenti
      if (w.t >= w.dur) { w.active = false; w.sprite.visible = false; continue; }
      const u = w.t / w.dur;
      const k = u < 0.18 ? easeOutBack(u / 0.18) : 1 + 0.06 * (u - 0.18);
      w.sprite.scale.set(w.size * 2 * k, w.size * k, 1);
      w.sprite.position.y += real * 0.9;
      w.alpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    }
    for (const w of waves) {
      if (!w.active) continue;
      w.t += dt;
      if (w.t < 0) continue;
      if (w.t >= w.dur) { w.active = false; w.mesh.visible = false; continue; }
      const u = w.t / w.dur;
      w.mesh.visible = true;
      w.mesh.quaternion.copy(camera.quaternion);
      w.mesh.scale.setScalar(0.3 + u * w.radius);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
    }
    // Bouffées
    let n = 0;
    for (const p of puffs) {
      if (!p.active) continue;
      p.t += dt;
      const lt = p.t - p.delay;
      if (lt >= p.dur) { p.active = false; continue; }
      const u = Math.max(0, lt) / p.dur;
      const grow = u < 0.22 ? easeOutBack(u / 0.22) : 1 - Math.pow((u - 0.22) / 0.78, 1.6);
      const s = Math.max(0.001, p.size * grow);
      _p.copy(p.pos).addScaledVector(UP, p.rise * u);
      _m.compose(_p, _q.identity(), _s.setScalar(s));
      puffMesh.setMatrixAt(n, _m);
      _m.compose(_p, _q, _s.setScalar(s * 1.12));
      puffInk.setMatrixAt(n, _m);
      _c.copy(p.c0).lerp(p.c1, Math.min(1, u * 1.6));
      puffMesh.setColorAt(n, _c);
      n++;
    }
    puffMesh.count = puffInk.count = n;
    if (n > 0) {
      puffMesh.instanceMatrix.needsUpdate = true;
      puffInk.instanceMatrix.needsUpdate = true;
      if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
    }
    // Éclats (indice d'instance = indice de pool : la couleur posée au lancer reste valable)
    let alive = 0;
    for (let i = 0; i < shards.length; i++) {
      const s = shards[i];
      if (!s.active) { shardMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      s.t += dt;
      if (s.t >= s.life) { s.active = false; shardMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      s.vel.y -= s.gravity * dt;
      if (s.drag > 0) { const d = Math.exp(-s.drag * dt); s.vel.x *= d; s.vel.z *= d; s.vel.y = Math.max(s.vel.y, -1.2); } // confetti : flotte
      s.pos.addScaledVector(s.vel, dt);
      const half = Math.min(s.scale.x, s.scale.y, s.scale.z) * 0.5;
      if (s.pos.y < s.ground + half) {
        s.pos.y = s.ground + half;
        if (s.vel.y < 0) { s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; s.spin.multiplyScalar(0.5); }
      }
      s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
      const shrink = s.t > s.life - 0.25 ? (s.life - s.t) / 0.25 : 1;
      _m.compose(s.pos, _q.setFromEuler(s.rot), _s.copy(s.scale).multiplyScalar(shrink));
      shardMesh.setMatrixAt(i, _m);
      alive++;
    }
    shardMesh.count = alive > 0 ? shardN : 0;
    shardMesh.instanceMatrix.needsUpdate = true;
  }

  return { explosion, objectHit, materialBurst, sparks, dust, puddle, splat, soundWaves, heal, word, flash, fxAdd, fxNorm, clear, update };
}
