// Banc de scan (lot LBENCH) : rend un objet scanné avec le VRAI code du jeu, sans le reste du jeu.
// - redimensionnement : src/ia/image.ts (même 768 px que le jeu) ;
// - objet : WeaponModel (src/scene/weapons/visual.ts : sticker détouré et extrudé par src/scene/sticker, épaisseur
//   selon la physique) et lookOf (taille réelle bornée, comme en main et en vol) ;
// - perso de référence : chevalier KayKit chargé et « toonifié » par src/scene/fighters/loader.ts ;
// - réglages de jeu : physicsFeel (src/gameplay/physics-feel.ts).
// Piloté par tools/scan-bench/run.mjs via window.banc ; renvoie des images WebP (data URL) et des mesures.
import * as THREE from 'three';
import { chromaKey } from '../../src/scene/sticker/index.ts';
import { WeaponModel } from '../../src/scene/weapons/visual.ts';
import { lookOf } from '../../src/scene/weapons/physics.ts';
import { instantiateFighterModel } from '../../src/scene/fighters/loader.ts';
import { LOCAL_TOKENS } from '../../src/scene/localTokens.ts';
import { WEAPON_FX } from '../../src/scene/weapons/tokens.ts';
import { physicsFeel } from '../../src/gameplay/physics-feel.ts';
import { toResizedJpegBase64 } from '../../src/ia/image.ts';
import type { Category, Weapon, WeaponPhysics } from '../../src/core/types.ts';

// Couleurs du banc (outil, pas le jeu) : fond neutre pour juger l'objet, ciel et sol pour la vue en vol.
const FOND_VUES = '#d8dde5';
const CIEL = '#9fd3ff';
const SOL = '#8cbf6a';
const QUALITE_WEBP = 0.85;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

function lumieres(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.6));
  const soleil = new THREE.DirectionalLight(0xffffff, 2.2);
  soleil.position.set(3, 6, 4);
  scene.add(soleil);
}

function photo(scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): string {
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/webp', QUALITE_WEBP);
}

/** Place la caméra pour que la boîte tienne dans le cadre (marge en fraction). */
function cadrer(camera: THREE.PerspectiveCamera, box: THREE.Box3, dir: THREE.Vector3, aspect: number, marge = 1.25): void {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const rayon = size.length() / 2;
  const d = Math.max(rayon / Math.sin(vFov / 2), rayon / Math.sin(hFov / 2)) * marge * 0.8;
  camera.position.copy(center).addScaledVector(dir.clone().normalize(), d);
  camera.lookAt(center);
  camera.near = d / 50;
  camera.far = d * 10;
}

// ---------------------------------------------------------------------------
// Perso de référence : une instance neuve par scène (le chargeur du jeu met le GLB en cache et clone le
// squelette proprement ; un simple clone(true) laisserait le casque flotter à côté du corps).
// ---------------------------------------------------------------------------
async function perso(): Promise<THREE.Object3D> {
  const { root, animations } = await instantiateFighterModel({ model: 'knight' }, 0);
  root.scale.setScalar(LOCAL_TOKENS.fighterScale);
  const idle = animations.find((c) => c.name === 'idle') ?? animations[0];
  if (idle) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(idle).play();
    mixer.update(0.4);
  }
  root.updateMatrixWorld(true);
  return root;
}

// ---------------------------------------------------------------------------
// Mesures du détourage
// ---------------------------------------------------------------------------

/** Part de pixels retirés, et part de pixels roses (teinte magenta) sur la bande de contour. */
function mesurerDetourage(keyed: HTMLCanvasElement): { fondRetire: number; roseBord: number; pixelsBord: number } {
  const { width: w, height: h } = keyed;
  const data = keyed.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
  let transparents = 0;
  let bord = 0;
  let roses = 0;
  const R = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 40) { transparents++; continue; }
      let auBord = false;
      for (let dy = -R; dy <= R && !auBord; dy++) for (let dx = -R; dx <= R; dx++) if (a(x + dx, y + dy) < 40) { auBord = true; break; }
      if (!auBord) continue;
      bord++;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      // Violets foncés compris : un contour noir mélangé au magenta donne un liseré sombre (mocassin).
      if (max < 0.12 || sat < 0.3) continue;
      let teinte = 0;
      const d = max - min;
      if (max === r) teinte = 60 * (((g - b) / d) % 6);
      else if (max === g) teinte = 60 * ((b - r) / d + 2);
      else teinte = 60 * ((r - g) / d + 4);
      if (teinte < 0) teinte += 360;
      if (teinte >= 270 && teinte <= 345) roses++;
    }
  }
  return { fondRetire: transparents / (w * h), roseBord: bord ? roses / bord : 0, pixelsBord: bord };
}

/** Même contrôle que le client du jeu (looksLikeSticker, src/ia/scan.ts) : part de magenta sur le pourtour à 64 px.
 *  Sous 0,6, le jeu rejette le sticker (nouvel essai ou forme de secours). */
function pourtourMagenta(img: HTMLImageElement): number {
  const w = 64;
  const h = Math.max(8, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let bord = 0;
  let magenta = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > 1 && x < w - 2 && y > 1 && y < h - 2) continue;
    const i = (y * w + x) * 4;
    bord++;
    if (Math.hypot(d[i] - 255, d[i + 1], d[i + 2] - 255) / 441.7 < 0.4) magenta++;
  }
  return +(magenta / bord).toFixed(3);
}

/** Sticker détouré sur damier sombre (les liserés roses s'y voient), 400 px max. */
function imageDetouree(keyed: HTMLCanvasElement): string {
  const k = Math.min(1, 400 / Math.max(keyed.width, keyed.height));
  const c = document.createElement('canvas');
  c.width = Math.round(keyed.width * k);
  c.height = Math.round(keyed.height * k);
  const ctx = c.getContext('2d')!;
  const case_ = 16;
  for (let y = 0; y < c.height; y += case_) for (let x = 0; x < c.width; x += case_) {
    ctx.fillStyle = ((x + y) / case_) % 2 ? '#2a2a2a' : '#3a3a3a';
    ctx.fillRect(x, y, case_, case_);
  }
  ctx.drawImage(keyed, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', QUALITE_WEBP);
}

function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image illisible'));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Rendu complet d'un objet
// ---------------------------------------------------------------------------
/** L'arme telle que le jeu la reçoit après un scan (src/ia/scan.ts). */
type Entree = Pick<Weapon, 'object' | 'name' | 'category' | 'why' | 'stats' | 'trait' | 'palette' | 'lines'> & {
  stickerUrl?: string;
  physics?: WeaponPhysics;
};

let compteur = 0;

/** Un exemplaire de l'objet par la vraie classe du jeu (taille, épaisseur selon la physique), sticker attendu. */
async function exemplaire(w: Weapon): Promise<{ modele: WeaponModel; sticker: boolean; ms: number }> {
  const t0 = performance.now();
  const modele = new WeaponModel(w);
  const trouve = () => { let ok = false; modele.root.traverse((o) => { if (o.userData.sticker) ok = true; }); return ok; };
  while (w.stickerUrl && !trouve() && performance.now() - t0 < 20_000) await new Promise((r) => setTimeout(r, 30));
  return { modele, sticker: trouve(), ms: Math.round(performance.now() - t0) };
}

async function rendre(e: Entree) {
  const mesures: Record<string, unknown> = {};
  const w: Weapon = { ...e, id: `banc-${++compteur}`, source: 'scan', cooldown: 0 } as Weapon;
  let detoure: string | null = null;
  if (e.stickerUrl) {
    const img = await chargerImage(e.stickerUrl);
    const keyed = chromaKey(img);
    Object.assign(mesures, mesurerDetourage(keyed));
    mesures.pourtourMagenta = pourtourMagenta(img);
    detoure = imageDetouree(keyed);
  }
  const look = lookOf(w);
  mesures.tailleJeu = +look.size.toFixed(2);
  mesures.tailleReelle = e.physics ? +Math.max(...e.physics.sizeM).toFixed(3) : null;
  mesures.epaisseurReelle = +look.depthRatio.toFixed(3);
  mesures.toursParS = +look.turns.toFixed(2);

  // --- 3 vues de l'objet seul (plus grande dimension = 1) ---
  const vues: Record<string, string> = {};
  const a = await exemplaire(w);
  mesures.msSticker = a.ms;
  mesures.repli = !a.sticker;
  let info: { contourPoints?: number } | undefined;
  a.modele.root.traverse((o) => { if (o.userData.sticker) info = o.userData.sticker; });
  mesures.pointsContour = info?.contourPoints ?? 0;
  const taille = new THREE.Box3().setFromObject(a.modele.root).getSize(new THREE.Vector3());
  mesures.epaisseur = +(taille.z / Math.max(taille.x, taille.y)).toFixed(3);
  {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOND_VUES);
    lumieres(scene);
    const pivot = new THREE.Group();
    pivot.add(a.modele.root);
    scene.add(pivot);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const angles: [string, number, number][] = [['face', 0, 0], ['troisQuarts', -0.7, 0.18], ['profil', -1.35, 0.1]];
    for (const [nom, ry, rx] of angles) {
      pivot.rotation.set(rx, ry, 0);
      pivot.updateMatrixWorld(true);
      cadrer(camera, new THREE.Box3().setFromObject(pivot), new THREE.Vector3(0, 0.15, 1), 1, 1.15);
      vues[nom] = photo(scene, camera, 400, 400);
    }
    a.modele.dispose();
  }

  // --- À côté du perso, à la taille du jeu (taille réelle bornée par lookOf) ---
  {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOND_VUES);
    lumieres(scene);
    const sol = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshLambertMaterial({ color: SOL }));
    sol.rotation.x = -Math.PI / 2;
    scene.add(sol);
    const chevalier = await perso();
    chevalier.position.set(-0.45, 0, 0);
    chevalier.rotation.y = 0.35;
    scene.add(chevalier);
    const { modele } = await exemplaire(w);
    const obj = modele.root;
    obj.scale.setScalar(look.size);
    obj.rotation.y = -0.35;
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    obj.position.set(0.3 + (b.max.x - b.min.x) / 2, -b.min.y, 0);
    scene.add(obj);
    const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.01, 100);
    const tout = new THREE.Box3().setFromObject(chevalier).union(new THREE.Box3().setFromObject(obj));
    mesures.hauteurPerso = +new THREE.Box3().setFromObject(chevalier).getSize(new THREE.Vector3()).y.toFixed(2);
    cadrer(camera, tout, new THREE.Vector3(0, 0.25, 1), 4 / 3, 1.05);
    vues.perso = photo(scene, camera, 560, 420);
    modele.dispose();
  }

  // --- En vol, vu de l'épaule du lanceur, à la taille du jeu ---
  {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CIEL);
    lumieres(scene);
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: SOL }));
    sol.rotation.x = -Math.PI / 2;
    scene.add(sol);
    const cible = await perso();
    cible.position.set(-1.6, 0, -9);
    scene.add(cible);
    const { modele } = await exemplaire(w);
    const obj = modele.root;
    obj.scale.setScalar(look.size);
    obj.position.set(0.5, 1.7, -4.5);
    obj.rotation.set(0.35, 0.6, 0.3);
    scene.add(obj);
    const ombre = new THREE.Mesh(
      new THREE.CircleGeometry(WEAPON_FX.vol.ombre * look.size / 2, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
    );
    ombre.rotation.x = -Math.PI / 2;
    ombre.position.set(0.5, 0.01, -4.5);
    scene.add(ombre);
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 200);
    camera.position.set(-0.6, 2.1, 0);
    camera.lookAt(0.3, 1.2, -8);
    vues.vol = photo(scene, camera, 640, 360);
    modele.dispose();
  }

  return { images: { detoure, ...vues }, mesures };
}

/** Réglages de jeu déduits de la physique (src/gameplay/physics-feel.ts), pour la page de rapport. */
function reglages(physics: WeaponPhysics, category: Category) {
  const f = physicsFeel({ category, physics });
  return { vitesse: f.speedMult, degats: f.damageMult, recul: f.launchMult, recharge: f.cooldownMult, portee: f.rangeMult, rebonds: f.bounces, fragile: f.fragile, liquide: f.liquid };
}

async function redimensionner(dataUrl: string) {
  const t0 = performance.now();
  const r = await toResizedJpegBase64(dataUrl);
  return { ...r, ms: Math.round(performance.now() - t0) };
}

declare global {
  interface Window { banc: unknown }
}
window.banc = { redimensionner, rendre, reglages, pret: () => perso().then(() => true) };
