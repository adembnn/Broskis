// Registre interne partagé par les sous-modules du lot LA. Sert de point d'accès unique pour src/scene/api.ts
// (évite les imports croisés : les modules écrivent ici, api.ts ne fait que lire).
import type * as THREE from 'three';
import type { PlayerId, Three } from '../core/types';

export interface ShakeHandle {
  add(trauma: number): void;
}

interface Registry {
  /** Caméra de P1 (compatibilité) ; écran scindé : `three.cameras`. */
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  /** Rendu partagé (vues, caméras) : posé par camera/index.ts à l'installation (lot RTVIEW). */
  three: Three | null;
  fighterRoots: [THREE.Object3D | null, THREE.Object3D | null];
  handSlots: [THREE.Object3D | null, THREE.Object3D | null];
  /** Secousse des 2 vues à la fois (compatibilité). */
  shake: ShakeHandle | null;
  /** Secousse de la vue de P1, de P2 (lot RTVIEW : un effet ne secoue que la vue concernée). */
  shakes: [ShakeHandle | null, ShakeHandle | null];
  /** Racines à exclure du fondu de transparence caméra (persos, sol, particules…). */
  occlusionExcluded: Set<THREE.Object3D>;
}

export const registry: Registry = {
  camera: null,
  renderer: null,
  three: null,
  fighterRoots: [null, null],
  handSlots: [null, null],
  shake: null,
  shakes: [null, null],
  occlusionExcluded: new Set(),
};

export function setFighterObject(player: PlayerId, obj: THREE.Object3D | null): void {
  registry.fighterRoots[player] = obj;
}

export function setHandSlot(player: PlayerId, obj: THREE.Object3D | null): void {
  registry.handSlots[player] = obj;
}

export function excludeFromOcclusion(obj: THREE.Object3D): void {
  registry.occlusionExcluded.add(obj);
}
