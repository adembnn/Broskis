// L'objet scanné, prêt à poser dans la scène : sticker 3D du lot LS (mis en cache par image), sinon silhouette
// de secours tout de suite, remplacée par le vrai sticker dès qu'il est prêt. Chaque instance a ses propres
// matériaux (lueur de charge, mèche qui clignote) ; les géométries sont partagées.
import * as THREE from 'three';
import type { Weapon } from '../../core/types';
import { makeFallbackSticker, makeSticker } from '../sticker';

const templates = new Map<string, Promise<THREE.Group>>();

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

function ownMaterials(root: THREE.Object3D): THREE.Material[] {
  const own: THREE.Material[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clone = (m: THREE.Material) => { const c = m.clone(); own.push(c); return c; };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
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

  constructor(weapon: Weapon) {
    this.weapon = weapon;
    this.root.name = `arme-${weapon.id}`;
    const fallback = makeFallbackSticker(weapon.category, weapon.palette);
    if (weapon.category === 'shield') fallback.rotation.x = Math.PI / 2; // disque debout, face à +Z comme un sticker
    this.setModel(normalize(fallback));
    if (weapon.stickerUrl) {
      template(weapon.stickerUrl)
        .then((t) => { if (!this.disposed) this.setModel(normalize(t.clone(true))); })
        .catch((e) => console.warn('[weapons] sticker', e));
    }
  }

  private setModel(obj: THREE.Object3D): void {
    if (this.model) this.root.remove(this.model);
    for (const m of this.materials) m.dispose();
    this.model = obj;
    obj.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(obj).getSize(this.size);
    this.materials = ownMaterials(obj);
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
