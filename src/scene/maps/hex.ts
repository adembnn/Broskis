// Maths de grille hexagonale (pointy-top) pour l'Archipel. Autonome, sans dépendance au reste du lot.
// Les tuiles KayKit Medieval Hexagon (public/assets/packs/hexagon/tiles/**) ont un empan mesuré de
// x:[-1,1] z:[-1.1547,1.1547] (sommets en haut/bas) : un hexagone pointy-top de rayon circonscrit R = 2/racine(3).
export const HEX_R = 2 / Math.sqrt(3); // ~1.1547 : rayon circonscrit (centre -> sommet)
export const HEX_APOTHEM = 1; // centre -> milieu d'arête (plat-à-plat / 2)

export interface Axial { q: number; r: number }

/** Coordonnée monde (x,z) du centre d'une tuile axiale (q,r), origine locale à l'île. */
export function axialToWorld({ q, r }: Axial): [number, number] {
  const x = HEX_R * Math.sqrt(3) * (q + r / 2);
  const z = HEX_R * 1.5 * r;
  return [x, z];
}

/** Distance en anneaux (hex distance) depuis le centre (0,0). */
export function hexRing({ q, r }: Axial): number {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

/** Toutes les tuiles d'un disque hexagonal de rayon `radius` (0 = juste le centre), avec leur anneau. */
export function hexDisk(radius: number): (Axial & { ring: number })[] {
  const out: (Axial & { ring: number })[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) out.push({ q, r, ring: hexRing({ q, r }) });
  }
  return out;
}
