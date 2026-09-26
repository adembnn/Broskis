// Petits utilitaires partagés (caméra + persos) : easing et interpolation d'angle. Aucune dépendance three
// pour rester triviaux à tester ; les modules caméra font le pont avec Vector3 eux-mêmes.

/** Interpole l'angle le plus court entre deux angles en radians (jamais par le mauvais côté). */
export function angleLerp(a: number, b: number, t: number): number {
  const diff = (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

/** Différence angulaire la plus courte b-a, dans [-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  return (((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Bosse douce 0→1→0 (pour un coup de FOV ou un pic de vitesse au milieu d'une transition). */
export function bump(t: number): number {
  return Math.sin(clamp01(t) * Math.PI);
}

/** Constante de lissage exponentielle (framerate-indépendante) : 1 - Math.exp(-dt / tauSeconds). */
export function expFollow(dt: number, tauSeconds: number): number {
  return 1 - Math.exp(-dt / Math.max(1e-4, tauSeconds));
}
