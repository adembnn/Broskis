// STUB du lot L0 — à remplacer entièrement par le lot LA (plan/lots/LA-scene-camera.md).
// Il affiche seulement un perso KayKit en « idle » pour prouver que le rendu et les assets marchent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { palette } from '../art/tokens.js';
import type { Install } from '../core/types';

export const install: Install = async (ctx) => {
  const { scene, camera } = ctx.three;
  scene.background = new THREE.Color(palette.fond);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/assets/characters/mage.glb');
  const mage = gltf.scene;
  for (const child of mage.children) child.visible = true;
  scene.add(mage);
  const mixer = new THREE.AnimationMixer(mage);
  const idle = gltf.animations.find((a) => a.name === 'idle') ?? gltf.animations[0];
  if (idle) mixer.clipAction(idle).play();
  ctx.loop.addSystem('stub-mixer', (dt) => mixer.update(dt), 50);

  camera.position.set(0, 2.2, 6);
  camera.lookAt(0, 1.2, 0);
};
