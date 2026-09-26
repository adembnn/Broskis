// Chargement glTF/GLB (KayKit Medieval Hexagon, Kenney Pirate, KayKit Restaurant/Furniture Bits, props.glb).
// Un seul GLTFLoader partagé, decoder meshopt (props.glb / pack pirate), cache par URL, clones stylisés.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { stylizeTree, type Grade } from './materials';

let loaderSingleton: GLTFLoader | null = null;
function loader(): GLTFLoader {
  if (!loaderSingleton) loaderSingleton = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loaderSingleton;
}

const cache = new Map<string, Promise<GLTF>>();
function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) { p = loader().loadAsync(url); cache.set(url, p); }
  return p;
}

/** Clone stylisé de la scène entière d'un glTF, ou d'un nœud nommé (props.glb contient plusieurs objets). */
export async function instantiate(url: string, node?: string, grade: Grade = {}, shadows = true): Promise<THREE.Object3D | null> {
  const gltf = await loadGltf(url);
  let clone: THREE.Object3D;
  if (node) {
    const src = gltf.scene.getObjectByName(node);
    if (!src) return null;
    clone = src.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(1);
  } else {
    clone = gltf.scene.clone(true);
  }
  stylizeTree(clone, grade, { cast: shadows, receive: shadows });
  return clone;
}
