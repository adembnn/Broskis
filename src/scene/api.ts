// API publique du lot LA pour les autres lots (contrat) : getFighterObject, getHandSlot, worldToScreen,
// cameraShake. Lit uniquement le registre partagé (registry.ts), rempli par fighters/ et camera/ à l'installation.
// Écran scindé (lot RTVIEW) : viewOf, forwardOf, onlyInView ; worldToScreen et cameraShake prennent un joueur.
import * as THREE from 'three';
import type { PlayerId, Vec3, View } from '../core/types';
import { RTVIEW } from './camera/tokens';
import { registry } from './registry';

const _v = new THREE.Vector3();
const _size = new THREE.Vector2();

export function getFighterObject(player: PlayerId): THREE.Object3D | null {
  return registry.fighterRoots[player];
}

export function getHandSlot(player: PlayerId): THREE.Object3D | null {
  return registry.handSlots[player];
}

/** Vue d'un joueur (rectangle du canvas en px CSS + sa caméra), ou `null` avant l'installation de la caméra. */
export function viewOf(player: PlayerId): View | null {
  return registry.three?.viewOf(player) ?? null;
}

/** Avant horizontal (y = 0, normé) de la caméra du joueur : le déplacement relatif s'appuie dessus. Droite = [-f[2], 0, f[0]]. */
export function forwardOf(player: PlayerId): Vec3 {
  return registry.three?.forwardOf(player) ?? [player === 0 ? 1 : -1, 0, 0];
}

/**
 * Projette un point monde en pixels écran (origine en haut à gauche du canvas), ou `null` si la caméra n'est pas
 * prête. Écran scindé : `player` = la vue où l'on dessine (P1 par défaut) ; le point tombe dans son rectangle.
 */
export function worldToScreen(point: Vec3 | THREE.Vector3, player: PlayerId = 0): { x: number; y: number } | null {
  if (Array.isArray(point)) _v.set(point[0], point[1], point[2]); else _v.copy(point);
  const view = registry.three?.viewOf(player);
  if (view) {
    _v.project(view.camera);
    return { x: view.x + (_v.x * 0.5 + 0.5) * view.width, y: view.y + (1 - (_v.y * 0.5 + 0.5)) * view.height };
  }
  const camera = registry.camera;
  const renderer = registry.renderer;
  if (!camera || !renderer) return null;
  _v.project(camera);
  renderer.getSize(_size);
  return { x: (_v.x * 0.5 + 0.5) * _size.x, y: (1 - (_v.y * 0.5 + 0.5)) * _size.y };
}

/** Ajoute du trauma à la secousse caméra (modèle trauma², design-system-cartoon.md §4.6). Sans joueur : les 2 vues. */
export function cameraShake(trauma: number, player?: PlayerId): void {
  if (player == null) registry.shake?.add(trauma);
  else registry.shakes[player]?.add(trauma);
}

/** Réserve un objet (et ses enfants) à la vue d'un joueur : l'autre caméra ne le dessine pas. */
export function onlyInView(obj: THREE.Object3D, player: PlayerId): void {
  obj.traverse((o) => o.layers.set(RTVIEW.calques[player]));
}
