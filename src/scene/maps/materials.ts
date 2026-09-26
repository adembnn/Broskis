// Matières des maps (LMAP2, retour « trop cartoon ») : fini l'ombrage en 2 aplats et les contours d'encre sur
// le décor. Les packs KayKit/Kenney passent en MeshStandardMaterial (leurs textures, rugosité mate), le décor
// lointain garde la désaturation + teinte des tokens (maps.<id>.decor) pour reculer derrière le plateau.
// Les rayures d'alerte (jaune/encre) restent le seul signal de danger : elles clignotent pendant le préavis.
import * as THREE from 'three';
import { palette, rendu } from './tokens';

export interface Grade { saturation?: number; tint?: string }

const ROUGHNESS = 0.78; // mat « premium » (plage 0,55-0,8 du lot LDA2)

function applyGrade(mat: THREE.MeshStandardMaterial, saturation: number, tint: string) {
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
  mat.customProgramCacheKey = () => `map-grade-${saturation.toFixed(3)}-${tint}`;
}

const gradeKey = (g: Grade) => `${g.saturation ?? 1}|${g.tint ?? '#ffffff'}`;

const pbrCache = new Map<string, THREE.MeshStandardMaterial>();
/** Matériau chargé (glTF) -> MeshStandardMaterial mat, même texture, mis en cache. */
export function pbrify(src: THREE.Material, grade: Grade = {}): THREE.MeshStandardMaterial {
  const key = `${src.uuid}|${gradeKey(grade)}`;
  const cached = pbrCache.get(key);
  if (cached) return cached;
  const base = src as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardMaterial({
    map: base.map ?? null,
    color: base.color ? base.color.clone() : new THREE.Color(0xffffff),
    vertexColors: base.vertexColors === true,
    roughness: ROUGHNESS,
    metalness: 0,
    transparent: base.transparent,
    opacity: base.opacity ?? 1,
    side: base.side ?? THREE.FrontSide,
    alphaTest: base.alphaTest ?? 0,
  });
  applyGrade(mat, grade.saturation ?? 1, grade.tint ?? '#ffffff');
  mat.name = `map(${src.name || src.uuid.slice(0, 6)})`;
  pbrCache.set(key, mat);
  return mat;
}

const flatCache = new Map<string, THREE.MeshStandardMaterial>();
/** Matériau uni (pièces procédurales : roche, dalle, grille-pain…). */
export function flatMat(color: string, grade: Grade = {}, roughness = ROUGHNESS): THREE.MeshStandardMaterial {
  const key = `${color}|${gradeKey(grade)}|${roughness}`;
  const cached = flatCache.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
  applyGrade(mat, grade.saturation ?? 1, grade.tint ?? '#ffffff');
  flatCache.set(key, mat);
  return mat;
}

/** pbrify() sur tout un sous-arbre ; ombres portées/reçues au choix (le décor lointain n'en porte pas). */
export function stylizeTree(root: THREE.Object3D, grade: Grade = {}, { cast = true, receive = true } = {}): THREE.Object3D {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map((m) => pbrify(m, grade));
    else mesh.material = pbrify(mesh.material, grade);
  });
  return root;
}

// ---------------------------------------------------------------------------
// Rayures d'alerte (rendu.rayures : bandes ALERTE / ENCRE à 45°). UV en coordonnées MONDE : plusieurs
// zones fusionnées en une seule géométrie gardent des rayures continues (1 appel de dessin par zone).
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
  // Bandes à 45° raccordables : diagonales qui bouclent exactement sur la tuile de texture.
  for (let k = -2; k < 2; k++) {
    c.beginPath();
    c.moveTo(k * size, size);
    c.lineTo(k * size + size / 2, size);
    c.lineTo(k * size + size / 2 + size, 0);
    c.lineTo(k * size + size, 0);
    c.closePath();
    c.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  hazardTex = tex;
  return tex;
}

/** Matériau des zones d'alerte ; son opacité est animée (clignotement) par le moteur. */
export function hazardMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: hazardTexture(), transparent: true, opacity: 0.85, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/** Réécrit les UV d'une géométrie posée à plat (XZ monde) : une période de rayures = 2 × rendu.rayures.largeur. */
export function worldStripeUVs(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const period = rendu.rayures.largeur * 2;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / period;
    uv[i * 2 + 1] = pos.getZ(i) / period;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Rectangle d'alerte (bande balayée, bord qui va gîter…), centré en (x, z), taille en mètres. */
export function hazardRect(cx: number, cz: number, sizeX: number, sizeZ: number, y = 0.03): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ).rotateX(-Math.PI / 2).translate(cx, y, cz);
  worldStripeUVs(geo);
  const mesh = new THREE.Mesh(geo, hazardMaterial());
  mesh.renderOrder = 2;
  mesh.userData.hazard = true;
  return mesh;
}
