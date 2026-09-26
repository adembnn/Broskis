// Perso photo (lots LP puis LFACE) : tenue de la photo sur le corps KayKit, et GROSSE TÊTE « figurine à ressort »
// en vinyle gonflé : le portrait cartoon du joueur (Nano Banana) bombé vers l'avant, la même tête vue de dos bombée
// vers l'arrière. Tout reste en mémoire : le portrait n'est jamais écrit nulle part.
import * as THREE from 'three';
import type { FighterLook } from '../../core/types';
import { rendu } from '../../art/tokens.js';

/** Réglages de la grosse tête (valeurs visuelles locales au lot, comme scene/localTokens.ts). */
const TETE = {
  /** Hauteur de la grosse tête / hauteur de la tête KayKit d'origine (consigne d'Adem 16h45 : ×1,8 à ×2, goofy). */
  echelle: 1.9,
  /** Part de la grosse tête qui descend sous le cou (le menton couvre le col). */
  menton: 0.04,
  /** Avancée vers l'avant (fraction de la hauteur) : le visage ne rentre pas dans le buste. */
  avance: 0.03,
  /** Vinyle gonflé (plan/recherche/DA-objets-scannes.md §2, en plus rond pour une tête) : bombé de chaque face et
   * distance au bord où il est atteint (fractions de la hauteur), finesse de la grille (rangées). */
  bombe: 0.2,
  rayon: 0.32,
  rangees: 56,
  /** Le visage reste lisible à contre-jour : part d'auto-éclairage du portrait. Faible : au-delà, le bord blanc
   * du sticker passe le seuil du bloom et la tête « brille » à contre-jour (vu en match). */
  emissif: 0.12,
  /** Arrière du crâne : couleur des cheveux, éclaircie jusqu'à cette luminosité (des cheveux noirs faisaient un trou). */
  dosLuminositeMin: 0.3,
  /** Tête à ressort : raideur (1/s²), amorti (1/s), gain (rad par m/s²), inclinaison max (rad). */
  ressort: { raideur: 110, amorti: 7, gain: 0.012, max: 0.42, gainVertical: 0.006, maxVertical: 0.16 },
};

// --- Recoloration fine par bande de teinte (reprise de kaykit.js, valable aussi pour MeshStandardMaterial) ---
const shimmerTime = { value: 0 };

function onBeforeCompileTeinte(shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }, mat: THREE.Material) {
  const u = mat.userData.u;
  Object.assign(shader.uniforms, u, { uTime: shimmerTime });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform vec3 uRecFrom; uniform vec3 uRecTo; uniform vec3 uRec2From; uniform vec3 uTintK; uniform vec3 uTint; uniform vec3 uShimmer; uniform float uTime;
      vec3 kk_rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
        vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10;
        return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
      vec3 kk_hsv2rgb(vec3 c){ vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
      float kk_band(float h, vec3 b){ float d=abs(fract(h-b.x+0.5)-0.5); return 1.0-smoothstep(b.y*0.7,b.y,d); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 hsv = kk_rgb2hsv(diffuseColor.rgb);
        float sat = smoothstep(0.12, 0.3, hsv.y);
        float w = max(kk_band(hsv.x, uRecFrom) * step(0.001, uRecFrom.y), kk_band(hsv.x, uRec2From) * step(0.001, uRec2From.y)) * sat;
        vec3 dst = kk_hsv2rgb(vec3(uRecTo.x, clamp(hsv.y * uRecTo.y, 0., 1.), clamp(hsv.z * uRecTo.z, 0., 1.)));
        diffuseColor.rgb = mix(diffuseColor.rgb, dst, w);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.25 + 0.95 * max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b)), uTintK.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299,0.587,0.114))), uTintK.y);
      }`);
}

interface Teinte { tint?: THREE.ColorRepresentation; tintK?: number; desat?: number }

function teindre(mat: THREE.Material, look: Teinte) {
  if (!mat.userData.u) {
    mat.userData.u = {
      uRecFrom: { value: new THREE.Vector3(0, 0, 0) }, uRec2From: { value: new THREE.Vector3(0, 0, 0) },
      uRecTo: { value: new THREE.Vector3(0, 1, 1) }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: new THREE.Vector3(0, 0, 0) },
      uShimmer: { value: new THREE.Color(0, 0, 0) },
    };
    // On garde le shader déjà posé par fighters/loader.ts (lot LLOOK : liseré de lumière, émissif d'équipe).
    const avant = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => { avant.call(mat, shader, r); onBeforeCompileTeinte(shader, mat); };
    mat.needsUpdate = true;
  }
  const u = mat.userData.u;
  if (look.tint != null) {
    u.uTint.value.set(look.tint);
    u.uTintK.value.x = look.tintK ?? 0.5;
  } else u.uTintK.value.x = 0;
  u.uTintK.value.y = look.desat ?? 0;
}

// --- Corps : tenue de la photo, couleur d'équipe gardée par l'émissif du lot LLOOK ---

/** Buste (`*_Body`) et bras à la couleur principale de la tenue, jambes à la secondaire. La lueur d'équipe P1 / P2
 * (shader de fighters/loader.ts, lot LLOOK) est gardée : la teinte s'ajoute à ce shader au lieu de le remplacer. */
function recolorerCorps(root: THREE.Object3D, look: FighterLook): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    // Jamais les coques de contour (matériau partagé par tous les persos : l'encre deviendrait colorée).
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline && !Array.isArray((o as THREE.Mesh).material)) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const n = mesh.name;
    if (/_Body$/.test(n)) {
      mat.color.set(0xffffff); // la teinte de la tenue remplace celle d'équipe
      teindre(mat, { tint: look.primary, tintK: 0.85 });
    } else if (/_Arm/.test(n)) teindre(mat, { tint: look.primary, tintK: 0.55 });
    else if (/_Leg/.test(n)) teindre(mat, { tint: look.secondary, tintK: 0.75 });
  }
}

// --- Grosse tête ---

function trouverOs(root: THREE.Object3D, nom: string): THREE.Object3D | null {
  let os: THREE.Object3D | null = null;
  root.traverse((o) => { if (!os && o.name.toLowerCase() === nom) os = o; });
  return os;
}

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('portrait illisible'));
    img.src = src;
  });
}

interface Detoure {
  canvas: HTMLCanvasElement;
  /** 1 = tête, 0 = fond. */
  masque: Uint8Array;
  w: number;
  h: number;
  boite: { x0: number; y0: number; x1: number; y1: number };
}

/** Portrait sans trous : seul le fond magenta RELIÉ AU BORD devient transparent (une bouche ouverte reste pleine), puis
 * le bord blanc de sticker qui le touche (le bord de la tête devient le trait d'encre et la couleur cheveux / peau).
 * Si ce bord blanc « fuit » dans le dessin (trait ouvert), on le garde. */
function detourer(img: HTMLImageElement): Detoure {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const n = w * h;
  const magenta = (i: number) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90; };
  // Blanc du bord, ou mélange blanc / magenta (liseré anticrénelé et bruit JPEG), jamais le trait d'encre sombre.
  const blanc = (i: number) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return (Math.min(r, g, b) > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 45) || (r > 170 && b > 170 && g > 80); };
  const fond = new Uint8Array(n); // 1 = magenta, 2 = bord blanc
  const file = new Int32Array(n);
  const remplir = (accepte: (i: number) => boolean, marque: number, depart: number[]) => {
    let tete = 0, queue = 0;
    const pousser = (i: number) => { if (!fond[i] && accepte(i)) { fond[i] = marque; file[queue++] = i; } };
    for (const i of depart) pousser(i);
    while (tete < queue) {
      const i = file[tete++];
      const x = i % w, y = (i / w) | 0;
      if (x > 0) pousser(i - 1);
      if (x < w - 1) pousser(i + 1);
      if (y > 0) pousser(i - w);
      if (y < h - 1) pousser(i + w);
    }
    return queue;
  };
  const bords: number[] = [];
  for (let x = 0; x < w; x++) bords.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) bords.push(y * w, y * w + w - 1);
  const nMagenta = remplir(magenta, 1, bords);
  // Bord blanc : départ depuis les pixels voisins du fond magenta.
  const frontiere: number[] = [];
  for (let i = 0; i < n; i++) {
    if (fond[i] !== 1) continue;
    const x = i % w;
    if (x > 0 && !fond[i - 1]) frontiere.push(i - 1);
    if (x < w - 1 && !fond[i + 1]) frontiere.push(i + 1);
    if (i >= w && !fond[i - w]) frontiere.push(i - w);
    if (i < n - w && !fond[i + w]) frontiere.push(i + w);
  }
  const nBlanc = remplir(blanc, 2, frontiere);
  if (nBlanc > (n - nMagenta) * 0.3) for (let i = 0; i < n; i++) if (fond[i] === 2) fond[i] = 0; // fuite : on garde le bord
  const masque = new Uint8Array(n);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < n; i++) {
    if (fond[i]) { d[i * 4 + 3] = 0; continue; }
    masque[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    // Liseré : on retire la teinte magenta qui bave sur le bord (despill).
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const exces = Math.min(r, b) - g;
    if (exces > 40) { d[i * 4] = r - exces * 0.5; d[i * 4 + 2] = b - exces * 0.5; }
  }
  ctx.putImageData(im, 0, 0);
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  return { canvas, masque, w, h, boite: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Dos de la tête, peint dans le repère de la FACE (même silhouette) : la tête vue de dos dessinée par Nano Banana,
 * en miroir (vue de derrière, la gauche du perso est à gauche), sur la couleur des cheveux. Sans elle : des mèches. */
function textureDos(face: Detoure, dos: Detoure | null, cheveux: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = face.w;
  c.height = face.h;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${cheveux.getHexString()}`;
  g.fillRect(0, 0, c.width, c.height);
  const { x0, y0, x1, y1 } = face.boite;
  if (dos) {
    const b = dos.boite;
    g.save();
    g.translate(x1, y0);
    g.scale(-1, 1);
    g.drawImage(dos.canvas, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, 0, 0, x1 - x0, y1 - y0);
    g.restore();
  } else {
    // Repli : mèches du sommet vers la nuque, plus sombres et plus claires que la couleur des cheveux.
    const hsl = { h: 0, s: 0, l: 0 };
    cheveux.getHSL(hsl);
    const bw = x1 - x0, bh = y1 - y0;
    g.lineCap = 'round';
    for (let k = 0; k < 90; k++) {
      const u = (k * 0.618) % 1;
      const l = THREE.MathUtils.clamp(hsl.l + (k % 3 === 0 ? 0.12 : -0.1), 0.05, 0.9);
      g.strokeStyle = `hsl(${hsl.h * 360}, ${hsl.s * 100}%, ${l * 100}%)`;
      g.lineWidth = Math.max(2, bw / 45);
      const xs = x0 + bw * (0.5 + (u - 0.5) * 0.3), ys = y0 + bh * 0.08;
      const xe = x0 + bw * (0.08 + u * 0.84), ye = y0 + bh * (0.55 + 0.35 * ((k * 0.37) % 1));
      g.beginPath();
      g.moveTo(xs, ys);
      g.quadraticCurveTo((xs + xe) / 2 + (u - 0.5) * bw * 0.3, (ys + ye) / 2, xe, ye);
      g.stroke();
    }
  }
  // Même silhouette que la face : les 2 moitiés de la tête se rejoignent au bord.
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(face.canvas, 0, 0);
  return texture(c);
}

/** Tête gonflée : une grille sur la boîte du portrait, chaque face bombée selon la distance au bord de la silhouette
 * (0 au bord, `bombe` au cœur). Le contour exact vient de la texture (alphaTest) ; face avant = groupe 0, dos = 1. */
function geometrieGonflee(face: Detoure): { geo: THREE.BufferGeometry; aspect: number } {
  const { x0, y0, x1, y1 } = face.boite;
  const bw = x1 - x0, bh = y1 - y0;
  const aspect = bw / bh;
  const rows = TETE.rangees;
  const cols = Math.max(8, Math.round(rows * aspect));
  // Carte des distances au bord, 4 fois plus fine que la grille (chanfrein 3-4, 2 passes).
  const F = 4, dc = cols * F, dr = rows * F;
  const dist = new Float32Array(dc * dr);
  for (let j = 0; j < dr; j++) for (let i = 0; i < dc; i++) {
    const px = Math.min(face.w - 1, Math.floor(x0 + ((i + 0.5) / dc) * bw));
    const py = Math.min(face.h - 1, Math.floor(y0 + ((j + 0.5) / dr) * bh));
    dist[j * dc + i] = face.masque[py * face.w + px] ? 1e9 : 0;
  }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= dc || j >= dr ? 0 : dist[j * dc + i]);
  for (let j = 0; j < dr; j++) for (let i = 0; i < dc; i++) {
    const k = j * dc + i;
    if (dist[k]) dist[k] = Math.min(dist[k], at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
  }
  for (let j = dr - 1; j >= 0; j--) for (let i = dc - 1; i >= 0; i--) {
    const k = j * dc + i;
    if (dist[k]) dist[k] = Math.min(dist[k], at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
  }
  const unite = 1 / (3 * dr); // pas de chanfrein → fraction de la hauteur
  const nx = cols + 1, ny = rows + 1, nv = nx * ny;
  const pos = new Float32Array(nv * 2 * 3);
  const uv = new Float32Array(nv * 2 * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    // Distance au sommet de la grille : moyenne des 4 cases fines qui le touchent.
    const fi = i * F, fj = j * F;
    const dd = (at(fi - 1, fj - 1) + at(fi, fj - 1) + at(fi - 1, fj) + at(fi, fj)) / 4 * unite;
    const t = Math.min(1, dd / TETE.rayon);
    const hz = TETE.bombe * Math.pow(Math.sin((t * Math.PI) / 2), 0.8);
    const x = (i / cols - 0.5) * aspect, y = 0.5 - j / rows;
    const u = (x0 + (i / cols) * bw) / face.w, v = 1 - (y0 + (j / rows) * bh) / face.h;
    for (const [k, sens] of [[0, 1], [1, -1]] as const) {
      const vi = k * nv + j * nx + i;
      pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = sens * hz;
      uv[vi * 2] = u; uv[vi * 2 + 1] = v;
    }
  }
  // Cases utiles seulement (au moins une case fine dans la tête).
  const utile = (i: number, j: number) => {
    for (let b = 0; b < F; b++) for (let a = 0; a < F; a++) if (dist[(j * F + b) * dc + i * F + a] > 0) return true;
    return false;
  };
  const avant: number[] = [];
  const arriere: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!utile(i, j)) continue;
    const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
    avant.push(a, c, b, b, c, e);
    arriere.push(nv + a, nv + b, nv + c, nv + b, nv + e, nv + c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex([...avant, ...arriere]);
  geo.addGroup(0, avant.length, 0);
  geo.addGroup(avant.length, arriere.length, 1);
  geo.computeVertexNormals();
  return { geo, aspect };
}

function materiauTete(tex: THREE.Texture): THREE.MeshStandardMaterial {
  // Blancs ramenés au vinyle de la DA (luminance 0,82, sous le seuil du bloom) ; auto-éclairage partiel pour rester
  // lisible à contre-jour ; DoubleSide : la couture du bord ne laisse jamais voir à travers.
  return new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0,
    color: rendu.contour.vinyle, emissive: rendu.contour.vinyle, emissiveMap: tex, emissiveIntensity: TETE.emissif,
  });
}

/** Tête à ressort : la grosse tête traîne derrière les accélérations du cou puis rebondit (course, saut, coup). */
interface Ressort {
  pivot: THREE.Object3D;
  cou: THREE.Object3D;
  corps: THREE.Object3D;
  base: THREE.Quaternion;
  baseEchelle: THREE.Vector3;
  prec: THREE.Vector3 | null;
  vit: THREE.Vector3;
  acc: THREE.Vector3;
  ang: THREE.Vector3; // x : tangage, z : roulis, y : écrasement vertical
  angVit: THREE.Vector3;
  horsSceneDepuis: number;
}

const ressorts = new Set<Ressort>();
let rafRessorts = 0;
let dernierTick = 0;
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _e = new THREE.Euler();

function dansLaScene(o: THREE.Object3D): boolean {
  let x: THREE.Object3D | null = o;
  while (x) { if ((x as THREE.Scene).isScene) return true; x = x.parent; }
  return false;
}

function tickRessorts(now: number): void {
  rafRessorts = 0;
  const dt = Math.min(0.05, Math.max(0.001, (now - dernierTick) / 1000));
  dernierTick = now;
  const R = TETE.ressort;
  for (const r of ressorts) {
    if (!dansLaScene(r.pivot)) {
      // Perso retiré (revanche, retour au menu) : on l'oublie au bout de 30 s.
      if (!r.horsSceneDepuis) r.horsSceneDepuis = now;
      else if (now - r.horsSceneDepuis > 30_000) ressorts.delete(r);
      r.prec = null;
      continue;
    }
    r.horsSceneDepuis = 0;
    r.cou.getWorldPosition(_p);
    if (r.prec) {
      _v.subVectors(_p, r.prec).divideScalar(dt);
      // Accélération lissée (les différences finies d'une image à l'autre sont bruitées).
      const a = _v.clone().sub(r.vit).divideScalar(dt);
      r.acc.lerp(a, 0.35);
      r.vit.copy(_v);
    }
    r.prec = (r.prec ?? new THREE.Vector3()).copy(_p);
    // Accélération dans le repère du perso : avant = +Z, droite = +X.
    r.corps.getWorldQuaternion(_q).invert();
    const aLoc = r.acc.clone().applyQuaternion(_q);
    const cible = new THREE.Vector3(
      THREE.MathUtils.clamp(-aLoc.z * R.gain, -R.max, R.max),
      THREE.MathUtils.clamp(-aLoc.y * R.gainVertical, -R.maxVertical, R.maxVertical),
      THREE.MathUtils.clamp(aLoc.x * R.gain, -R.max, R.max),
    );
    r.angVit.addScaledVector(cible.sub(r.ang).multiplyScalar(R.raideur).addScaledVector(r.angVit, -R.amorti), dt);
    r.ang.addScaledVector(r.angVit, dt);
    r.ang.x = THREE.MathUtils.clamp(r.ang.x, -R.max, R.max);
    r.ang.z = THREE.MathUtils.clamp(r.ang.z, -R.max, R.max);
    r.ang.y = THREE.MathUtils.clamp(r.ang.y, -R.maxVertical, R.maxVertical);
    _qTilt.setFromEuler(_e.set(r.ang.x, 0, r.ang.z));
    r.pivot.quaternion.copy(r.base).multiply(_qTilt);
    const s = 1 + r.ang.y;
    r.pivot.scale.set(r.baseEchelle.x / Math.sqrt(s), r.baseEchelle.y * s, r.baseEchelle.z / Math.sqrt(s));
  }
  if (ressorts.size) rafRessorts = requestAnimationFrame(tickRessorts);
}

function ajouterRessort(r: Ressort): void {
  ressorts.add(r);
  if (!rafRessorts) { dernierTick = performance.now(); rafRessorts = requestAnimationFrame(tickRessorts); }
}

/** Remplace la tête KayKit par la grosse tête gonflée (face + dos). Renvoie false si rien n'a pu être posé.
 * Rappelable (portrait arrivé en retard) : l'ancienne grosse tête est retirée. */
async function poserGrosseTete(root: THREE.Object3D, look: FighterLook): Promise<boolean> {
  const os = trouverOs(root, 'head');
  if (!os || !look.faceUrl) return false;
  const [imgFace, imgDos] = await Promise.all([
    chargerImage(look.faceUrl),
    look.backUrl ? chargerImage(look.backUrl).catch(() => null) : Promise.resolve(null),
  ]);
  const face = detourer(imgFace);
  const fb = face.boite;
  if (fb.x1 - fb.x0 < 16 || fb.y1 - fb.y0 < 16) return false; // détourage raté : on garde la tête KayKit
  const dos = imgDos ? detourer(imgDos) : null;
  const cheveux = new THREE.Color(look.hair ?? '#3a2a20');
  const hsl = { h: 0, s: 0, l: 0 };
  cheveux.getHSL(hsl);
  cheveux.setHSL(hsl.h, hsl.s, Math.max(hsl.l, TETE.dosLuminositeMin));
  const { geo } = geometrieGonflee(face);
  const tete = new THREE.Mesh(geo, [materiauTete(texture(face.canvas)), materiauTete(textureDos(face, dos, cheveux))]);
  tete.name = 'grosse-tete-vinyle';
  tete.castShadow = true;

  os.getObjectByName('grosse-tete')?.removeFromParent();
  // Mesures dans le repère du perso, en pose de repos (avant toute animation).
  root.updateMatrixWorld(true);
  const tetesKayKit: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.isOutline) return;
    if ((o as THREE.Mesh).isMesh && /_Head/.test(o.name)) tetesKayKit.push(o);
    else if ((o as THREE.Mesh).isMesh && o.parent === os) tetesKayKit.push(o); // casque, chapeau
  });
  const boite = new THREE.Box3();
  for (const t of tetesKayKit) if (/_Head/.test(t.name)) boite.expandByObject(t);
  if (boite.isEmpty()) boite.setFromCenterAndSize(os.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(1, 1, 1));
  const tailleTete = boite.getSize(new THREE.Vector3());
  const centre = boite.getCenter(new THREE.Vector3());
  const hauteur = tailleTete.y * TETE.echelle;

  tete.scale.setScalar(hauteur); // la géométrie fait 1 de haut
  // Le pivot est au cou : c'est autour de lui que la tête bascule et rebondit.
  const pivot = new THREE.Group();
  pivot.name = 'grosse-tete';
  pivot.position.set(centre.x, boite.min.y, centre.z);
  tete.position.set(0, hauteur * (0.5 - TETE.menton), hauteur * TETE.avance);
  pivot.add(tete);

  for (const t of tetesKayKit) t.visible = false;
  root.add(pivot);
  os.attach(pivot); // garde la pose calculée dans le repère du perso, mais suit désormais l'os de la tête
  ajouterRessort({
    pivot, cou: os, corps: root, base: pivot.quaternion.clone(), baseEchelle: pivot.scale.clone(), prec: null,
    vit: new THREE.Vector3(), acc: new THREE.Vector3(), ang: new THREE.Vector3(), angVit: new THREE.Vector3(), horsSceneDepuis: 0,
  });
  return true;
}

/** Applique la tenue et la grosse tête au portrait du joueur sur un corps KayKit chargé (appelé par fighters/rig.ts). */
export async function applyFighterLook(root: THREE.Object3D, look: FighterLook): Promise<void> {
  recolorerCorps(root, look);
  if (!look.faceUrl) return;
  try {
    await poserGrosseTete(root, look);
  } catch (err) {
    console.error('[fighter-custom] grosse tête :', (err as Error)?.message ?? err);
  }
}
