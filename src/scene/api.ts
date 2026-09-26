// API publique du lot LA pour les autres lots (contrat) : getFighterObject, getHandSlot, worldToScreen,
// cameraShake. Lit uniquement le registre partagé (registry.ts), rempli par fighters/ et camera/ à l'installation.
import * as THREE from 'three';
import type { PlayerId, Vec3 } from '../core/types';
import { registry } from './registry';

const _v = new THREE.Vector3();
const _size = new THREE.Vector2();

export function getFighterObject(player: PlayerId): THREE.Object3D | null {
  return registry.fighterRoots[player];
}

export function getHandSlot(player: PlayerId): THREE.Object3D | null {
  return registry.handSlots[player];
}

/** Projette un point monde en pixels écran (origine en haut à gauche), ou `null` si la caméra n'est pas prête. */
export function worldToScreen(point: Vec3 | THREE.Vector3): { x: number; y: number } | null {
  const camera = registry.camera;
  const renderer = registry.renderer;
  if (!camera || !renderer) return null;
  if (Array.isArray(point)) _v.set(point[0], point[1], point[2]); else _v.copy(point);
  _v.project(camera);
  renderer.getSize(_size);
  return { x: (_v.x * 0.5 + 0.5) * _size.x, y: (1 - (_v.y * 0.5 + 0.5)) * _size.y };
}

/** Ajoute du trauma à la secousse caméra (modèle trauma², design-system-cartoon.md §4.6). */
export function cameraShake(trauma: number): void {
  registry.shake?.add(trauma);
}
