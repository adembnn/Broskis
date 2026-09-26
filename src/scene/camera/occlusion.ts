// Occlusion PAR VUE (lot RTVIEW, repris de LFIX2/LPERF) : le décor qui masque un perso devient transparent
// dans la vue où il masque, et seulement là. Rayons caméra → torse des 2 persos, sur le décor seulement (persos,
// sol, effets exclus : registry.occlusionExcluded). Le fondu porte sur un CLONE du matériau, pris au 1er fondu
// et rendu à la fin : un accessoire qui partage son matériau avec d'autres ne les estompe pas avec lui.
// Les opacités de chaque vue sont posées juste avant de dessiner cette vue (ctx.three.onBeforeView).
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

const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();
const faded = new Map<THREE.Mesh, Faded>();
// Dernier résultat des rayons, gardé tel quel entre deux passages (15 Hz) : sinon le fondu clignoterait.
const hits: [Set<THREE.Mesh>, Set<THREE.Mesh>] = [new Set(), new Set()];

function isExcluded(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (registry.occlusionExcluded.has(o)) return true;
    o = o.parent;
  }
  return false;
}

/** Racines du décor : ni persos, ni objets exclus (tester un perso animé recalcule chaque sommet, lot LPERF). */
export function decorRoots(scene: THREE.Scene): THREE.Object3D[] {
  return scene.children.filter((c) => !registry.occlusionExcluded.has(c) && !registry.fighterRoots.includes(c));
}

/** Rayons de la caméra de `view` vers les cibles (torses) : ce qui coupe un rayon sera estompé dans cette vue. */
export function raycastOcclusion(view: PlayerId, decor: THREE.Object3D[], camera: THREE.Camera, targets: THREE.Vector3[]): void {
  const set = hits[view];
  set.clear();
  for (const target of targets) {
    dir.copy(target).sub(camera.position);
    const dist = dir.length();
    if (dist <= 0.3) continue;
    dir.normalize();
    raycaster.set(camera.position, dir);
    raycaster.camera = camera; // exigé par THREE.Sprite.raycast (sinon une erreur à chaque passage)
    raycaster.near = 0.05;
    raycaster.far = dist - 0.3; // marge : ne masque jamais la cible elle-même
    for (const hit of raycaster.intersectObjects(decor, true)) {
      const mesh = hit.object as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || isExcluded(mesh)) continue;
      set.add(mesh);
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

/** Nouveau match (autre map) : tout redevient opaque tout de suite. */
export function resetOcclusion(): void {
  for (const [mesh, e] of faded) {
    mesh.material = e.original;
    e.clone.dispose();
  }
  faded.clear();
  hits[0].clear();
  hits[1].clear();
}
