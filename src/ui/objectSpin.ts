// Objet 3D qui se construit sur la carte d'arme (lot LWAIT-OBJ) : le VRAI sticker 3D du jeu (src/scene/sticker, même
// forme et même matière que WeaponModel de src/scene/weapons/visual.ts) posé à plat face au joueur, qui se gonfle en
// volume puis tourne. Petit rendu indépendant sur son propre canvas, arrêté au dispose.
//   const spin = mountObjectSpin(weapon);  illustration.append(spin.root);
//   await spin.ready;   // modèle construit ET gonflé : l'arme est jouable en 3D
import * as THREE from 'three';
import type { Weapon } from '../core/types';
import { durees, maps, rendu } from '../art/tokens.js';
import { makeSticker } from '../scene/sticker';
import { lookOf } from '../scene/weapons/physics';

export interface ObjectSpin {
  root: HTMLCanvasElement;
  /** Résolue quand le modèle est construit et gonflé ; rejetée si le sticker ne donne pas de forme 3D. */
  ready: Promise<void>;
  dispose(): void;
}

/** Épaisseur de départ (fraction du volume final) : le sticker plat, tel que Nano Banana l'a dessiné. */
const PLAT = 0.04;
/** Tour complet en secondes, et roulis léger (rad) pour lire le volume. */
const TOUR_S = 5.5;
const ROULIS = 0.12;

/** Ease « claque » des tokens (dépasse puis se pose), évaluée à la main pour le gonflage. */
function claque(t: number): number {
  const c1 = 1.56 * 1.1;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

function creerRendu(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  for (const antialias of [true, false]) {
    try {
      return new THREE.WebGLRenderer({ canvas, antialias, alpha: true });
    } catch {
      // contexte WebGL refusé (trop de contextes, pilote) : essai sans anticrénelage, sinon pas de rendu
    }
  }
  return null;
}

export function mountObjectSpin(weapon: Weapon): ObjectSpin {
  const canvas = document.createElement('canvas');
  canvas.className = 'lscan-3d';
  let vivant = true;
  let raf = 0;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const lum = maps.archipel;
  scene.add(new THREE.HemisphereLight(lum.hemi.ciel, lum.hemi.sol, lum.hemi.intensite * 2.2));
  const soleil = new THREE.DirectionalLight(lum.principale.couleur, lum.principale.intensite * 0.8);
  soleil.position.set(-2, 3, 4); // de face et de côté : le bombé se lit
  scene.add(soleil);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
  camera.position.set(0, 0.08, 2.35);
  camera.lookAt(0, 0, 0);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const url = weapon.stickerUrl;
  const { shape, material } = lookOf(weapon);
  const ready = (async () => {
    if (!url) throw new Error('no sticker');
    const model = await makeSticker(url, { height: 1, forme: shape, matiere: material });
    if (!vivant) return;
    // Centré, plus grande dimension = 1 (même normalisation que WeaponModel).
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 1e-3));
    pivot.add(wrap);
    pivot.scale.z = PLAT;

    renderer = creerRendu(canvas);
    if (!renderer) return; // la forme existe (jouable en match) ; seul l'aperçu manque
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, rendu.pixelRatioMax));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = rendu.exposition;
    renderer.setClearColor(0x000000, 0);
    canvas.classList.add('on');

    const gonfle = durees.dramatique;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      let fini = false;
      const image = (now: number) => {
        if (!vivant || !renderer) return resolve();
        raf = requestAnimationFrame(image);
        const t = (now - t0) / 1000;
        const k = Math.min(1, (now - t0) / gonfle);
        pivot.scale.z = PLAT + (1 - PLAT) * claque(k);
        // Face au joueur pendant le gonflage (le sticker 2D devient l'objet), puis il tourne.
        const tourne = Math.max(0, t - gonfle / 1000);
        pivot.rotation.y = tourne * ((Math.PI * 2) / TOUR_S) * Math.min(1, tourne * 1.5);
        pivot.rotation.x = Math.sin(t * 1.3) * ROULIS * Math.min(1, tourne);
        pivot.position.y = Math.sin(t * 2.1) * 0.02;
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
        if (!fini && k >= 1) {
          fini = true;
          resolve();
        }
      };
      raf = requestAnimationFrame(image);
    });
  })();
  ready.catch(() => {}); // l'appelant lit l'échec sur `ready` ; ici, jamais de rejet non géré

  return {
    root: canvas,
    ready,
    dispose() {
      vivant = false;
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          (m as THREE.MeshToonMaterial | undefined)?.map?.dispose(); // texture propre à ce modèle (makeSticker)
          m?.dispose();
        }
      });
      scene.clear();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = null;
    },
  };
}
