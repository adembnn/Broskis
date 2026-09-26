// Lot LS — image (fond magenta #FF00FF) → sticker 3D façon carton découpé.
// Remplace le stub du lot L0 (contrat inchangé : mêmes signatures, voir plan/lots/LS-sticker-3d.md).
//
// Pipeline de makeSticker :
//  1. chromaKey        : retire le fond magenta (JPEG, tolérance + despill sur le liseré) ;
//  2. plus grande composante connexe + bouchage des trous intérieurs (zones parasites JPEG) ;
//  3. contour (Moore boundary tracing) sur le masque alpha nettoyé ;
//  4. simplification Ramer-Douglas-Peucker, pour rester sous ~400 sommets ;
//  5. extrusion : THREE.Shape + ExtrudeGeometry (petit biseau), UV calées sur la boîte du contour ;
//  6. matériaux : face avant texturée (toon, `reference/bagarre-de-taverne/toon-kit.js`), tranche
//     couleur carton ; bord blanc en option seulement (Nano Banana Pro le dessine déjà lui-même).
import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../../reference/bagarre-de-taverne/toon-kit.js';
import type { Category } from '../../core/types';

export interface StickerOptions {
  /** Épaisseur du carton (unités monde). Défaut 0,06 (plan/lots/LS-sticker-3d.md). */
  depth?: number;
  /**
   * Largeur d'un bord blanc procédural, en fraction de la plus grande dimension. Défaut 0 (pas de
   * bord) : les images Nano Banana Pro dessinent déjà leur propre bord blanc + contour brun, il ne
   * faut pas le doubler (plan/lots/LS-sticker-3d.md, constats). Ne mettre une valeur (0,02–0,03)
   * que pour une image générée sans bord (ex. un sticker de secours dessiné à la main).
   */
  border?: number;
  /** Hauteur totale visée pour le sticker (le plus grand des deux axes est mis à l'échelle sur cette valeur). */
  height?: number;
}

const MAGENTA_KEY = { r: 255, g: 0, b: 255 };
/** Tolérance chromatique : distance normalisée (0–1) au magenta pur en dessous de laquelle un pixel est transparent.
 *  Plus haute que pour un PNG à fond pur : le JPEG (voir constats du lot) compresse le magenta avec du bruit. */
const CHROMA_TOLERANCE = 0.4;
/** Simplification RDP : plus haut = contour plus grossier (moins de sommets). En pixels de l'image source. */
const RDP_EPSILON = 1.6;
/** Budget de sommets par contour (plan/lots/LS-sticker-3d.md : ~400 max). */
const MAX_CONTOUR_POINTS = 400;
/** Plus grande dimension du masque utilisé pour l'analyse (composantes, trous, contour) : les
 *  images Nano Banana Pro sont en 1408×768, bien plus que nécessaire pour tracer un contour ---
 *  on travaille sur une version réduite pour tenir le budget de ~50 ms (plan/lots/LS-sticker-3d.md),
 *  la texture, elle, reste en pleine résolution. */
const ANALYSIS_MAX_DIM = 384;

/** Palette carton par défaut, utilisée si aucune palette d'arme n'est fournie. */
const CARDBOARD_TRANCHE = '#c9a36a';
/** Couleur du contour cel-shading (encre du design system, `reference/bagarre-de-taverne`). */
const OUTLINE_INK = '#2B1D14';

// ---------------------------------------------------------------------------
// 1. Détourage + despill
// ---------------------------------------------------------------------------

/**
 * Retire le fond magenta #FF00FF d'une image et renvoie un canvas RGBA prêt à texturer.
 * Applique aussi une correction de despill : les pixels proches de la bordure gardent une
 * teinte magenta parasite (liseré) même une fois rendus transparents ailleurs ; on neutralise
 * ce canal en tirant le rouge/bleu vers le vert local plutôt que de les laisser saturés.
 */
export function chromaKey(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Distance normalisée au magenta pur, dans [0, 1].
  const maxDist = Math.sqrt(255 * 255 * 3);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = r - MAGENTA_KEY.r;
    const dg = g - MAGENTA_KEY.g;
    const db = b - MAGENTA_KEY.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / maxDist;

    if (dist < CHROMA_TOLERANCE) {
      data[i + 3] = 0;
      continue;
    }

    // Despill : si le pixel garde plus de magenta que de vert (liseré typique sur les bords
    // anti-aliasés / bruit JPEG), on rabat rouge et bleu vers le niveau du vert pour tuer la teinte.
    const magentaExcess = Math.min(r, b) - g;
    if (magentaExcess > 0) {
      const pull = Math.min(1, magentaExcess / 128);
      data[i] = r - pull * magentaExcess * 0.5;
      data[i + 2] = b - pull * magentaExcess * 0.5;
      // Doux fondu alpha sur les tout derniers pixels de bord pour éviter un liseré dur.
      if (dist < CHROMA_TOLERANCE * 1.5) {
        const t = (dist - CHROMA_TOLERANCE) / (CHROMA_TOLERANCE * 0.5);
        data[i + 3] = Math.max(0, Math.min(255, Math.round(t * 255)));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// 2. Plus grande composante connexe + bouchage des trous intérieurs
// ---------------------------------------------------------------------------

/**
 * Nettoie le masque alpha d'un canvas en place : ne garde que la plus grande composante connexe
 * (4-connexité) du premier plan, puis bouche ses trous intérieurs (zones devenues transparentes
 * par erreur à l'intérieur de la silhouette, ex. bruit JPEG). Corrige les « zones parasites »
 * observées dans les coins de `duck-grenade.jpg` (plan/lots/LS-sticker-3d.md, constats).
 * Coût : deux passages BFS sur les pixels, une seule fois par sticker (budget ~50 ms, voir lot).
 */
function keepLargestComponentAndFillHoles(canvas: HTMLCanvasElement): void {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const n = width * height;
  const isFg = (i: number): boolean => data[i * 4 + 3] > 127;

  // --- Étape A : étiquetage des composantes du premier plan, on garde la plus grande. ---
  const label = new Int32Array(n).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  const queue = new Int32Array(n);
  let nextLabel = 0;
  for (let start = 0; start < n; start++) {
    if (!isFg(start) || label[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = nextLabel;
    let size = 0;
    while (head < tail) {
      const idx = queue[head++];
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && isFg(nb) && label[nb] === -1) {
          label[nb] = nextLabel;
          queue[tail++] = nb;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = nextLabel;
    }
    nextLabel++;
  }
  // Efface tout ce qui n'est pas la plus grande composante.
  if (bestLabel !== -1) {
    for (let i = 0; i < n; i++) {
      if (isFg(i) && label[i] !== bestLabel) data[i * 4 + 3] = 0;
    }
  }

  // --- Étape B : bouche les trous intérieurs (fond non atteignable depuis le bord de l'image). ---
  const reachable = new Uint8Array(n);
  let head = 0;
  let tail = 0;
  const isBgNow = (i: number): boolean => data[i * 4 + 3] <= 127;
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const idx = y * width + x;
      if (isBgNow(idx) && !reachable[idx]) {
        reachable[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const idx = y * width + x;
      if (isBgNow(idx) && !reachable[idx]) {
        reachable[idx] = 1;
        queue[tail++] = idx;
      }
    }
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
    ];
    for (const nb of neighbors) {
      if (nb >= 0 && isBgNow(nb) && !reachable[nb]) {
        reachable[nb] = 1;
        queue[tail++] = nb;
      }
    }
  }
  // Fond non atteint depuis le bord = trou intérieur → on le rend opaque.
  for (let i = 0; i < n; i++) {
    if (isBgNow(i) && !reachable[i]) data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

// ---------------------------------------------------------------------------
// 3. Contour (Moore boundary tracing) sur le masque alpha
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

/**
 * Suit le contour extérieur du blob opaque (masque déjà nettoyé : une seule composante, sans
 * trous). Renvoie un polygone en coordonnées pixels (origine haut-gauche).
 */
function traceContour(canvas: HTMLCanvasElement): Point[] {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const alpha = ctx.getImageData(0, 0, width, height).data;
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return alpha[(y * width + x) * 4 + 3] > 127 ? 1 : 0;
  };

  // Point de départ : premier pixel opaque en balayant ligne par ligne.
  let start: Point | null = null;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y) === 1) {
        start = { x, y };
        break outer;
      }
    }
  }
  if (!start) return [];

  // Suivi de bord façon "Moore boundary tracing" : plus robuste qu'un marching squares complet
  // pour extraire UN contour extérieur simple, suffisant ici (une seule composante, pas de trous).
  const dirs = [
    { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 },
    { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  ];
  const points: Point[] = [];
  let current = start;
  let dir = 6; // on entre en cherchant vers le haut
  const maxSteps = width * height;
  let steps = 0;
  do {
    points.push({ x: current.x, y: current.y });
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8; // repart en arrière de deux crans (convention Moore)
      const nx = current.x + dirs[d].x;
      const ny = current.y + dirs[d].y;
      if (at(nx, ny) === 1) {
        current = { x: nx, y: ny };
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
    steps++;
  } while ((current.x !== start.x || current.y !== start.y) && steps < maxSteps);

  return points;
}

/** Distance perpendiculaire d'un point à une droite (a, b). */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Simplification de Ramer-Douglas-Peucker, itérative (pas de récursion profonde sur gros contours). */
function simplifyRDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxDist > epsilon && maxIndex !== -1) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex]);
      stack.push([maxIndex, end]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/** Aire signée (formule du lacet) : positive = anti-horaire (CCW), négative = horaire (CW). */
function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Offset 2D d'un polygone fermé vers l'extérieur, par jointure en onglet (miter join) sur la
 * normale moyenne des deux arêtes adjacentes à chaque sommet. Le miter est plafonné (`miterCap`)
 * pour éviter les pointes qui partent à l'infini sur les coins très rentrants — suffisant pour
 * un liseré fin (2 à 3 % de la hauteur), pas un offset géométrique exact type Clipper.
 * N'est utilisé que si `StickerOptions.border` est explicitement fourni (voir plus haut).
 */
function offsetPolygon(points: Point[], distance: number): Point[] {
  const n = points.length;
  const miterCap = distance * 4;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const e1x = p.x - prev.x;
    const e1y = p.y - prev.y;
    const e2x = next.x - p.x;
    const e2y = next.y - p.y;
    const len1 = Math.hypot(e1x, e1y) || 1;
    const len2 = Math.hypot(e2x, e2y) || 1;
    // Normale sortante de chaque arête (contour CCW → normale = rotation -90° du sens de parcours).
    const n1x = e1y / len1, n1y = -e1x / len1;
    const n2x = e2y / len2, n2y = -e2x / len2;
    let nx = n1x + n2x;
    let ny = n1y + n2y;
    const nLen = Math.hypot(nx, ny);
    if (nLen < 1e-6) return { x: p.x + n1x * distance, y: p.y + n1y * distance };
    nx /= nLen;
    ny /= nLen;
    // Longueur du miter : distance / cos(demi-angle entre les deux normales).
    const cosHalf = nx * n1x + ny * n1y;
    const miter = Math.min(distance / Math.max(cosHalf, 0.2), miterCap);
    return { x: p.x + nx * miter, y: p.y + ny * miter };
  });
}

/** Simplifie jusqu'à tenir sous `maxPoints`, en augmentant epsilon si besoin. */
function simplifyToBudget(points: Point[], maxPoints: number): Point[] {
  let epsilon = RDP_EPSILON;
  let simplified = simplifyRDP(points, epsilon);
  let guard = 0;
  while (simplified.length > maxPoints && guard < 12) {
    epsilon *= 1.6;
    simplified = simplifyRDP(points, epsilon);
    guard++;
  }
  return simplified;
}

// ---------------------------------------------------------------------------
// 4. makeSticker : assemble tout
// ---------------------------------------------------------------------------

/** Image sur fond #FF00FF → découpe carton épaisse en 3D (groupe centré, hauteur `opts.height`). */
export async function makeSticker(
  src: string | HTMLImageElement,
  opts: StickerOptions = {},
): Promise<THREE.Group> {
  const depth = opts.depth ?? 0.06;
  const borderFrac = opts.border ?? 0;
  const targetHeight = opts.height ?? 1;

  const img = typeof src === 'string' ? await loadImage(src) : src;
  const keyed = chromaKey(img);

  // Analyse (composantes, trous, contour) sur une version réduite : bien plus rapide, et la
  // précision d'un contour à 384 px suffit largement une fois simplifié à ~400 sommets.
  const analysisScale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(keyed.width, keyed.height));
  const analysisCanvas = downscale(keyed, analysisScale);
  keepLargestComponentAndFillHoles(analysisCanvas);
  const rawContourSmall = traceContour(analysisCanvas);
  const group = new THREE.Group();

  if (rawContourSmall.length < 8) {
    // Détourage vide/échoué (image toute magenta, ou format inattendu) : fallback discret.
    console.warn('[LS sticker] contour introuvable, fallback catégorie générique');
    return makeFallbackSticker('blaster', ['#c9a36a', '#8a6b3d']);
  }
  // Retour à l'échelle de l'image source (texture) pour que UV et géométrie restent alignés.
  const rawContour = rawContourSmall.map((p) => ({ x: p.x / analysisScale, y: p.y / analysisScale }));

  const contour = simplifyToBudget(rawContour, MAX_CONTOUR_POINTS);

  // Boîte englobante en pixels, pour normaliser vers l'espace monde et caler les UV.
  const minX = Math.min(...contour.map((p) => p.x));
  const maxX = Math.max(...contour.map((p) => p.x));
  const minY = Math.min(...contour.map((p) => p.y));
  const maxY = Math.max(...contour.map((p) => p.y));
  const pxWidth = Math.max(1, maxX - minX);
  const pxHeight = Math.max(1, maxY - minY);
  const scale = targetHeight / Math.max(pxWidth, pxHeight);

  // THREE.Shape : x vers la droite, y vers le haut → on inverse l'axe Y image (haut-gauche).
  // Le suivi de bord (traceContour) tourne dans le sens de l'image (Y vers le bas) ; une fois
  // l'axe Y inversé ci-dessus, ça peut donner un contour horaire (CW) en espace Three (Y vers le
  // haut) — or ExtrudeGeometry attend un contour extérieur anti-horaire (CCW) pour que les
  // normales des faces avant/arrière pointent vers l'extérieur. On force donc le sens via l'aire
  // signée (formule du lacet) : aire négative = CW → on inverse l'ordre des points.
  let shapePoints = contour.map((p) => ({
    x: (p.x - minX - pxWidth / 2) * scale,
    y: (pxHeight / 2 - (p.y - minY)) * scale,
  }));
  if (signedArea(shapePoints) < 0) shapePoints = shapePoints.slice().reverse();

  const shape = new THREE.Shape();
  shapePoints.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();

  const bevelThickness = Math.min(depth * 0.4, 0.012);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize: bevelThickness,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geometry.center();
  applyFrontUVs(geometry, { minX, minY, pxWidth, pxHeight, scale, imgWidth: keyed.width, imgHeight: keyed.height });

  const texture = new THREE.CanvasTexture(keyed);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // DoubleSide en filet de sécurité : si un contour pathologique (auto-intersection après RDP)
  // inverse localement une normale, on évite une face avant qui disparaît (trou noir) plutôt
  // que de complexifier davantage la détection de sens.
  const frontMaterial = createToonMaterial(0xffffff, { map: texture, transparent: true, steps: 3 });
  frontMaterial.side = THREE.DoubleSide;
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: CARDBOARD_TRANCHE, roughness: 0.9 });
  // Groupes de matériaux : ExtrudeGeometry range face avant/arrière puis les côtés (biseau inclus).
  // On applique la texture sur les deux faces plates, le carton sur la tranche.
  const materials = [frontMaterial, edgeMaterial];
  geometry.groups.forEach((g, idx) => {
    // Les deux premiers groupes (index 0, 1 selon curveSegments) sont face avant/arrière.
    g.materialIndex = idx < 2 ? 0 : 1;
  });

  const mesh = new THREE.Mesh(geometry, materials);
  addOutline(mesh, 0.012, OUTLINE_INK);

  // Bord blanc "sticker" en option seulement (voir StickerOptions.border) : offset 2D du contour
  // (pas une mise à l'échelle 3D de la géométrie biseautée, qui fait partir des pointes aux
  // coins concaves — poignée d'un blaster, etc.).
  if (borderFrac > 0) {
    const borderPoints = offsetPolygon(shapePoints, targetHeight * borderFrac);
    const borderShape = new THREE.Shape();
    borderPoints.forEach((p, i) => (i === 0 ? borderShape.moveTo(p.x, p.y) : borderShape.lineTo(p.x, p.y)));
    borderShape.closePath();
    const borderGeometry = new THREE.ExtrudeGeometry(borderShape, { depth: depth * 0.7, bevelEnabled: false });
    borderGeometry.center();
    const borderMesh = new THREE.Mesh(borderGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    borderMesh.renderOrder = mesh.renderOrder - 1;
    group.add(borderMesh);
  }

  group.add(mesh);
  group.userData.sticker = { pxWidth, pxHeight, contourPoints: contour.length };
  return group;
}

/** Copie `canvas` à l'échelle `scale` (≤ 1). Renvoie le même canvas si `scale` vaut 1. */
function downscale(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale >= 1) return canvas;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface UvMapping {
  minX: number; minY: number; pxWidth: number; pxHeight: number; scale: number;
  imgWidth: number; imgHeight: number;
}

/**
 * Cale les UV des faces avant/arrière sur la vraie position du contour DANS l'image source
 * (et pas seulement sur sa propre boîte, sans quoi la texture serait mappée comme si l'objet
 * remplissait toute l'image — invisible tant que l'objet remplit déjà le cadre, comme nos 3
 * images de test, mais faux dès qu'il y a une marge, ex. un objet scanné de loin).
 */
function applyFrontUVs(geometry: THREE.ExtrudeGeometry, m: UvMapping): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    // Inverse la transformation shapePoints (voir makeSticker) pour retrouver les pixels
    // d'origine, puis normalise par la taille réelle du canvas source (pas par la boîte du
    // contour) : c'est ça qui donne des UV alignés sur la bonne portion de la texture.
    const origPxX = m.minX + m.pxWidth / 2 + x / m.scale;
    const origPxY = m.minY + m.pxHeight / 2 - y / m.scale;
    uv.setXY(i, origPxX / m.imgWidth, 1 - origPxY / m.imgHeight);
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// 5. Fallback (image absente ou échouée)
// ---------------------------------------------------------------------------

/** Silhouette simple par catégorie, utilisée quand le sticker ne peut pas être généré à temps. */
export function makeFallbackSticker(category: Category, palette: [string, string]): THREE.Group {
  const group = new THREE.Group();
  const [primary, secondary] = palette;
  let geometry: THREE.BufferGeometry;
  switch (category) {
    case 'blaster':
      geometry = new THREE.BoxGeometry(0.7, 0.22, 0.06);
      break;
    case 'grenade':
      geometry = new THREE.SphereGeometry(0.28, 12, 10);
      break;
    case 'throwable':
      geometry = new THREE.IcosahedronGeometry(0.3, 0);
      break;
    case 'shield':
      geometry = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16);
      break;
    default:
      geometry = new THREE.BoxGeometry(0.5, 0.5, 0.06);
  }
  const mesh = new THREE.Mesh(geometry, createToonMaterial(primary));
  addOutline(mesh, 0.02, new THREE.Color(secondary).multiplyScalar(0.4).getHex());
  group.add(mesh);
  return group;
}
