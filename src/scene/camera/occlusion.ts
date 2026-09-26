// "Les obstacles devant la caméra deviennent transparents" (contrat LA). Raycast caméra → point regardé ;
// tout ce qui coupe le segment (hors persos/sol/fx, via registry.occlusionExcluded) passe en fondu transparent,
// et revient à son opacité d'origine dès qu'il ne masque plus rien. Par défaut, TOUT objet de la scène est un
// obstacle valable (le futur décor du lot LM n'a rien de spécial à faire pour en bénéficier).
import * as THREE from 'three';
import { LOCAL_TOKENS } from '../localTokens';
import { registry } from '../registry';

interface FadedEntry {
  material: THREE.Material & { opacity: number; transparent: boolean; depthWrite: boolean };
  originalOpacity: number;
  originalTransparent: boolean;
  originalDepthWrite: boolean;
}

const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();
const faded = new Map<THREE.Mesh, FadedEntry>();
// Résultat du dernier passage de rayon, conservé TEL QUEL entre deux ticks (le throttle ne doit pas faire
// clignoter le fondu : sans ce cache, les images "sans raycast" croiraient que plus rien n'est masqué).
let currentHits = new Set<THREE.Mesh>();
let throttleAcc = 0;

function isExcluded(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (registry.occlusionExcluded.has(o)) return true;
    o = o.parent;
  }
  return false;
}

function raycastHits(scene: THREE.Scene, camera: THREE.Camera, focus: THREE.Vector3): Set<THREE.Mesh> {
  const hits = new Set<THREE.Mesh>();
  dir.copy(focus).sub(camera.position);
  const dist = dir.length();
  if (dist <= 0.3) return hits;
  dir.normalize();
  raycaster.set(camera.position, dir);
  raycaster.near = 0.05;
  raycaster.far = dist - 0.3; // marge : ne masque jamais la cible elle-même
  // perf : rayon sur le décor seulement. Tester les persos animés (SkinnedMesh) recalcule chaque sommet avec
  // ses os : jusqu'à 18 ms par image sur le Galion (lot LPERF). Et un perso ne doit jamais passer en fondu.
  const decor = scene.children.filter((c) => !registry.occlusionExcluded.has(c) && !registry.fighterRoots.includes(c));
  for (const hit of raycaster.intersectObjects(decor, true)) {
    const mesh = hit.object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || isExcluded(mesh)) continue;
    hits.add(mesh);
  }
  return hits;
}

export function updateOcclusion(scene: THREE.Scene, camera: THREE.Camera, focus: THREE.Vector3, dt: number): void {
  throttleAcc += dt;
  if (throttleAcc >= 1 / 15) {
    throttleAcc = 0;
    currentHits = raycastHits(scene, camera, focus);
    for (const mesh of currentHits) {
      if (faded.has(mesh)) continue;
      const material = mesh.material as FadedEntry['material'];
      faded.set(mesh, {
        material,
        originalOpacity: material.opacity,
        originalTransparent: material.transparent,
        originalDepthWrite: material.depthWrite,
      });
      material.transparent = true;
    }
  }

  const k = 1 - Math.exp(-dt / (LOCAL_TOKENS.camera.occlusionFadeMs / 1000));
  for (const [mesh, entry] of [...faded]) {
    const stillHit = currentHits.has(mesh);
    const target = stillHit ? LOCAL_TOKENS.camera.occlusionOpacity : entry.originalOpacity;
    entry.material.opacity += (target - entry.material.opacity) * k;
    if (!stillHit && Math.abs(entry.material.opacity - entry.originalOpacity) < 0.01) {
      entry.material.opacity = entry.originalOpacity;
      entry.material.transparent = entry.originalTransparent;
      entry.material.depthWrite = entry.originalDepthWrite;
      faded.delete(mesh);
    } else {
      entry.material.depthWrite = entry.material.opacity > 0.92 ? entry.originalDepthWrite : false;
    }
  }
}
