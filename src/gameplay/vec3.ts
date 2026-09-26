// Petits utilitaires vectoriels partagés (trajectory.ts, damage.ts, aim.ts). Rien de spécifique au jeu ici.
import type { Vec3 } from '../core/types';

export function add(a: Vec3, b: Vec3, s = 1): Vec3 { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
export function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
export function length(v: Vec3): number { return Math.hypot(v[0], v[1], v[2]); }
export function normalize(v: Vec3): Vec3 {
  const len = length(v) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
/** Normalise seulement la composante horizontale (utile pour une direction de recul au sol). */
export function normalizeXZ(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[2]) || 1;
  return [v[0] / len, 0, v[2] / len];
}
export function toRapier(v: Vec3): { x: number; y: number; z: number } { return { x: v[0], y: v[1], z: v[2] }; }
export function fromRapier(v: { x: number; y: number; z: number }): Vec3 { return [v.x, v.y, v.z]; }
/** Quaternion d'une rotation autour de l'axe Y (yaw, radians) — pour orienter un mur de bouclier. */
export function yawQuaternion(yawRad: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yawRad / 2), z: 0, w: Math.cos(yawRad / 2) };
}
