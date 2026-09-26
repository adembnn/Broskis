// Secousse caméra, modèle "trauma" (design-system-cartoon.md §4.6, repris de Squirrel Eiserloh / Nijman).
// trauma² : les petits chocs restent doux. Purement additif : appliqué APRÈS le placement propre de la caméra
// par director.ts (voir l'ordre des systèmes dans camera/index.ts), jamais la source de vérité de la position.
// Constantes : tokens.js `juice.secousse` (direction Vinyle, 26/09).
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { ShakeHandle } from '../registry';

export interface CameraShake extends ShakeHandle {
  apply(camera: THREE.PerspectiveCamera, dt: number): void;
}

function noise(t: number, freq: number, offset: number): number {
  return Math.sin(t * freq + offset) * Math.sin(t * freq * 0.37 + offset * 2.1);
}

export function createCameraShake(): CameraShake {
  let trauma = 0;
  let t = 0;
  return {
    add(amount: number) {
      trauma = Math.min(1, trauma + amount);
    },
    apply(camera, dt) {
      t += dt;
      trauma = Math.max(0, trauma - juice.secousse.decroissance * dt);
      if (trauma <= 0.001) return;
      const s = trauma * trauma;
      const ox = juice.secousse.decalageMax * s * noise(t, 47, 1);
      const oy = juice.secousse.decalageMax * s * noise(t, 53, 7);
      camera.position.x += ox;
      camera.position.y += oy;
      camera.rotation.z += THREE.MathUtils.degToRad(juice.secousse.roulisMax) * s * noise(t, 41, 3);
    },
  };
}
