// Revêtements des maps (lot LMAP3) : textures de détail procédurales (canvas 256 px, niveaux de gris centrés
// sur 0,5) projetées en « triplanaire » (3 projections mélangées selon la normale : aucune UV nécessaire, donc
// ça marche aussi sur les pièces du kit LKIT qui n'ont que des couleurs de sommet). Le détail MULTIPLIE la
// couleur d'origine : grain du bois, brins d'herbe, grain de pierre, faïence. Valeurs visuelles : SURFACES
// (tokens.ts). Même hook de shader : `clampY` aplatit tout ce qui dépasse une hauteur (mâts de la coque).
import * as THREE from 'three';
import { SURFACES, type DetailKind } from './tokens';

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const SIZE = 256;

/** Bruit de valeur lissé et tuilable (période = SIZE), octaves additionnées. */
function tileableNoise(rnd: () => number, cells: number): (x: number, y: number) => number {
  const g = Array.from({ length: cells * cells }, () => rnd());
  const at = (i: number, j: number) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)]!;
  return (x, y) => {
    const fx = (x / SIZE) * cells, fy = (y / SIZE) * cells;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function paint(kind: DetailKind): Uint8ClampedArray {
  const rnd = seeded(kind.length * 131 + 7);
  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  const n1 = tileableNoise(rnd, 4), n2 = tileableNoise(rnd, 16), n3 = tileableNoise(rnd, 64);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = 0.5;
      if (kind === 'bois') {
        // Veines longues le long de U : bruit très étiré + sinus des cernes, quelques nœuds sombres.
        const warp = n1(x * 0.25, y * 4) * 6 + n2(x * 0.5, y * 2) * 1.5;
        const ring = Math.sin((y / SIZE) * Math.PI * 2 * 11 + warp);
        v = 0.5 + ring * 0.09 + (n3(x * 0.2, y * 3) - 0.5) * 0.12 + (n1(x, y) - 0.5) * 0.18;
      } else if (kind === 'herbe') {
        // Taches claires/sombres + brins (grain fin très contrasté).
        v = 0.5 + (n1(x, y) - 0.5) * 0.28 + (n2(x, y) - 0.5) * 0.16 + (n3(x, y) - 0.5) * 0.34;
      } else if (kind === 'pierre') {
        const f = n2(x, y);
        const crack = Math.abs(f - 0.5) < 0.012 ? -0.22 : 0; // fissures fines (isoligne du bruit)
        v = 0.5 + (n1(x, y) - 0.5) * 0.3 + (n3(x, y) - 0.5) * 0.22 + crack;
      } else {
        // faience : presque lisse, léger mouchetis
        v = 0.5 + (n2(x, y) - 0.5) * 0.08 + (n3(x, y) - 0.5) * 0.1;
      }
      const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
      const o = (y * SIZE + x) * 4;
      px[o] = c; px[o + 1] = c; px[o + 2] = c; px[o + 3] = 255;
    }
  }
  return px;
}

const texCache = new Map<DetailKind, THREE.DataTexture>();
function detailTexture(kind: DetailKind): THREE.DataTexture {
  let t = texCache.get(kind);
  if (t) return t;
  t = new THREE.DataTexture(paint(kind), SIZE, SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  texCache.set(kind, t);
  return t;
}

export interface SurfaceOpts {
  detail?: DetailKind;
  /** 'world' : détail fixe dans le monde (sols) ; 'local' : suit l'objet (accessoires qui roulent). */
  space?: 'world' | 'local';
  /** Aplatit les sommets au-dessus de cette hauteur (repère du modèle). */
  clampY?: number;
}

const matCache = new Map<string, THREE.Material>();

/** Copie du matériau avec détail triplanaire et/ou écrêtage en hauteur (chaîne l'onBeforeCompile existant). */
export function surfaceMaterial(src: THREE.Material, opts: SurfaceOpts): THREE.Material {
  if (!opts.detail && opts.clampY == null) return src;
  const key = `${src.uuid}|${opts.detail ?? ''}|${opts.space ?? 'world'}|${opts.clampY ?? ''}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const mat = src.clone() as THREE.MeshStandardMaterial;
  const prev = src.onBeforeCompile.bind(src);
  const prevKey = src.customProgramCacheKey.bind(src);
  const s = opts.detail ? SURFACES[opts.detail] : null;
  const uDet = { value: opts.detail ? detailTexture(opts.detail) : null };
  const uScale = { value: s?.echelle ?? 1 };
  const uStrength = { value: s?.force ?? 0 };
  const local = opts.space === 'local';
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    if (opts.clampY != null) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y = min(transformed.y, ${opts.clampY.toFixed(4)});`);
    }
    if (opts.detail) {
      shader.uniforms.uDet = uDet;
      shader.uniforms.uDetScale = uScale;
      shader.uniforms.uDetStrength = uStrength;
      vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vDetPos;\nvarying vec3 vDetNrm;')
        .replace('#include <project_vertex>', `#include <project_vertex>
        {
          ${local ? `vDetPos = transformed; vDetNrm = objectNormal;` : `
          vec4 dwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            dwp = instanceMatrix * dwp;
          #endif
          vDetPos = (modelMatrix * dwp).xyz;
          vDetNrm = mat3(modelMatrix) * objectNormal;`}
        }`);
      fs = fs.replace('#include <common>', '#include <common>\nuniform sampler2D uDet;\nuniform float uDetScale;\nuniform float uDetStrength;\nvarying vec3 vDetPos;\nvarying vec3 vDetNrm;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 bw = pow(abs(normalize(vDetNrm)), vec3(4.0));
          bw /= (bw.x + bw.y + bw.z + 1e-5);
          vec3 p = vDetPos * uDetScale;
          float d = texture2D(uDet, p.zy).r * bw.x + texture2D(uDet, p.xz).r * bw.y + texture2D(uDet, p.xy).r * bw.z;
          diffuseColor.rgb *= mix(1.0, d * 2.0, uDetStrength);
        }`);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `${prevKey()}|surf-${opts.detail ?? ''}-${local ? 'l' : 'w'}-${opts.clampY ?? ''}`;
  matCache.set(key, mat);
  return mat;
}

/** surfaceMaterial() sur tout un sous-arbre. */
export function applySurface(root: THREE.Object3D, opts: SurfaceOpts) {
  if (!opts.detail && opts.clampY == null) return;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map((x) => surfaceMaterial(x, opts)) : surfaceMaterial(m.material, opts);
  });
}
