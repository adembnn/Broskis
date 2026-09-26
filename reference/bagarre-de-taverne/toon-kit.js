// toon-kit.js — mini kit "cartoon" pour Three.js (WebGLRenderer, r180+).
// Exporte : palette, makeGradientMap, createToonMaterial, addOutline, ParticleBurstSystem
// (+ helpers : computeOutlineNormals, disposeToonKit).
// Aucune dépendance hors `three`. Voir design-system-cartoon.md pour le mode d'emploi.

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NormalBlending,
  Points,
  RedFormat,
  ShaderMaterial,
  SkinnedMesh,
  Vector2,
  Vector3,
} from 'three';

// ---------------------------------------------------------------------------
// 1. Palette (hex sRGB — utilisable telle quelle en CSS et dans THREE.Color)
// ---------------------------------------------------------------------------

export const palette = Object.freeze({
  // Monde : taverne chaude
  ink: '#2B1D14',        // encre des contours (brun très sombre, jamais #000)
  woodDark: '#5C3A21',   // poutres, sol ombré
  wood: '#8B5A2B',       // planches, tables
  woodLight: '#C68B4E',  // bois éclairé, tonneaux
  stone: '#8E8272',      // murs, cheminée
  parchment: '#F3E3C3',  // panneaux UI, nappes, ciel de lumière
  hearth: '#F2A541',     // ambre du foyer, or, accents chauds
  tomato: '#D9483B',     // danger, PV, bannières
  moss: '#6E8B3D',       // plantes, bouteilles, validation
  teal: '#2E7F7A',       // contraste froid (mana, boutons secondaires)

  // Éléments de sorts : core = cœur (le plus clair), main = teinte, dark = traîne / ombre
  element: Object.freeze({
    fire:      Object.freeze({ core: '#FFE066', main: '#FF6A1F', dark: '#B3261E', blending: 'additive' }),
    ice:       Object.freeze({ core: '#F2FDFF', main: '#7FD6F0', dark: '#2B7FA8', blending: 'additive' }),
    lightning: Object.freeze({ core: '#FFFFFF', main: '#FFE94A', dark: '#E0A800', blending: 'additive' }),
    nature:    Object.freeze({ core: '#E4FF9A', main: '#6CC43A', dark: '#2F6B22', blending: 'normal' }),
    arcane:    Object.freeze({ core: '#FFE3F2', main: '#E0479E', dark: '#8A1F5C', blending: 'additive' }),
    shadow:    Object.freeze({ core: '#8C5AA8', main: '#3A2340', dark: '#150C18', blending: 'normal' }),
    earth:     Object.freeze({ core: '#F0C987', main: '#B07A3F', dark: '#5E3A1A', blending: 'normal' }),
    holy:      Object.freeze({ core: '#FFFFFF', main: '#FFF1B8', dark: '#E8B84A', blending: 'additive' }),
  }),
});

// ---------------------------------------------------------------------------
// 2. Gradient map (toon ramp)
// ---------------------------------------------------------------------------

const _gradientCache = new Map();

/**
 * Rampe de toon shading en N paliers (DataTexture N×1, RedFormat, NearestFilter).
 * @param {number} steps   nombre de paliers (2 à 5 ; 3 recommandé)
 * @param {object} [opts]
 * @param {number} [opts.min=0.35] luminosité du palier le plus sombre (0..1). >0 évite le noir pur.
 * @param {number} [opts.max=1]    luminosité du palier le plus clair
 * @returns {DataTexture} texture partagée (mise en cache par paramètres) — ne pas la modifier.
 */
export function makeGradientMap(steps = 3, { min = 0.35, max = 1 } = {}) {
  const n = Math.max(2, Math.floor(steps));
  const key = `${n}|${min}|${max}`;
  const cached = _gradientCache.get(key);
  if (cached) return cached;

  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    data[i] = Math.round((min + (max - min) * t) * 255);
  }
  const tex = new DataTexture(data, n, 1, RedFormat);
  tex.minFilter = NearestFilter; // exigé par la doc de MeshToonMaterial.gradientMap
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradientCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// 3. Matériau toon
// ---------------------------------------------------------------------------

/**
 * @param {string|number|Color} color couleur de base (idéalement un token de `palette`)
 * @param {object} [opts] paramètres MeshToonMaterial supplémentaires + `steps`
 * @returns {MeshToonMaterial}
 */
export function createToonMaterial(color = palette.woodLight, opts = {}) {
  const { steps = 3, gradientMin, ...rest } = opts;
  return new MeshToonMaterial({
    color: new Color(color),
    gradientMap: makeGradientMap(steps, gradientMin !== undefined ? { min: gradientMin } : undefined),
    ...rest,
  });
}

// ---------------------------------------------------------------------------
// 4. Contour "inverted hull" (coque inversée, BackSide, extrudée le long de normales lissées)
// ---------------------------------------------------------------------------

/**
 * Calcule un attribut `outlineNormal` = moyenne des normales de tous les sommets partageant
 * la même position. Supprime les trous du contour sur les arêtes dures / flat shading,
 * sans toucher aux normales utilisées par l'éclairage. Coût : une passe CPU O(n), une seule fois.
 */
export function computeOutlineNormals(geometry, precision = 1e4) {
  if (geometry.getAttribute('outlineNormal')) return geometry.getAttribute('outlineNormal');
  const pos = geometry.getAttribute('position');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nrm = geometry.getAttribute('normal');

  const acc = new Map();
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * precision)}|${Math.round(pos.getY(i) * precision)}|${Math.round(pos.getZ(i) * precision)}`;
    keys[i] = k;
    let a = acc.get(k);
    if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keys[i]);
    const len = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / len; out[i * 3 + 1] = a[1] / len; out[i * 3 + 2] = a[2] / len;
  }
  const attr = new BufferAttribute(out, 3);
  geometry.setAttribute('outlineNormal', attr);
  return attr;
}

const _outlineMaterialCache = new Map();

// Fonction partagée => même clé de cache de programme pour tous les matériaux de contour
// (un seul shader compilé par variante skinning/instancing), uniforms propres à chaque matériau.
function _outlineOnBeforeCompile(shader) {
  shader.uniforms.uOutlineThickness = this.userData.thicknessUniform;
  shader.vertexShader =
    'attribute vec3 outlineNormal;\nuniform float uOutlineThickness;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += outlineNormal * uOutlineThickness;'
    );
}

function _getOutlineMaterial(color, thickness) {
  const c = new Color(color);
  const key = `${c.getHexString()}|${thickness.toFixed(5)}`;
  let m = _outlineMaterialCache.get(key);
  if (m) return m;
  m = new MeshBasicMaterial({ color: c, side: BackSide });
  m.userData.thicknessUniform = { value: thickness };
  m.onBeforeCompile = _outlineOnBeforeCompile;
  _outlineMaterialCache.set(key, m);
  return m;
}

const _ws = new Vector3();

/**
 * Ajoute un contour cartoon à `mesh` (enfant qui partage la géométrie : 1 draw call de plus).
 * Gère Mesh, SkinnedMesh (squelette partagé) et InstancedMesh (instanceMatrix partagée).
 * @param {Mesh} mesh
 * @param {number} [thickness=0.03] épaisseur en unités MONDE (compensée par l'échelle actuelle du mesh)
 * @param {string|number|Color} [color=palette.ink]
 * @returns {Mesh} le mesh de contour (déjà ajouté comme enfant ; `mesh.userData.outline`)
 */
export function addOutline(mesh, thickness = 0.03, color = palette.ink) {
  if (mesh.userData.outline) return mesh.userData.outline;
  const geometry = mesh.geometry;
  computeOutlineNormals(geometry);

  mesh.updateWorldMatrix(true, false);
  mesh.getWorldScale(_ws);
  const s = Math.max(Math.abs(_ws.x), Math.abs(_ws.y), Math.abs(_ws.z)) || 1;
  const material = _getOutlineMaterial(color, thickness / s);

  let outline;
  if (mesh.isSkinnedMesh) {
    outline = new SkinnedMesh(geometry, material);
    outline.bindMode = mesh.bindMode;
    outline.bind(mesh.skeleton, mesh.bindMatrix);
  } else if (mesh.isInstancedMesh) {
    outline = new InstancedMesh(geometry, material, mesh.instanceMatrix.count);
    outline.instanceMatrix = mesh.instanceMatrix; // partagé : setMatrixAt sur l'original suffit
    outline.count = mesh.count;                   // à resynchroniser si mesh.count change
  } else {
    outline = new Mesh(geometry, material);
  }
  outline.name = `${mesh.name || 'mesh'}__outline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.raycast = () => {};         // ne pollue pas les picks / hit tests
  outline.userData.isOutline = true;
  mesh.add(outline);
  mesh.userData.outline = outline;
  return outline;
}

// ---------------------------------------------------------------------------
// 5. Système de particules "burst" (THREE.Points, buffer poolé, 1 draw call)
// ---------------------------------------------------------------------------

const PARTICLE_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aSize;
attribute float aLife;   // 1 = naissance, 0 = mort
uniform float uScale;    // hauteur drawing buffer / (2 * tan(fov/2))
uniform float uMaxSize;
varying vec3 vColor;
varying float vLife;
void main() {
  vColor = aColor;
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * (0.3 + 0.7 * aLife);             // rétrécit en mourant
  gl_PointSize = min(s * uScale / max(-mv.z, 0.001), uMaxSize);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */`
varying vec3 vColor;
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // disque à bord net (cartoon) + cœur clair tant que la particule est jeune
  float edge = 1.0 - smoothstep(0.44, 0.5, d);
  float core = (1.0 - step(0.2, d)) * vLife;
  vec3 col = mix(vColor, vec3(1.0), core * 0.6);
  float a = edge * smoothstep(0.0, 0.3, vLife);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _c = new Color();
const _dir = new Vector3();
const _size = new Vector2();

function _rand(range) {
  return Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range;
}

/**
 * Pool fixe de particules. Les vivantes sont compactées dans [0, alive) (swap-remove),
 * donc on ne dessine et n'uploade que ce qui vit (setDrawRange + addUpdateRange).
 * Utiliser une instance par mode de fusion (additive pour feu/glace/foudre, normal pour ombre/nature).
 */
export class ParticleBurstSystem {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxParticles=1024]
   * @param {'additive'|'normal'} [opts.blending='additive']
   * @param {number} [opts.maxPointSize=64] plafond en px (les iGPU limitent gl_PointSize)
   */
  constructor({ maxParticles = 1024, blending = 'additive', maxPointSize = 64 } = {}) {
    this.max = maxParticles;
    this.alive = 0;
    const n = maxParticles;

    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.lives = new Float32Array(n);
    // état CPU seulement
    this.velocities = new Float32Array(n * 3);
    this.ages = new Float32Array(n);
    this.lifespans = new Float32Array(n);
    this.gravities = new Float32Array(n);
    this.drags = new Float32Array(n);

    const g = new BufferGeometry();
    const mk = (arr, size) => new BufferAttribute(arr, size).setUsage(DynamicDrawUsage);
    g.setAttribute('position', mk(this.positions, 3));
    g.setAttribute('aColor', mk(this.colors, 3));
    g.setAttribute('aSize', mk(this.sizes, 1));
    g.setAttribute('aLife', mk(this.lives, 1));
    g.setDrawRange(0, 0);
    this.geometry = g;

    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uMaxSize: { value: maxPointSize } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: blending === 'normal' ? NormalBlending : AdditiveBlending,
    });

    this.points = new Points(g, this.material);
    this.points.frustumCulled = false; // bounding sphere invalide avec des positions dynamiques
    this.points.renderOrder = 10;      // après les opaques et les contours
    this.object3d = this.points;
  }

  /** À appeler au resize (et au démarrage) : conversion taille monde -> pixels. */
  resize(renderer, camera) {
    renderer.getDrawingBufferSize(_size);
    const fov = (camera.fov ?? 50) * Math.PI / 180;
    this.material.uniforms.uScale.value = _size.y / (2 * Math.tan(fov / 2));
  }

  /**
   * Émet `count` particules. Ce qui dépasse le pool est ignoré (budget garanti).
   * @param {Vector3|{x,y,z}} origin
   * @param {object} [o]
   * @param {number} [o.count=24]
   * @param {string|number|Color|Array} [o.color] une couleur ou une liste (tirage aléatoire)
   * @param {number|number[]} [o.speed=[2,6]]   unités/s
   * @param {number|number[]} [o.life=[0.35,0.7]] secondes
   * @param {number|number[]} [o.size=[0.15,0.35]] unités monde
   * @param {number} [o.gravity=6]  unités/s² (négatif = monte, ex. flammes)
   * @param {number} [o.drag=3]     amortissement exponentiel /s
   * @param {Vector3} [o.direction] direction privilégiée (sinon sphère)
   * @param {number} [o.spread=1]   0 = jet droit, 1 = très ouvert (avec direction)
   * @returns {number} nombre de particules réellement émises
   */
  burst(origin, o = {}) {
    const {
      count = 24, color = palette.element.fire.main, speed = [2, 6], life = [0.35, 0.7],
      size = [0.15, 0.35], gravity = 6, drag = 3, direction = null, spread = 1,
    } = o;
    const colors = Array.isArray(color) ? color : [color];
    const emit = Math.min(count, this.max - this.alive);
    for (let k = 0; k < emit; k++) {
      const i = this.alive++;
      const i3 = i * 3;
      // direction aléatoire uniforme sur la sphère
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      _dir.set(r * Math.cos(th), u, r * Math.sin(th));
      if (direction) _dir.multiplyScalar(spread).add(direction).normalize();
      const v = _rand(speed);
      this.positions[i3] = origin.x; this.positions[i3 + 1] = origin.y; this.positions[i3 + 2] = origin.z;
      this.velocities[i3] = _dir.x * v; this.velocities[i3 + 1] = _dir.y * v; this.velocities[i3 + 2] = _dir.z * v;
      _c.set(colors[(Math.random() * colors.length) | 0]);
      this.colors[i3] = _c.r; this.colors[i3 + 1] = _c.g; this.colors[i3 + 2] = _c.b;
      this.sizes[i] = _rand(size);
      this.ages[i] = 0;
      this.lifespans[i] = Math.max(0.01, _rand(life));
      this.lives[i] = 1;
      this.gravities[i] = gravity;
      this.drags[i] = drag;
    }
    return emit;
  }

  _copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let a = 0; a < 3; a++) {
      this.positions[t3 + a] = this.positions[f3 + a];
      this.velocities[t3 + a] = this.velocities[f3 + a];
      this.colors[t3 + a] = this.colors[f3 + a];
    }
    this.sizes[to] = this.sizes[from];
    this.lives[to] = this.lives[from];
    this.ages[to] = this.ages[from];
    this.lifespans[to] = this.lifespans[from];
    this.gravities[to] = this.gravities[from];
    this.drags[to] = this.drags[from];
  }

  /** @param {number} dt secondes (passer 0 pendant un hitstop pour figer les particules) */
  update(dt) {
    if (dt > 0) {
      let i = 0;
      while (i < this.alive) {
        const age = this.ages[i] + dt;
        if (age >= this.lifespans[i]) {
          this.alive--;
          if (i !== this.alive) this._copy(this.alive, i);
          continue; // réexaminer l'index i (nouvelle particule)
        }
        this.ages[i] = age;
        this.lives[i] = 1 - age / this.lifespans[i];
        const i3 = i * 3;
        const damp = Math.exp(-this.drags[i] * dt);
        this.velocities[i3] *= damp;
        this.velocities[i3 + 1] = this.velocities[i3 + 1] * damp - this.gravities[i] * dt;
        this.velocities[i3 + 2] *= damp;
        this.positions[i3] += this.velocities[i3] * dt;
        this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
        this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
        i++;
      }
    }
    const g = this.geometry;
    g.setDrawRange(0, this.alive);
    if (this.alive > 0) {
      for (const name of ['position', 'aColor', 'aSize', 'aLife']) {
        const attr = g.getAttribute(name);
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, this.alive * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
    this.points.visible = this.alive > 0; // 0 draw call quand rien ne vit
  }

  clear() { this.alive = 0; this.geometry.setDrawRange(0, 0); this.points.visible = false; }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// 6. Nettoyage des ressources partagées du kit (changement de scène / HMR Vite)
// ---------------------------------------------------------------------------

export function disposeToonKit() {
  for (const t of _gradientCache.values()) t.dispose();
  for (const m of _outlineMaterialCache.values()) m.dispose();
  _gradientCache.clear();
  _outlineMaterialCache.clear();
}
