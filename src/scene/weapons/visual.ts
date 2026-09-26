// L'objet scanné, prêt à poser dans la scène : sticker 3D du lot LS (mis en cache par image), sinon silhouette
// de secours tout de suite, remplacée par le vrai sticker dès qu'il est prêt. Chaque instance a ses propres
// matériaux (lueur de charge, mèche qui clignote) ; les géométries sont partagées.
// Tranche (côtés de l'extrusion) : à la couleur réelle de l'objet. sticker/index.ts range les 2 groupes de
// l'extrusion (faces ET côtés) sur le matériau texturé : les côtés étiraient alors le trait d'encre du contour sur
// toute l'épaisseur (« tranche noire », banc LBENCH). On rebranche ici les côtés sur leur propre matériau.
import * as THREE from 'three';
import type { Weapon } from '../../core/types';
import { makeFallbackSticker, makeSticker } from '../sticker';
import { lookOf } from './physics';
import { WEAPON_FX } from './tokens';

const templates = new Map<string, Promise<THREE.Group>>();
const edgeColors = new Map<string, THREE.Color>();
const _hsl = { h: 0, s: 0, l: 0 };

/** Sticker de référence (plus grande dimension = 1) d'une image ; un seul calcul par image. */
function template(url: string): Promise<THREE.Group> {
  let p = templates.get(url);
  if (!p) {
    p = makeSticker(url, { height: 1 });
    templates.set(url, p);
    p.catch(() => templates.delete(url));
  }
  return p;
}

/** Couleur réelle de l'objet : moyenne des pixels opaques de son image, sans le liseré blanc ni le trait d'encre
 *  que Nano Banana dessine autour ; jamais noire (un objet sombre garde une tranche anthracite, distincte de l'encre). */
function edgeColorOf(url: string, tpl: THREE.Object3D, fallback: string): THREE.Color {
  let c = edgeColors.get(url);
  if (c) return c;
  c = new THREE.Color(fallback);
  let img: CanvasImageSource | null = null;
  tpl.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    const first = (Array.isArray(m) ? m[0] : m) as THREE.MeshToonMaterial | undefined;
    if (!img && first?.map?.image) img = first.map.image as CanvasImageSource;
  });
  if (img) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 48;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, 48, 48);
    const d = g.getImageData(0, 0, 48, 48).data;
    const sum = [0, 0, 0, 0];
    const all = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 230) continue;
      const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
      all[0] += r; all[1] += gr; all[2] += b; all[3]++;
      const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
      if (l > 0.9 || l < 0.1) continue;
      sum[0] += r; sum[1] += gr; sum[2] += b; sum[3]++;
    }
    const src = sum[3] > 20 ? sum : all;
    if (src[3] > 0) c.setRGB(src[0] / src[3], src[1] / src[3], src[2] / src[3], THREE.SRGBColorSpace);
  }
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  if (_hsl.l < WEAPON_FX.epaisseur.clarteMin) c.setHSL(_hsl.h, _hsl.s, WEAPON_FX.epaisseur.clarteMin, THREE.SRGBColorSpace);
  edgeColors.set(url, c);
  return c;
}

/** Ramène un objet à une plus grande dimension de 1, centré. */
function normalize(obj: THREE.Object3D): THREE.Object3D {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-3);
  const wrap = new THREE.Group();
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  wrap.add(obj);
  wrap.scale.setScalar(k);
  return wrap;
}

/** Épaisseur du carton = profondeur réelle de l'objet, bornée (banc LBENCH : entre 8 et 15 % de la largeur et ×3
 *  au plus, sinon un objet profond devient une brique et un objet plat une feuille). */
function thicknessScale(n: THREE.Object3D, weapon: Weapon): number {
  n.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(n).getSize(new THREE.Vector3());
  const z = Math.max(1e-3, s.z);
  const want = lookOf(weapon).depthRatio * Math.max(s.x, s.y);
  const cap = Math.min(WEAPON_FX.epaisseur.max, (WEAPON_FX.epaisseur.largeur * s.x) / z);
  const floor = (WEAPON_FX.epaisseur.min * s.x) / z;
  return Math.max(0.05, Math.min(cap, Math.max(floor, want / z)));
}

function ownMaterials(root: THREE.Object3D, edge: THREE.Color | null): THREE.Material[] {
  const own: THREE.Material[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clone = (m: THREE.Material) => { const c = m.clone(); own.push(c); return c; };
    if (Array.isArray(mesh.material)) {
      const src = mesh.material;
      const groups = mesh.geometry.groups;
      const withEdge = !!edge && src.length >= 2 && groups.length >= 2;
      // ExtrudeGeometry : groupe 0 = faces avant/arrière, groupe 1 = côtés (la tranche).
      if (withEdge) groups[1].materialIndex = 1;
      mesh.material = src.map((m, i) => {
        if (!withEdge || i !== 1) return clone(m);
        const e = src[0].clone() as THREE.MeshToonMaterial; // même rampe toon que la face, sans l'image
        e.map = null;
        e.transparent = false;
        e.color.copy(edge!);
        own.push(e);
        return e;
      });
    } else {
      mesh.material = clone(mesh.material);
    }
    mesh.castShadow = false;
    mesh.raycast = () => {};
  });
  return own;
}

/** Un exemplaire de l'objet : `root` à placer/tourner/mettre à l'échelle (1 = 1 m de plus grande dimension). */
export class WeaponModel {
  readonly root = new THREE.Group();
  private model: THREE.Object3D | null = null;
  /** Dimensions de l'objet à l'échelle 1 (la plus grande vaut 1) : sert au mur-bouclier. */
  readonly size = new THREE.Vector3(1, 1, 1);
  private materials: THREE.Material[] = [];
  private glowColor = new THREE.Color();
  private glowK = 0;
  disposed = false;
  readonly weapon: Weapon;

  constructor(weapon: Weapon, flatDepth = false) {
    this.weapon = weapon;
    this.root.name = `arme-${weapon.id}`;
    const fallback = makeFallbackSticker(weapon.category, weapon.palette);
    if (weapon.category === 'shield') fallback.rotation.x = Math.PI / 2; // disque debout, face à +Z comme un sticker
    this.setModel(normalize(fallback), null);
    const url = weapon.stickerUrl;
    if (url) {
      template(url)
        .then((t) => {
          if (this.disposed) return;
          const n = normalize(t.clone(true));
          if (!flatDepth) n.scale.z *= thicknessScale(n, weapon);
          this.setModel(n, edgeColorOf(url, t, weapon.palette[0]));
        })
        .catch((e) => console.warn('[weapons] sticker', e));
    }
  }

  private setModel(obj: THREE.Object3D, edge: THREE.Color | null): void {
    if (this.model) this.root.remove(this.model);
    for (const m of this.materials) m.dispose();
    this.model = obj;
    obj.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(obj).getSize(this.size);
    this.materials = ownMaterials(obj, edge);
    this.root.add(obj);
    this.applyGlow();
  }

  /** Lueur émissive (0..1) : charge, mèche. palette.lumiere franchit le bloom. */
  glow(color: THREE.ColorRepresentation, k: number): void {
    this.glowColor.set(color);
    this.glowK = k;
    this.applyGlow();
  }

  private applyGlow(): void {
    for (const m of this.materials) {
      const e = (m as THREE.MeshToonMaterial).emissive;
      if (e) e.copy(this.glowColor).multiplyScalar(this.glowK);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.root.removeFromParent();
    for (const m of this.materials) m.dispose();
  }
}
