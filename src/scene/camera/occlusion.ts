// Occlusion PAR VUE (lot RTVIEW, repris de LFIX2/LPERF) : le décor qui masque un perso devient transparent
// dans la vue où il masque, et seulement là. Le fondu porte sur un CLONE du matériau, pris au 1er fondu et
// rendu à la fin : un accessoire qui partage son matériau avec d'autres ne les estompe pas avec lui. Les
// opacités de chaque vue sont posées juste avant de dessiner cette vue (ctx.three.onBeforeView).
// Perf (mesuré sur le Galion) : un rayon « triangle par triangle » sur toute la map coûtait ~30 ms par passage
// en écran scindé (pics à 15 Hz). On teste donc des BOÎTES, sur une liste d'objets du décor de taille
// « accessoire » (ni sol, ni coque, ni ciel) tenue à jour toutes les 2 s : moins de 0,1 ms par passage.
import * as THREE from 'three';
import type { PlayerId } from '../../core/types';
import { registry } from '../registry';
import { RTVIEW } from './tokens';

type FadeMaterial = THREE.Material & { opacity: number; transparent: boolean; depthWrite: boolean };

interface Faded {
  original: THREE.Material;
  clone: FadeMaterial;
  base: number;
  baseDepthWrite: boolean;
  /** Opacité courante dans la vue de P1, de P2. */
  opacity: [number, number];
}

const ray = new THREE.Ray();
const box = new THREE.Box3();
const hitPoint = new THREE.Vector3();
const dir = new THREE.Vector3();
const scale = new THREE.Vector3();
const faded = new Map<THREE.Mesh, Faded>();
// Dernier résultat des rayons, gardé tel quel entre deux passages (15 Hz) : sinon le fondu clignoterait.
const hits: [Set<THREE.Mesh>, Set<THREE.Mesh>] = [new Set(), new Set()];
let candidates: THREE.Mesh[] = [];

function collect(o: THREE.Object3D, out: THREE.Mesh[]): void {
  // Plateformes à sauter (maps/engine.ts les exclut) : en troisième personne, une planche entre la caméra et
  // son perso le cachait entièrement (Cuisine, planche à découper, mesuré). Seul le plateau ne s'efface jamais.
  const excluded = registry.occlusionExcluded.has(o) && !o.name.startsWith('oneway-');
  if (!o.visible || excluded || registry.fighterRoots.includes(o)) return;
  const m = o as THREE.Mesh;
  if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.isOutline && !Array.isArray(m.material)) {
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    m.getWorldScale(scale);
    const r = g.boundingSphere!.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    if (r >= RTVIEW.occlusion.rayonMin && r <= RTVIEW.occlusion.rayonMax) out.push(m);
  }
  for (const c of o.children) collect(c, out);
}

/** Relit le décor (nouvelle map, pièces qui tombent) : objets de taille accessoire, hors persos et exclus. */
export function refreshOccluders(scene: THREE.Scene): void {
  const out: THREE.Mesh[] = [];
  for (const c of scene.children) collect(c, out);
  candidates = out;
}

/** Boîte monde d'un objet (celle de sa géométrie, transformée) : suit les pièces qui bougent. */
function worldBox(m: THREE.Mesh): THREE.Box3 {
  return box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
}

/** Rayons de la caméra de `view` vers les cibles (torses) : ce qui coupe un rayon sera estompé dans cette vue. */
export function raycastOcclusion(view: PlayerId, camera: THREE.Camera, targets: THREE.Vector3[]): void {
  const set = hits[view];
  set.clear();
  for (const target of targets) {
    dir.copy(target).sub(camera.position);
    const dist = dir.length();
    if (dist <= 0.3) continue;
    ray.set(camera.position, dir.divideScalar(dist));
    const far = dist - 0.3; // marge : ne masque jamais la cible elle-même
    for (const m of candidates) {
      if (!m.parent || !ray.intersectBox(worldBox(m), hitPoint)) continue;
      if (hitPoint.distanceTo(camera.position) <= far) set.add(m);
    }
  }
  for (const mesh of set) {
    if (faded.has(mesh)) continue;
    const original = mesh.material as FadeMaterial;
    const clone = original.clone() as FadeMaterial;
    clone.transparent = true; // nouveau matériau : son shader transparent est choisi au 1er dessin
    mesh.material = clone;
    faded.set(mesh, { original, clone, base: original.opacity, baseDepthWrite: original.depthWrite, opacity: [original.opacity, original.opacity] });
  }
}

/**
 * Collision caméra ↔ décor : si la caméra voulue tombe DANS un objet du décor, distance (depuis `from`, le torse)
 * où le rayon torse → caméra y entre ; sinon null (l'occlusion suffit : rentrer derrière chaque plateforme
 * collerait la caméra au perso).
 */
export function cameraInsideDecor(from: THREE.Vector3, cam: THREE.Vector3): number | null {
  let best: number | null = null;
  dir.copy(cam).sub(from);
  const len = dir.length();
  if (len < 1e-3) return null;
  ray.set(from, dir.divideScalar(len));
  for (const m of candidates) {
    if (!m.parent || !worldBox(m).containsPoint(cam)) continue;
    if (box.containsPoint(from)) continue; // le perso est lui-même dans la boîte (sous un toit, contre un mât) : on ignore
    if (!ray.intersectBox(box, hitPoint)) continue;
    const d = hitPoint.distanceTo(from);
    if (best == null || d < best) best = d;
  }
  return best;
}

/** Vue cachée (mode solo) : plus rien n'y est masqué. */
export function clearOcclusion(view: PlayerId): void {
  hits[view].clear();
}

/** Fait glisser les opacités vers leur cible dans chaque vue ; rend le matériau d'origine quand plus rien ne masque. */
export function stepOcclusion(dt: number): void {
  const k = 1 - Math.exp(-dt / (RTVIEW.occlusion.fonduMs / 1000));
  for (const [mesh, e] of faded) {
    let settled = true;
    for (const v of [0, 1] as const) {
      const hit = hits[v].has(mesh);
      const target = hit ? e.base * RTVIEW.occlusion.opacite : e.base;
      e.opacity[v] += (target - e.opacity[v]) * k;
      if (hit || Math.abs(e.opacity[v] - e.base) > 0.01) settled = false;
    }
    if (settled) {
      mesh.material = e.original;
      e.clone.dispose();
      faded.delete(mesh);
    }
  }
}

/** Juste avant de dessiner la vue `view` : chaque matériau estompé prend l'opacité de cette vue. */
export function applyOcclusion(view: PlayerId): void {
  for (const e of faded.values()) {
    const o = e.opacity[view];
    e.clone.opacity = o;
    e.clone.depthWrite = o > e.base * 0.92 ? e.baseDepthWrite : false;
  }
}

/** Nouveau match (autre map) : tout redevient opaque tout de suite, la liste du décor est à relire. */
export function resetOcclusion(): void {
  for (const [mesh, e] of faded) {
    mesh.material = e.original;
    e.clone.dispose();
  }
  faded.clear();
  hits[0].clear();
  hits[1].clear();
  candidates = [];
}
