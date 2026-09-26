// Le perso 3D se construit dans l'encart du joueur (lot LWAIT) : le corps claque, la grosse tête (le sticker du
// portrait) se gonfle en volume, puis le tout tourne sur lui-même pour montrer la face ET le dos.
// `ready` ne passe à true qu'une fois la grosse tête VRAIMENT posée sur l'os de la tête et dessinée à l'écran :
// c'est le signal qui débloque « Ready to fight! ». false = tête non posée (détourage raté) ; null au montage = pas de
// contexte WebGL (le navigateur en refuse un de plus) : l'écran se rabat alors sur les images 2D.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { FighterDef, PlayerId } from '../../core/types';
import { durees, maps, rendu } from '../../art/tokens.js';
import { LOCAL_TOKENS } from '../../scene/localTokens';
import { instantiateFighterModel } from '../../scene/fighters/loader';
import { applyFighterLook } from '../../scene/fighter-custom';

export interface HeadPreview {
  root: HTMLCanvasElement;
  ready: Promise<boolean>;
  dispose(): void;
}

/** Caméra (fov en degrés, marge autour du perso), tour complet en s, départ de 3/4 (rad) pour lire le volume. */
const VUE = { fov: 24, marge: 1.1, tourS: 5, depart: -0.6 };
/** Construction : claque du corps, puis la tête plate qui se gonfle (s depuis l'apparition). */
const CONSTRUCTION = { corps: durees.glisse / 1000, teteDebut: durees.glisse / 1000, tete: (durees.glisse * 2) / 1000, plat: 0.06 };

const claque = (k: number) => { // dépasse puis se pose (même esprit que ui.courbes.claque)
  const c = 1.70158 * 1.5;
  const x = k - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const borne = (k: number) => Math.min(1, Math.max(0, k));

export function mountHeadPreview(f: FighterDef, p: PlayerId): HeadPreview | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'lwait-3d';
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
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
  soleil.position.set(-3, 6, 7);
  scene.add(soleil);
  const camera = new THREE.PerspectiveCamera(VUE.fov, 1, 0.05, 60);
  const porteur = new THREE.Group();
  porteur.visible = false;
  scene.add(porteur);

  let vivant = true;
  let mixer: THREE.AnimationMixer | null = null;
  let tete: THREE.Object3D | null = null;
  let teteEchelle = 1;
  let ne = 0; // performance.now() de l'apparition
  let fini = false;
  let resoudre!: (ok: boolean) => void;
  const ready = new Promise<boolean>((r) => (resoudre = r));
  const cible = new THREE.Vector3();
  let hauteur = 2;

  void (async () => {
    try {
      const { root, animations } = await instantiateFighterModel(f, p);
      if (!vivant) return resoudre(false);
      if (f.look) await applyFighterLook(root, f.look);
      if (!vivant) return resoudre(false);
      // La preuve : le pivot de la grosse tête existe sur l'os de la tête (sinon la tête KayKit est restée).
      const pivot = root.getObjectByName('grosse-tete');
      if (!pivot) return resoudre(false);
      tete = pivot.getObjectByName('grosse-tete-vinyle') ?? null;
      teteEchelle = tete ? tete.scale.x : 1;
      porteur.add(root);
      porteur.scale.setScalar(LOCAL_TOKENS.fighterScale);
      porteur.rotation.y = VUE.depart;
      const repos = animations.find((c) => c.name === 'idle') ?? animations[0];
      if (repos) {
        mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(repos).play();
        mixer.update(0.2);
      }
      porteur.updateMatrixWorld(true);
      const boite = new THREE.Box3().setFromObject(porteur);
      hauteur = Math.max(0.5, boite.max.y - boite.min.y);
      boite.getCenter(cible);
      if (tete) tete.scale.set(teteEchelle, teteEchelle, teteEchelle * CONSTRUCTION.plat); // sticker encore plat
      porteur.visible = true;
      ne = performance.now();
    } catch (e) {
      console.error('[lwait] perso 3D', (e as Error)?.message ?? e);
      resoudre(false);
    }
  })();

  let dernier = performance.now();
  let raf = 0;
  const image = (now: number) => {
    if (!vivant) return;
    raf = requestAnimationFrame(image);
    const dt = Math.min(0.05, (now - dernier) / 1000);
    dernier = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const taille = renderer.getSize(new THREE.Vector2());
    if (taille.x !== w || taille.y !== h) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Cadrage : tout le perso (grosse tête comprise), même dans un encart étroit.
    const demi = THREE.MathUtils.degToRad(VUE.fov / 2);
    const d = Math.max((hauteur * VUE.marge) / 2 / Math.tan(demi), (hauteur * 0.55 * VUE.marge) / 2 / (Math.tan(demi) * camera.aspect));
    camera.position.set(cible.x, cible.y + hauteur * 0.04, cible.z + d);
    camera.lookAt(cible);
    camera.updateProjectionMatrix();
    if (ne) {
      const t = (now - ne) / 1000;
      mixer?.update(dt);
      const kc = borne(t / CONSTRUCTION.corps);
      porteur.scale.setScalar(LOCAL_TOKENS.fighterScale * Math.max(0.01, claque(kc)));
      porteur.rotation.y = VUE.depart + (t / VUE.tourS) * Math.PI * 2;
      const kt = borne((t - CONSTRUCTION.teteDebut) / CONSTRUCTION.tete);
      if (tete) {
        // Le sticker plat se gonfle en volume (profondeur), avec un léger rebond en largeur.
        const z = CONSTRUCTION.plat + (1 - CONSTRUCTION.plat) * Math.max(0, claque(kt));
        const xy = 1 + 0.12 * Math.sin(Math.PI * kt) * (1 - kt);
        tete.scale.set(teteEchelle * xy, teteEchelle * xy, teteEchelle * z);
      }
      renderer.render(scene, camera);
      if (!fini && kt >= 1) {
        fini = true;
        resoudre(true); // tête posée, gonflée ET dessinée : elle est vraiment à l'écran
      }
    } else {
      renderer.render(scene, camera);
    }
  };
  raf = requestAnimationFrame(image);

  return {
    root: canvas,
    ready,
    dispose() {
      if (!vivant) return;
      vivant = false;
      resoudre(false);
      cancelAnimationFrame(raf);
      mixer?.stopAllAction();
      scene.clear();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
