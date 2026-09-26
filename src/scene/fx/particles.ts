// Particules par catégorie d'arme (contrat LA §6). Port TypeScript de `ParticleBurstSystem` (toon-kit.js §5,
// C:\Users\Adem\repos\bagarre-de-taverne\toon-kit.js) : pool fixe, 1 seul draw call quel que soit le nombre
// de particules vivantes (setDrawRange + swap-remove). Couleurs passées par l'appelant (weapon.palette ou
// tokens.js) : ce module ne choisit aucune couleur lui-même.
import * as THREE from 'three';
import { particules } from '../../core/quality';

const PARTICLE_VERT = /* glsl */`
attribute vec3 aColor;
attribute float aSize;
attribute float aLife;
uniform float uScale;
uniform float uMaxSize;
varying vec3 vColor;
varying float vLife;
void main() {
  vColor = aColor;
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * (0.3 + 0.7 * aLife);
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
  float edge = 1.0 - smoothstep(0.44, 0.5, d);
  float core = (1.0 - step(0.2, d)) * vLife;
  vec3 col = mix(vColor, vec3(1.0), core * 0.6);
  float a = edge * smoothstep(0.0, 0.3, vLife);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface BurstOptions {
  count?: number;
  color?: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  speed?: number | [number, number];
  life?: number | [number, number];
  size?: number | [number, number];
  gravity?: number;
  drag?: number;
  direction?: THREE.Vector3 | null;
  spread?: number;
}

const _c = new THREE.Color();
const _dir = new THREE.Vector3();
const _size = new THREE.Vector2();

function rand(range: number | [number, number]): number {
  return Array.isArray(range) ? range[0] + Math.random() * (range[1] - range[0]) : range;
}

/** Une instance par mode de fusion (additive : feu/étincelles ; normal : fumée/poussière). */
export class ParticleBurstSystem {
  readonly points: THREE.Points;
  readonly object3d: THREE.Object3D;
  private readonly max: number;
  private alive = 0;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly lives: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly lifespans: Float32Array;
  private readonly gravities: Float32Array;
  private readonly drags: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(maxParticles = 512, blending: 'additive' | 'normal' = 'additive', maxPointSize = 64) {
    this.max = maxParticles;
    const n = maxParticles;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.lives = new Float32Array(n);
    this.velocities = new Float32Array(n * 3);
    this.ages = new Float32Array(n);
    this.lifespans = new Float32Array(n);
    this.gravities = new Float32Array(n);
    this.drags = new Float32Array(n);

    const g = new THREE.BufferGeometry();
    const attr = (arr: Float32Array, size: number) => {
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    g.setAttribute('position', attr(this.positions, 3));
    g.setAttribute('aColor', attr(this.colors, 3));
    g.setAttribute('aSize', attr(this.sizes, 1));
    g.setAttribute('aLife', attr(this.lives, 1));
    g.setDrawRange(0, 0);
    this.geometry = g;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uMaxSize: { value: maxPointSize } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.raycast = () => {};
    this.object3d = this.points;
  }

  resize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(_size);
    const fov = (camera.fov ?? 50) * Math.PI / 180;
    this.material.uniforms.uScale.value = _size.y / (2 * Math.tan(fov / 2));
  }

  burst(origin: THREE.Vector3, o: BurstOptions = {}): number {
    const {
      count = 24, color = '#ffffff', speed = [2, 6], life = [0.35, 0.7],
      size = [0.15, 0.35], gravity = 6, drag = 3, direction = null, spread = 1,
    } = o;
    const colors = Array.isArray(color) ? color : [color];
    const emit = Math.min(Math.ceil(count * particules()), this.max - this.alive); // perf : ÷ 2 en palier bas (LPERF)
    for (let k = 0; k < emit; k++) {
      const i = this.alive++;
      const i3 = i * 3;
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      _dir.set(r * Math.cos(th), u, r * Math.sin(th));
      if (direction) _dir.multiplyScalar(spread).add(direction).normalize();
      const v = rand(speed);
      this.positions[i3] = origin.x; this.positions[i3 + 1] = origin.y; this.positions[i3 + 2] = origin.z;
      this.velocities[i3] = _dir.x * v; this.velocities[i3 + 1] = _dir.y * v; this.velocities[i3 + 2] = _dir.z * v;
      _c.set(colors[(Math.random() * colors.length) | 0]);
      this.colors[i3] = _c.r; this.colors[i3 + 1] = _c.g; this.colors[i3 + 2] = _c.b;
      this.sizes[i] = rand(size);
      this.ages[i] = 0;
      this.lifespans[i] = Math.max(0.01, rand(life));
      this.lives[i] = 1;
      this.gravities[i] = gravity;
      this.drags[i] = drag;
    }
    return emit;
  }

  private copy(from: number, to: number): void {
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

  /** dt en secondes (passer 0 pendant un hitstop pour figer les particules). */
  update(dt: number): void {
    if (dt > 0) {
      let i = 0;
      while (i < this.alive) {
        const age = this.ages[i] + dt;
        if (age >= this.lifespans[i]) {
          this.alive--;
          if (i !== this.alive) this.copy(this.alive, i);
          continue;
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
        const attr = g.getAttribute(name) as THREE.BufferAttribute;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, this.alive * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
    this.points.visible = this.alive > 0;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
