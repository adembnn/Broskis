// Traînée en ruban face caméra (lancer, traçante) : N derniers points, largeur et opacité décroissantes vers la
// queue. Une géométrie fixe mise à jour sur place (pas d'allocation par image).
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _side = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _col = new THREE.Color();

export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly pts: THREE.Vector3[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly n: number;
  private readonly width: number;
  private readonly alpha: number;

  constructor(n: number, width: number, color: THREE.ColorRepresentation, alpha = 0.9, additive = false) {
    this.n = n; this.width = width; this.alpha = alpha;
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 7;
    _col.set(color);
    for (let i = 0; i < n * 2; i++) { this.col[i * 4] = _col.r; this.col[i * 4 + 1] = _col.g; this.col[i * 4 + 2] = _col.b; }
  }

  reset(): void { this.pts.length = 0; this.mesh.visible = false; }

  push(p: THREE.Vector3): void {
    const last = this.pts[0];
    if (last && last.distanceToSquared(p) < 0.0025) { last.copy(p); return; }
    const v = this.pts.length >= this.n ? this.pts.pop()! : new THREE.Vector3();
    this.pts.unshift(v.copy(p));
  }

  /** Raccourcit la queue (objet arrêté) : la traînée se résorbe au lieu de disparaître d'un coup. */
  shrink(): void { if (this.pts.length > 0) this.pts.pop(); }

  update(camera: THREE.Camera): void {
    const m = this.pts.length;
    this.mesh.visible = m >= 2;
    if (m < 2) return;
    for (let i = 0; i < this.n; i++) {
      const k = Math.min(i, m - 1);
      const p = this.pts[k];
      const q = this.pts[Math.min(k + 1, m - 1)];
      const r = this.pts[Math.max(k - 1, 0)];
      _a.subVectors(r, q);
      if (_a.lengthSq() < 1e-8) _a.set(0, 1, 0);
      _toCam.subVectors(camera.position, p);
      _side.crossVectors(_a, _toCam).normalize();
      const u = k / (m - 1);
      const w = this.width * (1 - u) * (i < m ? 1 : 0);
      const o = i * 6;
      this.pos[o] = p.x + _side.x * w; this.pos[o + 1] = p.y + _side.y * w; this.pos[o + 2] = p.z + _side.z * w;
      this.pos[o + 3] = p.x - _side.x * w; this.pos[o + 4] = p.y - _side.y * w; this.pos[o + 5] = p.z - _side.z * w;
      const a = i < m ? this.alpha * (1 - u) * (1 - u) : 0;
      this.col[i * 8 + 3] = a; this.col[i * 8 + 7] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
