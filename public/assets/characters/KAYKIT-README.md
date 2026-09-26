# KayKit assets (optimisés pour l'arène)

Modèles 3D low-poly de **Kay Lousberg** (KayKit, https://kaylousberg.com), licence **CC0 1.0** (domaine public : aucune attribution obligatoire, créditée quand même).

| Fichier | Source |
|---|---|
| mage.glb, knight.glb, barbarian.glb, rogue_hooded.glb | KayKit Character Pack: Adventurers |
| skeleton_mage.glb, skeleton_warrior.glb | KayKit Character Pack: Skeletons |
| props.glb | KayKit Dungeon Remastered, Restaurant Bits (stew_pot, pot_large, jar), Halloween Bits (lantern_hanging) |

Détails (tailles, clips, noms de nœuds, bounding boxes, pivots) : `manifest.json`.

## Chargement (three.js 0.180)

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // obligatoire (EXT_meshopt_compression)
const gltf = await loader.loadAsync(url);
const hero = SkeletonUtils.clone(gltf.scene);                      // une copie par instance
const mixer = new THREE.AnimationMixer(hero);
mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'idle')).play();
// props : gltf.scene.getObjectByName('barrel_large').clone()
```

- Extensions requises : `EXT_meshopt_compression`, `KHR_mesh_quantization`, parfois `EXT_texture_webp` — toutes gérées nativement par GLTFLoader (+ MeshoptDecoder). Pas de Draco ni KTX2.
- Clips (vocabulaire commun) : `idle cast castLong raise throw hit hitB death block dodge cheer run jump` (+ `taunt` pour les squelettes).
- Les armes/boucliers/chapeaux sont des meshes attachés aux os, tous visibles par défaut : masquer ceux dont on ne veut pas (`getObjectByName('2H_Sword').visible = false`). Liste dans `manifest.json > characters.*.accessories`.
- Unités KayKit : personnage ≈ 2,4–2,7 de haut, table = 1, mur = 4×4.

## Régénérer

Pipeline hors projet : `/home/claude/assets-pipeline` (`node chars.mjs`, `LIST=props-list.json node props.mjs`, `node manifest.mjs`, vérif `node validate.mjs` + `shot.py`).
