// Chargement glTF/GLB (KayKit Medieval Hexagon, Kenney Pirate, KayKit Restaurant/Furniture Bits, props.glb).
// Un seul GLTFLoader partagé, decoder meshopt (props.glb / pack pirate), cache par URL, clones toonifiés.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { toonifyTree, type Grade } from './toon';

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

/** Précharge une liste d'URLs en parallèle (utile avant de construire une map). */
export function preload(urls: string[]): Promise<unknown> {
  return Promise.all(urls.map(loadGltf));
}

/** Clone toonifié de la scène entière d'un glTF/GLB (fichiers à un seul objet : tuiles, barils, bateau…).
 *  `grade` applique la désaturation/teinte de la map courante (tokens.maps.<id>.decor) aux packs texturés. */
export async function instantiate(url: string, grade: Grade = {}): Promise<THREE.Group> {
  const gltf = await loadGltf(url);
  const clone = gltf.scene.clone(true) as THREE.Group;
  toonifyTree(clone, grade);
  return clone;
}

/** Clone toonifié d'un nœud nommé à l'intérieur d'un glTF (ex. props.glb qui contient plusieurs objets). */
export async function instantiateNode(url: string, nodeName: string, grade: Grade = {}): Promise<THREE.Object3D | null> {
  const gltf = await loadGltf(url);
  const src = gltf.scene.getObjectByName(nodeName);
  if (!src) return null;
  const clone = src.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.setScalar(1);
  toonifyTree(clone, grade);
  return clone;
}

/** Boîte englobante locale (avant tout parent transform) d'un Object3D fraîchement cloné à l'identité. */
export function localBounds(obj: THREE.Object3D): THREE.Box3 {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}
