// Grammaire caméra du trailer : orbite, travelling, grue, panoramique fouetté, roulis, caméra portée.
// Jamais de zoom : la focale est fixe (TRAILER_FOV), on rapproche la caméra physiquement (parallaxe réelle).
import * as THREE from 'three';

export const TRAILER_FOV = 40;

export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; roll?: number }

export const ease = {
  linear: (k: number) => k,
  outCubic: (k: number) => 1 - (1 - k) ** 3,
  inOutCubic: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  outQuint: (k: number) => 1 - (1 - k) ** 5,
  inCubic: (k: number) => k ** 3,
  outBack: (k: number, s = 1.70158) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
};

export const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Orbite horizontale autour de `center` : angle (degrés) interpolé de a0 à a1 selon k. */
export function orbit(center: THREE.Vector3, radius: number, height: number, a0: number, a1: number, k: number): Pose {
  const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * k);
  return { pos: v3(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius), look: center.clone() };
}

/** Travelling : la caméra glisse de p0 à p1 pendant que le regard glisse de l0 à l1. */
export function track(p0: THREE.Vector3, p1: THREE.Vector3, l0: THREE.Vector3, l1: THREE.Vector3, k: number): Pose {
  return { pos: p0.clone().lerp(p1, k), look: l0.clone().lerp(l1, k) };
}

/** Caméra portée : petit bruit déterministe (somme de sinus), amplitude en mètres. */
export function handheld(t: number, amp: number, seed = 1): THREE.Vector3 {
  const s = seed * 1.7;
  return v3(
    (Math.sin(t * 2.1 + s) + Math.sin(t * 5.3 + s * 2) * 0.4) * amp,
    (Math.sin(t * 1.7 + s * 3) + Math.sin(t * 4.1 + s) * 0.3) * amp * 0.6,
    (Math.sin(t * 2.9 + s * 5) * 0.5) * amp,
  );
}

/** Secousse d'impact qui décroît (trauma² façon game-feel), déterministe. */
export function impactShake(sinceHit: number, strength: number): THREE.Vector3 {
  if (sinceHit < 0 || sinceHit > 0.6) return v3(0, 0, 0);
  const decay = (1 - sinceHit / 0.6) ** 2;
  const f = 38;
  return v3(Math.sin(sinceHit * f) * strength * decay, Math.cos(sinceHit * f * 1.3) * strength * decay * 0.7, 0);
}

export function applyPose(camera: THREE.PerspectiveCamera, pose: Pose): void {
  camera.position.copy(pose.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.look);
  if (pose.roll) camera.rotateZ(THREE.MathUtils.degToRad(pose.roll));
  if (camera.fov !== TRAILER_FOV) { camera.fov = TRAILER_FOV; camera.updateProjectionMatrix(); }
}
