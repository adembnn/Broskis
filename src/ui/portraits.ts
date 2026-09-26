// Portraits des combattants façon Smash (grille de choix, encarts du HUD, écran de fin) : rendu hors écran, une
// seule fois, du vrai modèle KayKit en plan buste (pose « idle »), sur fond transparent — le cercle de couleur du
// joueur est posé par le CSS. Perso photo : son visage sticker (détouré comme les armes). En attendant le rendu :
// l'initiale du perso, jamais une case vide.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { FighterDef, ModelId, PlayerId } from '../core/types';
import { el } from './dom';
import { detourSticker } from './sticker2d';

const SIZE = 256;
const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;
let loader: GLTFLoader | null = null;
let queue: Promise<unknown> = Promise.resolve();

function modelUrl(f: Pick<FighterDef, 'model' | 'glbUrl'>): string {
  if (f.model === 'custom' && f.glbUrl) return f.glbUrl;
  const model: ModelId = f.model === 'custom' ? 'knight' : f.model;
  return `/assets/characters/${model}.glb`;
}

async function renderBust(url: string): Promise<string | null> {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const root = gltf.scene;
  root.traverse((o) => {
    const parent = o.parent?.name;
    if (parent === 'handslot.l' || parent === 'handslot.r' || parent === 'handslotl' || parent === 'handslotr') o.visible = false; // GLTFLoader retire les points des noms d'os // pas d'arme d'origine : les armes, ce sont les objets
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const src = mesh.material as THREE.MeshStandardMaterial;
      mesh.material = new THREE.MeshToonMaterial({ map: src.map ?? null, color: src.color ?? new THREE.Color(0xffffff) });
    }
  });
  scene.add(root);
  const idle = gltf.animations.find((c) => c.name === 'idle') ?? gltf.animations[0];
  if (idle) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(idle).play();
    mixer.update(0.4);
  }
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const h = Math.max(0.5, box.max.y - box.min.y);
  const cy = box.min.y + h * 0.7;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  cam.position.set(h * 0.18, cy + h * 0.02, h * 0.95);
  cam.lookAt(0, cy, 0);
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x6a5a50, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-2, 3, 3);
  scene.add(key);
  renderer.render(scene, cam);
  const data = renderer.domElement.toDataURL('image/png');
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });
  return data;
}

/** Rendu (mis en cache, un à la fois) du buste d'un perso ; null si le modèle ne charge pas. */
export function portraitUrl(f: Pick<FighterDef, 'model' | 'glbUrl'>): Promise<string | null> {
  const url = modelUrl(f);
  let p = cache.get(url);
  if (!p) {
    p = queue.then(() => renderBust(url)).catch(() => null);
    queue = p;
    cache.set(url, p);
  }
  return p;
}

/** Précharge les portraits (à l'écran-titre) : la grille de choix s'affiche ensuite sans attente. */
export function preloadPortraits(fighters: Pick<FighterDef, 'model' | 'glbUrl'>[]): Promise<unknown> {
  return Promise.all(fighters.map((f) => portraitUrl(f)));
}

/** Portrait prêt à poser : initiale tout de suite, image dès qu'elle est prête (visage sticker pour un perso photo). */
export function fighterPortrait(f: FighterDef | null | undefined, player?: PlayerId): HTMLDivElement {
  const box = el('div', `portrait${player != null ? ` p${player + 1}` : ''}`);
  const initial = el('span', 'portrait-initial', (f?.name ?? '?').trim().charAt(0).toUpperCase() || '?');
  box.append(initial);
  if (!f) return box;
  const face = f.portraitUrl ?? f.look?.faceUrl;
  const src = face ? detourSticker(face) : portraitUrl(f);
  void src.then((url) => {
    if (!url) return;
    const img = el('img', `portrait-img${face ? ' face' : ''}`);
    img.alt = f.name;
    img.draggable = false;
    img.src = url;
    box.replaceChildren(img);
  });
  return box;
}
