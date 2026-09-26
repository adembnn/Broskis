// KayKit (CC0, Kay Lousberg) : chargement, conversion toon, recoloration d'accents, fusion des sous-maillages.
//   loadKayKit()                 → Promise { chars: { mage, barbarian, … : gltf }, props: gltf } (chargé une seule fois)
//   kaykitProps()                → gltf des accessoires (synchrone, après loadKayKit)
//   propNode(name, { scale })    → copie toon d'un nœud de props.glb (matériaux partagés, attributs en Float32)
//   texturedToon(map, opts)      → MeshToonMaterial texturé (rampe du projet) + recoloration optionnelle
//   mergeSkinned(root)           → fusionne les SkinnedMesh d'un même matériau en un seul (1 draw call au lieu de 6)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GRADIENT } from './scene.js';
import mageUrl from './assets/kaykit/mage.glb';
import barbarianUrl from './assets/kaykit/barbarian.glb';
import rogueUrl from './assets/kaykit/rogue_hooded.glb';
import skelMageUrl from './assets/kaykit/skeleton_mage.glb';
import propsUrl from './assets/kaykit/props.glb';

const URLS = { mage: mageUrl, barbarian: barbarianUrl, rogue_hooded: rogueUrl, skeleton_mage: skelMageUrl };

// Dans l'artifact claude.ai, fetch() est interdit, même vers une data: URL. On décode donc le base64 à la main
// et on donne l'ArrayBuffer à GLTFLoader.parse. Les textures intégrées passent par des blob: URL : on force
// TextureLoader (balise <img>, autorisée) au lieu d'ImageBitmapLoader (qui utilise fetch).
async function toArrayBuffer(url) {
  if (url.startsWith('data:')) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  return (await fetch(url)).arrayBuffer(); // serveur de développement
}
function parseGLB(loader, buffer) {
  return new Promise((resolve, reject) => {
    const cib = window.createImageBitmap;
    try {
      window.createImageBitmap = undefined; // GLTFParser choisit son chargeur de textures à la construction
      loader.parse(buffer, '', resolve, reject);
    } finally { window.createImageBitmap = cib; }
  });
}
async function loadGLB(loader, url) { return parseGLB(loader, await toArrayBuffer(url)); }

let loading = null;
let loaded = null;
export function loadKayKit() {
  loading ||= (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const entries = Object.entries(URLS);
    const [props, ...chars] = await Promise.all([loadGLB(loader, propsUrl), ...entries.map(([, u]) => loadGLB(loader, u))]);
    for (const g of [props, ...chars]) g.scene.traverse((o) => { if (o.isMesh) o.geometry = floatGeometry(o.geometry); });
    loaded = { props, chars: Object.fromEntries(entries.map(([k], i) => [k, chars[i]])) };
    return loaded;
  })();
  return loading;
}
export const kaykit = () => loaded;

// ---------- Attributs quantifiés (KHR_mesh_quantization) → Float32 : fusion et applyMatrix4 sans débordement ----------
const floatCache = new WeakMap();
export function floatGeometry(geo) {
  if (floatCache.has(geo)) return floatCache.get(geo);
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    if (name === 'skinIndex') {
      const arr = new Uint16Array(a.count * 4);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < 4; k++) arr[i * 4 + k] = a.getComponent(i, k);
      g.setAttribute(name, new THREE.BufferAttribute(arr, 4));
      continue;
    }
    const n = a.itemSize, arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) arr[i * n + k] = a.getComponent(i, k); // dénormalise
    g.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  if (geo.index) g.setIndex(new THREE.BufferAttribute(new Uint32Array(geo.index.array), 1));
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  floatCache.set(geo, g);
  return g;
}

// ---------- Matériau toon texturé, avec recoloration d'une bande de teintes et reflet chatoyant ----------
// recolor : { from: [teinte 0..1, largeur], to: '#hex', sat: ×, val: × } — ne touche que les texels saturés de la bande.
// tint : couleur multipliée à tout le modèle (ex. givre). shimmer : liseré animé (le Reflet).
const shimmerTime = { value: 0 };
export function tickShimmer(t) { shimmerTime.value = t; }

function onBeforeCompileToon(shader) {
  const u = this.userData.u;
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
      }`)
    .replace('#include <opaque_fragment>', `
      {
        vec3 vdir = normalize(vViewPosition);
        float rim = 1.0 - clamp(dot(normalize(normal), vdir), 0., 1.);
        float wave = 0.55 + 0.45 * sin(uTime * 3.2 + vViewPosition.y * 3.0 + vViewPosition.x * 1.7);
        outgoingLight += uShimmer * smoothstep(0.45, 0.8, rim) * wave;
      }
      #include <opaque_fragment>`);
}

export function texturedToon(map, { name = '' } = {}) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: GRADIENT, color: '#ffffff', emissive: '#000000' });
  m.name = name;
  m.userData.u = {
    uRecFrom: { value: new THREE.Vector3(0, 0, 0) }, uRec2From: { value: new THREE.Vector3(0, 0, 0) },
    uRecTo: { value: new THREE.Vector3(0, 1, 1) }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: new THREE.Vector3(0, 0, 0) },
    uShimmer: { value: new THREE.Color(0, 0, 0) },
  };
  m.onBeforeCompile = onBeforeCompileToon;
  m.customProgramCacheKey = () => 'kaykit-toon';
  return m;
}

// Applique un « look » : recoloration d'accents, teinte globale, désaturation, reflet.
const _c = new THREE.Color();
export function applyLook(mat, look = {}) {
  const u = mat.userData.u;
  const rc = look.recolor;
  if (rc) {
    _c.set(rc.to); const hsl = {}; _c.getHSL(hsl);
    u.uRecFrom.value.set(rc.from[0], rc.from[1], 0);
    u.uRec2From.value.set(rc.from2?.[0] || 0, rc.from2?.[1] || 0, 0);
    u.uRecTo.value.set(hsl.h, rc.sat ?? 1, rc.val ?? 1);
  } else { u.uRecFrom.value.set(0, 0, 0); u.uRec2From.value.set(0, 0, 0); }
  if (look.tint) { u.uTint.value.set(look.tint); u.uTintK.value.x = look.tintK ?? 0.5; } else u.uTintK.value.x = 0;
  u.uTintK.value.y = look.desat || 0;
  u.uShimmer.value.set(look.shimmer || '#000000');
}

// ---------- Matériaux partagés des accessoires (une texture = un matériau = fusion possible) ----------
const sharedProps = new Map();
function propMaterial(src) {
  const key = src.map?.uuid || src.uuid;
  if (!sharedProps.has(key)) {
    const m = src.map ? new THREE.MeshToonMaterial({ map: src.map, gradientMap: GRADIENT, color: '#ffffff' }) : new THREE.MeshToonMaterial({ color: src.color, gradientMap: GRADIENT });
    m.name = `kk-${src.name}`;
    sharedProps.set(key, m);
  }
  return sharedProps.get(key);
}
export function propMaterials() { return [...sharedProps.values()]; }

// Copie d'un nœud de props.glb avec matériaux toon partagés. Pivot conservé (voir manifest.json).
export function propNode(name, { scale = 1, cast = true, receive = true } = {}) {
  const src = loaded?.props.scene.getObjectByName(name);
  if (!src) return null;
  const n = src.clone(true);
  n.position.set(0, 0, 0); n.rotation.set(0, 0, 0); n.scale.setScalar(scale);
  n.traverse((o) => {
    if (!o.isMesh) return;
    o.material = propMaterial(o.material);
    o.castShadow = cast; o.receiveShadow = receive;
  });
  const g = new THREE.Group(); g.add(n); g.name = name;
  return g;
}

// ---------- Fusion des SkinnedMesh d'un personnage (même matériau) ----------
// Chaque sous-maillage KayKit a sa propre peau (matrices inverses propres, quantification) : on « cuit » chaque sommet
// dans la pose de repos courante (espace du modèle), puis on reconstruit UN squelette dont les inverses = pose de repos.
const _m = new THREE.Matrix4(), _acc = new THREE.Matrix4(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function mergeSkinned(root) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const skinned = [];
  root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const byMat = new Map();
  for (const s of skinned) { const k = s.material.uuid; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(s); }
  const out = [];
  for (const list of byMat.values()) {
    if (list.length < 2) { out.push(list[0]); continue; }
    const bones = [];
    const boneIdx = new Map();
    let total = 0, totalIdx = 0;
    for (const s of list) { total += s.geometry.attributes.position.count; totalIdx += s.geometry.index ? s.geometry.index.count : s.geometry.attributes.position.count; }
    const P = new Float32Array(total * 3), N = new Float32Array(total * 3), UV = new Float32Array(total * 2), SI = new Uint16Array(total * 4), SW = new Float32Array(total * 4);
    const I = new Uint32Array(totalIdx);
    let vo = 0, io = 0;
    for (const s of list) {
      const g = s.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const sk = s.skeleton;
      const mats = sk.bones.map((b, j) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).multiply(sk.boneInverses[j]).multiply(s.bindMatrix));
      const remap = sk.bones.map((b) => { if (!boneIdx.has(b)) { boneIdx.set(b, bones.length); bones.push(b); } return boneIdx.get(b); });
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i);
        _acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        let best = 0, bw = -1;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k); if (!w) continue;
          const j = si.getComponent(i, k);
          const e = mats[j].elements; for (let q = 0; q < 16; q++) _acc.elements[q] += e[q] * w;
          if (w > bw) { bw = w; best = j; }
          SI[(vo + i) * 4 + k] = remap[j]; SW[(vo + i) * 4 + k] = w;
        }
        _v.copy(_p).applyMatrix4(_acc); _v.toArray(P, (vo + i) * 3);
        if (nor) { _nm.getNormalMatrix(mats[best]); _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); _n.toArray(N, (vo + i) * 3); }
        if (uv) { UV[(vo + i) * 2] = uv.getX(i); UV[(vo + i) * 2 + 1] = uv.getY(i); }
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo;
      else for (let i = 0; i < pos.count; i++) I[io++] = i + vo;
      vo += pos.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    const merged = new THREE.SkinnedMesh(geo, list[0].material);
    merged.name = `${list[0].name}_merged`;
    root.add(merged);
    // inverses = pose de repos exprimée dans l'espace du modèle
    const inverses = bones.map((b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld).invert());
    merged.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
    for (const s of list) s.removeFromParent();
    out.push(merged);
  }
  return out;
}
