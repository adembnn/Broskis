// Perso photo (lots LP puis LFACE) : tenue de la photo sur le corps KayKit, et GROSSE TÊTE « figurine à ressort »
// portant le portrait cartoon du joueur (Nano Banana Pro), découpée en carton comme les armes (module sticker).
// Tout reste en mémoire : le portrait n'est jamais écrit nulle part.
import * as THREE from 'three';
import type { FighterLook } from '../../core/types';
import { rendu } from '../../art/tokens.js';
import { makeSticker } from '../sticker/index';

/** Réglages de la grosse tête (valeurs visuelles locales au lot, comme scene/localTokens.ts). */
const TETE = {
  /** Hauteur de la grosse tête / hauteur de la tête KayKit d'origine (consigne d'Adem 16h45 : ×1,8 à ×2, goofy). */
  echelle: 1.9,
  /** Part de la grosse tête qui descend sous le cou (le menton couvre le col). */
  menton: 0.04,
  /** Avancée vers l'avant (fraction de la hauteur) : le visage ne rentre pas dans le buste. */
  avance: 0.1,
  /** Épaisseur du carton (fraction de la hauteur). */
  epaisseur: 0.06,
  /** Le visage reste lisible à contre-jour : part d'auto-éclairage du portrait. Faible : au-delà, le bord blanc
   * du sticker passe le seuil du bloom et la tête « brille » à contre-jour (vu en match). */
  emissif: 0.12,
  /** Arrière du crâne : couleur des cheveux, éclaircie jusqu'à cette luminosité (des cheveux noirs faisaient un trou). */
  dosLuminositeMin: 0.2,
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
    mat.onBeforeCompile = (shader) => onBeforeCompileTeinte(shader, mat);
    mat.needsUpdate = true;
  }
  const u = mat.userData.u;
  if (look.tint != null) {
    u.uTint.value.set(look.tint);
    u.uTintK.value.x = look.tintK ?? 0.5;
  } else u.uTintK.value.x = 0;
  u.uTintK.value.y = look.desat ?? 0;
}

// --- Corps : tenue de la photo, couleur d'équipe gardée sur la cape ---

/** Buste (`*_Body`) et bras à la couleur principale de la tenue, jambes à la secondaire. La couleur d'équipe
 * (posée sur le buste par fighters/loader.ts) passe sur la cape : P1 / P2 restent lisibles. */
function recolorerCorps(root: THREE.Object3D, look: FighterLook): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    // Jamais les coques de contour (matériau partagé par tous les persos : l'encre deviendrait colorée).
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline && !Array.isArray((o as THREE.Mesh).material)) meshes.push(o as THREE.Mesh);
  });
  const buste = meshes.find((m) => /_Body$/.test(m.name));
  const equipe = (buste?.material as THREE.MeshStandardMaterial | undefined)?.color?.clone();
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const n = mesh.name;
    if (/_Body$/.test(n)) {
      mat.color.set(0xffffff); // la teinte de la tenue remplace celle d'équipe
      teindre(mat, { tint: look.primary, tintK: 0.85 });
    } else if (/_Arm/.test(n)) teindre(mat, { tint: look.primary, tintK: 0.55 });
    else if (/_Leg/.test(n)) teindre(mat, { tint: look.secondary, tintK: 0.75 });
    else if (/_Cape$/.test(n) && equipe) teindre(mat, { tint: equipe, tintK: 0.9 });
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

/** Texture du portrait sans trous : seul le fond magenta RELIÉ AU BORD devient transparent (une langue rose ou un
 * t-shirt magenta au milieu du visage restent opaques, contrairement au détourage générique des armes). */
function texturePortrait(img: HTMLImageElement): THREE.CanvasTexture {
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
  const cle = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    // Magenta : rouge et bleu hauts, vert bas (tolérant au bruit JPEG).
    cle[i] = r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 90 ? 1 : 0;
  }
  const fond = new Uint8Array(n);
  const file = new Int32Array(n);
  let tete = 0, queue = 0;
  const pousser = (i: number) => { if (cle[i] && !fond[i]) { fond[i] = 1; file[queue++] = i; } };
  for (let x = 0; x < w; x++) { pousser(x); pousser((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pousser(y * w); pousser(y * w + w - 1); }
  while (tete < queue) {
    const i = file[tete++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) pousser(i - 1);
    if (x < w - 1) pousser(i + 1);
    if (y > 0) pousser(i - w);
    if (y < h - 1) pousser(i + w);
  }
  for (let i = 0; i < n; i++) {
    if (fond[i]) { d[i * 4 + 3] = 0; continue; }
    // Liseré : on retire la teinte magenta qui bave sur le bord (despill).
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const exces = Math.min(r, b) - g;
    if (exces > 40) { d[i * 4] = r - exces * 0.5; d[i * 4 + 2] = b - exces * 0.5; }
  }
  ctx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** L'extrusion range face arrière puis face avant dans un même groupe : on les sépare pour peindre l'arrière du
 * crâne et la tranche (couleur des cheveux) au lieu d'un visage en miroir. */
function peindreArriere(mesh: THREE.Mesh, arriere: THREE.Material): void {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const [couvercles, ...cotes] = geo.groups.map((g) => ({ ...g }));
  if (!couvercles || !Array.isArray(mesh.material)) return;
  const mats = [...mesh.material, arriere];
  const moitie = couvercles.count / 2;
  geo.clearGroups();
  geo.addGroup(couvercles.start, moitie, mats.length - 1);
  geo.addGroup(couvercles.start + moitie, moitie, 0);
  for (const g of cotes) geo.addGroup(g.start, g.count, mats.length - 1);
  mesh.material = mats;
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

/** Remplace la tête KayKit par la grosse tête au portrait du joueur. Renvoie false si rien n'a pu être posé. */
async function poserGrosseTete(root: THREE.Object3D, look: FighterLook): Promise<boolean> {
  const os = trouverOs(root, 'head');
  if (!os || !look.faceUrl) return false;
  const img = await chargerImage(look.faceUrl);
  const sticker = await makeSticker(img, { height: 1, depth: TETE.epaisseur });
  const mesh = sticker.children.find((c) => (c as THREE.Mesh).isMesh && Array.isArray((c as THREE.Mesh).material)) as THREE.Mesh | undefined;
  if (!mesh || sticker.userData.sticker == null) return false; // détourage raté : on garde la tête KayKit

  // Visage : texture sans trous, découpe nette, auto-éclairage partiel pour rester lisible à contre-jour.
  const face = (mesh.material as THREE.Material[])[0] as THREE.MeshToonMaterial;
  const tex = texturePortrait(img);
  face.map?.dispose();
  face.map = tex;
  face.transparent = false;
  face.alphaTest = 0.5;
  // Blancs du portrait ramenés au vinyle de la DA (luminance 0,82, sous le seuil du bloom) : plus de halo.
  face.color = new THREE.Color(rendu.contour.vinyle);
  face.emissive = new THREE.Color(rendu.contour.vinyle);
  face.emissiveMap = tex;
  face.emissiveIntensity = TETE.emissif;
  face.needsUpdate = true;
  const cheveux = new THREE.Color(look.hair ?? '#3a2a20');
  const hsl = { h: 0, s: 0, l: 0 };
  cheveux.getHSL(hsl);
  cheveux.setHSL(hsl.h, hsl.s, Math.max(hsl.l, TETE.dosLuminositeMin));
  peindreArriere(mesh, new THREE.MeshStandardMaterial({ color: cheveux, roughness: 0.6 }));

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

  const bSticker = new THREE.Box3().setFromObject(sticker);
  const hSticker = Math.max(1e-3, bSticker.max.y - bSticker.min.y);
  sticker.scale.setScalar(hauteur / hSticker);
  // Le pivot est au cou : c'est autour de lui que la tête bascule et rebondit.
  const pivot = new THREE.Group();
  pivot.name = 'grosse-tete';
  pivot.position.set(centre.x, boite.min.y, centre.z);
  sticker.position.set(0, hauteur * (0.5 - TETE.menton), hauteur * TETE.avance);
  pivot.add(sticker);
  sticker.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.castShadow = true; });

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
