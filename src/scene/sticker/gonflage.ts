// Gonflage du sticker (lot LBENCH, recherche R2 : plan/recherche/R2-photo-vers-3d.md) : au lieu d'un carton plat,
// chaque face est un « coussin » bombé selon la distance au bord du masque (transformée de distance). Le bord reste
// fin, le cœur s'épaissit, et les parties fines (pieds, anse, bracelet) gonflent moins que le corps : un jouet en
// vinyle plutôt qu'une découpe. Pur code, sans réseau. La silhouette exacte vient de l'alpha de la texture
// (alphaTest), la grille ne sert qu'au relief.
import * as THREE from 'three';

export interface Coussin {
  /** Distance au bord (px du masque d'analyse), voir distanceAuBord dans index.ts. */
  dist: Float32Array;
  aw: number;
  ah: number;
  analysisScale: number;
  /** Passage px source → espace forme (mêmes valeurs que makeSticker) et taille de la texture (UV). */
  minX: number;
  minY: number;
  pxWidth: number;
  pxHeight: number;
  scale: number;
  imgWidth: number;
  imgHeight: number;
  /** Translation appliquée à l'extrusion par geometry.center(). */
  decalage: THREE.Vector3;
  /** z de la face avant de l'extrusion (après centrage) : le coussin part de là. */
  zFace: number;
  /** Bombé maximal, en unités de forme (plus grande dimension = hauteur visée). */
  amplitude: number;
}

/** Nombre de cases de la grille sur le plus grand côté. */
const CASES = 72;
/** Distance (fraction de la plus grande dimension du masque) à laquelle le bombé atteint son maximum. */
const SATURATION = 0.12;

/** Profil en quart de cercle : monte vite au bord, plat au centre (aspect coussin). */
function profil(t: number): number {
  if (t >= 1) return 1;
  const u = 1 - Math.max(0, t);
  return Math.sqrt(1 - u * u);
}

/** Distance au bord interpolée (bilinéaire) en un point du masque d'analyse. */
function echantillon(c: Coussin, ax: number, ay: number): number {
  const x = Math.min(c.aw - 1.001, Math.max(0, ax));
  const y = Math.min(c.ah - 1.001, Math.max(0, ay));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const i = y0 * c.aw + x0;
  const d00 = c.dist[i], d10 = c.dist[i + 1], d01 = c.dist[i + c.aw], d11 = c.dist[i + c.aw + 1];
  return (d00 * (1 - fx) + d10 * fx) * (1 - fy) + (d01 * (1 - fx) + d11 * fx) * fy;
}

/** Géométrie d'un coussin : face = 1 (avant, normale +z) ou -1 (arrière). Mêmes UV que les faces de l'extrusion. */
export function geometrieCoussin(c: Coussin, face: 1 | -1): THREE.BufferGeometry {
  const largeur = c.pxWidth * c.scale;
  const hauteur = c.pxHeight * c.scale;
  const pas = Math.max(largeur, hauteur) / CASES;
  const nx = Math.max(2, Math.ceil(largeur / pas) + 2);
  const ny = Math.max(2, Math.ceil(hauteur / pas) + 2);
  const x0 = -largeur / 2 - pas;
  const y0 = -hauteur / 2 - pas;
  const saturation = SATURATION * Math.max(c.aw, c.ah);
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uvs = new Float32Array((nx + 1) * (ny + 1) * 2);
  const dedans = new Uint8Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = x0 + i * pas;
      const y = y0 + j * pas;
      const sx = c.minX + c.pxWidth / 2 + x / c.scale;
      const sy = c.minY + c.pxHeight / 2 - y / c.scale;
      const d = echantillon(c, sx * c.analysisScale, sy * c.analysisScale);
      dedans[k] = d > 0.5 ? 1 : 0;
      const h = c.amplitude * profil(d / saturation);
      positions[k * 3] = x + c.decalage.x;
      positions[k * 3 + 1] = y + c.decalage.y;
      positions[k * 3 + 2] = face * (c.zFace + h);
      uvs[k * 2] = sx / c.imgWidth;
      uvs[k * 2 + 1] = 1 - sy / c.imgHeight;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, cc = a + nx + 1, d = cc + 1;
      if (!(dedans[a] || dedans[b] || dedans[cc] || dedans[d])) continue;
      if (face === 1) index.push(a, b, d, a, d, cc);
      else index.push(a, d, b, a, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
