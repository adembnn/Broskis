// Rendu toon local au lot LM (src/art/ n'expose que tokens.js, pas encore de kit toon partagé).
// Repris/adapté de C:\Users\Adem\repos\bagarre-de-taverne\toon-kit.js, aligné sur la direction « Vinyle » :
// rampe à paliers variables (héros 3 / décor 2, cf. rendu.paliers), désaturation + teinte des packs texturés
// (maps.<id>.decor), contour d'encre réservé aux props interactifs (jamais le décor de fond), et un motif
// de rayures d'alerte (jaune/encre, JAMAIS rouge : le rouge est à J1) pour tout ce qui va tomber/frapper.
import * as THREE from 'three';
import { palette, rendu } from './tokens';

export interface Grade { steps?: number; saturation?: number; tint?: string }

// ---------------------------------------------------------------------------
// Rampe de toon shading (N paliers, palier sombre = rendu.paliers.plancher, jamais noir pur).
// ---------------------------------------------------------------------------
const gradientCache = new Map<number, THREE.DataTexture>();
export function gradientMap(steps = rendu.paliers.heros): THREE.DataTexture {
  const n = Math.max(2, Math.floor(steps));
  const cached = gradientCache.get(n);
  if (cached) return cached;
  const min = rendu.paliers.plancher;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round((min + (1 - min) * (i / (n - 1))) * 255);
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientCache.set(n, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Désaturation + teinte (maps.<id>.decor) : patch de shader minuscule, appliqué une fois par matériau.
// ---------------------------------------------------------------------------
function applyGrade(mat: THREE.MeshToonMaterial, saturation: number, tint: string) {
  if (saturation >= 0.999 && tint.toLowerCase() === '#ffffff') return;
  const uSat = { value: saturation };
  const uTint = { value: new THREE.Color(tint) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSat = uSat;
    shader.uniforms.uTint = uTint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSat;\nuniform vec3 uTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, uSat) * uTint;
        }`);
  };
  mat.customProgramCacheKey = () => `toon-grade-${saturation.toFixed(3)}-${tint}`;
}

function gradeKey(g: Grade): string {
  return `${g.steps ?? rendu.paliers.heros}|${g.saturation ?? 1}|${g.tint ?? '#ffffff'}`;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

/** Convertit (et met en cache) un matériau PBR chargé en MeshToonMaterial équivalent (même carte/vertex colors). */
export function toonify(src: THREE.Material, grade: Grade = {}): THREE.MeshToonMaterial {
  const key = `${src.uuid}|${gradeKey(grade)}`;
  const cached = toonCache.get(key);
  if (cached) return cached;
  const base = src as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshToonMaterial({
    map: base.map ?? null,
    color: base.color ? base.color.clone() : new THREE.Color(0xffffff),
    gradientMap: gradientMap(grade.steps),
    vertexColors: base.vertexColors === true,
    transparent: base.transparent,
    opacity: base.opacity ?? 1,
    side: base.side ?? THREE.FrontSide,
    alphaTest: base.alphaTest ?? 0,
  });
  applyGrade(mat, grade.saturation ?? 1, grade.tint ?? '#ffffff');
  mat.name = `toon(${src.name || src.uuid.slice(0, 6)})`;
  toonCache.set(key, mat);
  return mat;
}

/** Matériau toon plat (props procéduraux : catapulte, grille-pain, rouleau…), même système de paliers/teinte. */
const flatCache = new Map<string, THREE.MeshToonMaterial>();
export function flatToon(color: string, grade: Grade = {}): THREE.MeshToonMaterial {
  const key = `${color}|${gradeKey(grade)}`;
  const cached = flatCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(grade.steps) });
  applyGrade(mat, grade.saturation ?? 1, grade.tint ?? '#ffffff');
  flatCache.set(key, mat);
  return mat;
}

/** Applique toonify()/flatToon() (via `grade`) à tous les meshes d'un objet, récursif. */
export function toonifyTree(root: THREE.Object3D, grade: Grade = {}, { cast = true, receive = true } = {}): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => toonify(m, grade));
    else mesh.material = toonify(mesh.material, grade);
  });
  return root;
}

// ---------------------------------------------------------------------------
// Contour "inverted hull" (silhouette d'encre — jamais sur le décor de fond, cf. hiérarchie du trait).
// ---------------------------------------------------------------------------
function computeOutlineNormals(geometry: THREE.BufferGeometry) {
  if (geometry.getAttribute('outlineNormal')) return;
  const pos = geometry.getAttribute('position');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nrm = geometry.getAttribute('normal');
  const precision = 1e4;
  const acc = new Map<string, [number, number, number]>();
  const keys = new Array<string>(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * precision)}|${Math.round(pos.getY(i) * precision)}|${Math.round(pos.getZ(i) * precision)}`;
    keys[i] = k;
    let a = acc.get(k);
    if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keys[i])!;
    const len = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / len; out[i * 3 + 1] = a[1] / len; out[i * 3 + 2] = a[2] / len;
  }
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
}

function outlineOnBeforeCompile(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uOutlineThickness = this.userData.thicknessUniform;
  shader.vertexShader = `attribute vec3 outlineNormal;\nuniform float uOutlineThickness;\n${shader.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n\ttransformed += outlineNormal * uOutlineThickness;',
  )}`;
}

const outlineMatCache = new Map<string, THREE.MeshBasicMaterial>();
function outlineMaterial(color: string, thickness: number): THREE.MeshBasicMaterial {
  const key = `${color}|${thickness.toFixed(5)}`;
  const cached = outlineMatCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.thicknessUniform = { value: thickness };
  m.onBeforeCompile = outlineOnBeforeCompile;
  m.customProgramCacheKey = () => `outline-${thickness.toFixed(5)}`;
  outlineMatCache.set(key, m);
  return m;
}

/** Ajoute un contour d'encre à un Mesh/InstancedMesh (props interactifs / personnages — jamais le décor). */
export function addOutline(mesh: THREE.Mesh | THREE.InstancedMesh, thickness = rendu.contour.epaisseur.prop, color = rendu.contour.encre) {
  if (mesh.userData.outline) return mesh.userData.outline as THREE.Object3D;
  computeOutlineNormals(mesh.geometry);
  mesh.updateWorldMatrix(true, false);
  const ws = new THREE.Vector3();
  mesh.getWorldScale(ws);
  const s = Math.max(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)) || 1;
  const material = outlineMaterial(color, thickness / s);
  let outline: THREE.Object3D;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const im = mesh as THREE.InstancedMesh;
    const out = new THREE.InstancedMesh(im.geometry, material, im.instanceMatrix.count);
    out.instanceMatrix = im.instanceMatrix;
    out.count = im.count;
    outline = out;
  } else {
    outline = new THREE.Mesh(mesh.geometry, material);
  }
  outline.name = `${mesh.name || 'mesh'}__outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = () => {};
  outline.userData.isOutline = true;
  mesh.add(outline);
  mesh.userData.outline = outline;
  return outline;
}

/** Contour + toonify sur tout un sous-arbre (props chargés multi-mesh : bateau, canon…). */
export function outlineTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.isOutline && !m.userData.noOutline) addOutline(m);
  });
}

// ---------------------------------------------------------------------------
// Rayures d'alerte (rendu.rayures : 0,3 m à 45°, ALERTE/encre — jamais de rouge, réservé à J1).
// ---------------------------------------------------------------------------
let hazardTex: THREE.CanvasTexture | null = null;
function hazardTexture(): THREE.CanvasTexture {
  if (hazardTex) return hazardTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const c = canvas.getContext('2d')!;
  c.fillStyle = rendu.contour.encre;
  c.fillRect(0, 0, size, size);
  c.fillStyle = palette.danger;
  c.save();
  c.translate(size / 2, size / 2);
  c.rotate(THREE.MathUtils.degToRad(rendu.rayures.angle));
  c.translate(-size, -size);
  const band = size / 3;
  for (let x = 0; x < size * 4; x += band * 2) c.fillRect(x, -size, band, size * 4);
  c.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  hazardTex = tex;
  return tex;
}

/** Décalque plat "rayures d'alerte" (ex. anneau condamné, bande balayée). `size` en mètres (X,Z). */
export function hazardDecal(sizeX: number, sizeZ: number): THREE.Mesh {
  const tex = hazardTexture().clone();
  tex.needsUpdate = true;
  const period = rendu.rayures.largeur * 2;
  tex.repeat.set(Math.max(1, sizeX / period), Math.max(1, sizeZ / period));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sizeX, sizeZ), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.noOutline = true;
  mesh.renderOrder = 2;
  return mesh;
}
