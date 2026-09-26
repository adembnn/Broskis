// Chargement KayKit : GLTFLoader + décodeur meshopt (obligatoire, EXT_meshopt_compression), SkeletonUtils.clone
// pour instancier plusieurs fois le même perso (public/assets/characters, voir manifest.json).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { FighterDef, ModelId, PlayerId } from '../../core/types';
import { addVinylShells, type VinylShells } from '../render/toon';
import { teamColor } from '../team';

let sharedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedLoader;
}

const gltfCache = new Map<string, Promise<GLTF>>();

/** modèle 'custom' + glbUrl (vedettes LP2) → ce GLB ; 'custom' sans glbUrl (photo en direct, LP) → corps par défaut. */
export function resolveModelUrl(fighter: Pick<FighterDef, 'model' | 'glbUrl'>): string {
  if (fighter.model === 'custom' && fighter.glbUrl) return fighter.glbUrl;
  const model: ModelId = fighter.model === 'custom' ? 'knight' : fighter.model;
  return `/assets/characters/${model}.glb`;
}

function loadGltf(url: string): Promise<GLTF> {
  let p = gltfCache.get(url);
  if (!p) { p = getLoader().loadAsync(url); gltfCache.set(url, p); }
  return p;
}

/** Masque les armes/boucliers d'origine (mesh attaché à handslot.l/handslot.r) : le sticker les remplace. */
export function hideHandAccessories(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const parentName = obj.parent?.name;
    if (parentName === 'handslot.l' || parentName === 'handslot.r') obj.visible = false;
  });
}

export interface VinylMeshEntry { mesh: THREE.Mesh; shells: VinylShells }

/**
 * Convertit les matériaux d'origine (PBR texturé) en toon + les 3 coques vinyle (règle 2 de la DA).
 * Teinte le buste (`*_Body`, présent sur les 6 modèles — manifest.json) à la couleur d'équipe du joueur
 * (règle 4 : ≥30 % de la silhouette). `applyLook` (recoloration fine par bande de teinte) reste à faire :
 * voir le rendu du lot.
 */
function toonify(root: THREE.Object3D, player: PlayerId): VinylMeshEntry[] {
  const team = teamColor(player);
  const entries: VinylMeshEntry[] = [];
  // On liste d'abord : addVinylShells ajoute des coques enfants que traverse() visiterait (et contourerait) à l'infini.
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => { if ((obj as THREE.Mesh).isMesh && !obj.userData.isOutline) meshes.push(obj as THREE.Mesh); });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(src)) continue; // props/persos KayKit : jamais de multi-matériau
    const isTorso = /_Body$/.test(mesh.name);
    
    // Rendu stylisé premium façon Smash
    const baseColor = new THREE.Color(isTorso ? team : (src.color ?? '#ffffff'));
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    // Plus saturés et plus lumineux que le décor
    baseColor.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.3 + 0.1), Math.min(1.0, hsl.l * 1.3 + 0.1));
    
    mesh.material = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: src.map ?? null,
      roughness: 0.6,
      metalness: src.metalness ?? 0.1,
    });
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    entries.push({ mesh, shells: addVinylShells(mesh) });
  }
  return entries;
}

export interface LoadedFighterModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  vinylMeshes: VinylMeshEntry[];
}

/** Charge (cache réseau) puis clone (squelette indépendant) une instance du modèle KayKit demandé. */
export async function instantiateFighterModel(fighter: Pick<FighterDef, 'model' | 'glbUrl'>, player: PlayerId): Promise<LoadedFighterModel> {
  const url = resolveModelUrl(fighter);
  const gltf = await loadGltf(url);
  const root = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;
  // Pas de mise à l'échelle ici : elle est portée par le groupe de squash & stretch (fighters/animator.ts),
  // pour que k=1 corresponde bien à LOCAL_TOKENS.fighterScale (voir manifest.json : unités KayKit ≠ mètres).
  hideHandAccessories(root);
  const vinylMeshes = toonify(root, player);
  return { root, animations: gltf.animations, vinylMeshes };
}
