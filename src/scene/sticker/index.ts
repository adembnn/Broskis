// STUB du lot L0 — à remplacer par le lot LS (plan/lots/LS-sticker-3d.md). Les signatures sont le contrat.
// Ce stub pose l'image sur un simple plan pour que les autres lots puissent déjà l'utiliser.
import * as THREE from 'three';
import type { Category } from '../../core/types';

export interface StickerOptions { depth?: number; border?: number; height?: number }

/** Image sur fond #FF00FF → découpe carton épaisse en 3D (groupe centré, hauteur `height`). */
export async function makeSticker(src: string | HTMLImageElement, opts: StickerOptions = {}): Promise<THREE.Group> {
  const height = opts.height ?? 1;
  const texture = typeof src === 'string' ? await new THREE.TextureLoader().loadAsync(src) : new THREE.Texture(src);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const image = texture.image as { width: number; height: number };
  const aspect = image.width / image.height || 1;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
  );
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Retire le fond magenta #FF00FF d'une image. */
export function chromaKey(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return canvas;
}

/** Forme simple par catégorie quand l'image n'est pas disponible. */
export function makeFallbackSticker(_category: Category, palette: [string, string]): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: palette[0] })));
  return group;
}
