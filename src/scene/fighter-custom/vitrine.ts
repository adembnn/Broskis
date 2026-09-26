// Vitrine 3D de l'écran de choix (lot LFACE) : les 2 combattants côte à côte, face aux joueurs, avant READY.
// Petit rendu indépendant (son propre canvas) : entrée en « cheer », puis garde au repos, tête à ressort comprise.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { FighterDef, PlayerId } from '../../core/types';
import { maps, rendu } from '../../art/tokens.js';
import { LOCAL_TOKENS } from '../localTokens';
import { instantiateFighterModel } from '../fighters/loader';
import { applyFighterLook } from './index';

export interface Vitrine {
  root: HTMLCanvasElement;
  dispose(): void;
}

/** Placement : écart entre les 2 persos (m), léger quart de tour l'un vers l'autre (rad), caméra de face. */
const SCENE = { ecart: 1.3, quartDeTour: 0.3, fov: 26, camera: [0, 1.45, 7.4] as const, vise: [0, 1.2, 0] as const };

function creerRendu(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  for (const antialias of [true, false]) {
    try {
      return new THREE.WebGLRenderer({ canvas, antialias, alpha: true });
    } catch {
      // contexte WebGL refusé (trop de contextes, pilote) : essai sans anticrénelage, sinon pas de vitrine
    }
  }
  return null;
}

/** null si le navigateur refuse un contexte WebGL de plus : l'écran de choix garde alors sa grille. */
export function mountVitrine(fighters: [FighterDef, FighterDef]): Vitrine | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'fighter-stage-canvas';
  const renderer = creerRendu(canvas);
  if (!renderer) return null;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendu.pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = rendu.environnement;
  const lum = maps.archipel;
  scene.add(new THREE.HemisphereLight(lum.hemi.ciel, lum.hemi.sol, lum.hemi.intensite));
  const soleil = new THREE.DirectionalLight(lum.principale.couleur, lum.principale.intensite);
  soleil.position.set(-3, 6, 7); // de face et de côté : les deux visages sont éclairés
  scene.add(soleil);
  const camera = new THREE.PerspectiveCamera(SCENE.fov, 2, 0.1, 60);
  camera.position.set(...SCENE.camera);
  camera.lookAt(...SCENE.vise);

  const mixers: THREE.AnimationMixer[] = [];
  let vivant = true;
  fighters.forEach(async (f, i) => {
    const p = i as PlayerId;
    try {
      const { root, animations } = await instantiateFighterModel(f, p);
      if (!vivant) return;
      if (f.look) await applyFighterLook(root, f.look);
      if (!vivant) return;
      const porteur = new THREE.Group();
      porteur.add(root);
      porteur.scale.setScalar(LOCAL_TOKENS.fighterScale);
      porteur.position.x = i === 0 ? -SCENE.ecart : SCENE.ecart;
      porteur.rotation.y = i === 0 ? SCENE.quartDeTour : -SCENE.quartDeTour;
      scene.add(porteur);
      const mixer = new THREE.AnimationMixer(root);
      const clip = (nom: string) => animations.find((c) => c.name === nom);
      const repos = clip('idle') ?? animations[0];
      const entree = clip('cheer');
      if (entree && repos) {
        const a = mixer.clipAction(entree);
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
        a.play();
        mixer.addEventListener('finished', () => {
          const r = mixer.clipAction(repos);
          r.reset().play();
          a.crossFadeTo(r, 0.25, false);
        });
      } else if (repos) mixer.clipAction(repos).play();
      mixers.push(mixer);
    } catch (e) {
      console.error('[vitrine]', (e as Error)?.message ?? e);
    }
  });

  let dernier = performance.now();
  let raf = 0;
  const image = (now: number) => {
    if (!vivant) return;
    raf = requestAnimationFrame(image);
    const dt = Math.min(0.05, (now - dernier) / 1000);
    dernier = now;
    for (const m of mixers) m.update(dt);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w > 0 && h > 0) {
      const taille = renderer.getSize(new THREE.Vector2());
      if (taille.x !== w || taille.y !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    }
  };
  raf = requestAnimationFrame(image);

  return {
    root: canvas,
    dispose() {
      vivant = false;
      cancelAnimationFrame(raf);
      for (const m of mixers) m.stopAllAction();
      scene.clear();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
