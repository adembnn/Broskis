// Crée le contexte partagé (rendu three, bus, boucle, physique, hasard, état, hooks) passé à chaque install().
// Écran scindé (lot RTVIEW) : un seul WebGLRenderer, une caméra par joueur, chaque vue dessinée dans son
// rectangle (viewport + scissor) ; ombres calculées une seule fois par image ; trait d'encre entre les vues.
import * as THREE from 'three';
import { rendu } from '../art/tokens.js';
import { RTVIEW } from '../scene/camera/tokens';
import { createBus } from './bus';
import { DEMO_SEED, installDemoKeys, isDemo } from './demo';
import { createHooks } from './hooks';
import { createLoop } from './loop';
import { createPhysics } from './physics';
import { createQualite } from './quality';
import { installShaderWarmup } from './shaders';
import { createRng } from './rng';
import { createState, exposeState } from './state';
import type { Ctx, PlayerId, Three, View, ViewMode } from './types';

const TONE_MAPPING: Record<string, THREE.ToneMapping> = {
  None: THREE.NoToneMapping, // choix du DA : les hex des tokens sortent tels quels à l'écran
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

/** Ce que le post-traitement (scene/render/postfx.ts) réutilise pour dessiner les vues dans sa cible. */
export interface ViewsDrawer {
  /** Dessine toutes les vues visibles dans `target` (null = le canvas), chacune dans son rectangle. */
  draw(target: THREE.WebGLRenderTarget | null): void;
  /** Trait d'encre entre les 2 vues, dessiné sur le canvas après tout le reste (rien en solo). */
  separator(): void;
}

function pixelRatioFor(mode: ViewMode): number {
  return mode === 'split' ? RTVIEW.ratioPixelsScinde : Math.min(window.devicePixelRatio, rendu.pixelRatioMax);
}

function createThree(root: HTMLElement): { three: Three; drawer: ViewsDrawer } {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioFor('solo'));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[rendu.toneMapping] ?? THREE.NoToneMapping;
  renderer.toneMappingExposure = rendu.exposition;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // mis à jour une fois par image, avant la 1re vue (drawViews)
  root.appendChild(renderer.domElement);

  const uiRoot = document.createElement('div');
  uiRoot.id = 'ui';
  root.appendChild(uiRoot);

  const scene = new THREE.Scene();
  const makeCamera = (p: PlayerId) => {
    const cam = new THREE.PerspectiveCamera(RTVIEW.fovSolo, window.innerWidth / window.innerHeight, 0.1, 400);
    cam.position.set(p === 0 ? -5 : 5, 4, 12);
    cam.lookAt(0, 1, 0);
    cam.layers.enable(RTVIEW.calques[p]); // objets réservés à cette vue (api.onlyInView)
    return cam;
  };
  const cameras: [THREE.PerspectiveCamera, THREE.PerspectiveCamera] = [makeCamera(0), makeCamera(1)];
  const allViews: [View, View] = [
    { player: 0, camera: cameras[0], x: 0, y: 0, width: 1, height: 1, visible: true },
    { player: 1, camera: cameras[1], x: 0, y: 0, width: 1, height: 1, visible: false },
  ];
  let visibleViews: View[] = [allViews[0]];
  const beforeView: ((v: View) => void)[] = [];

  function layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (three.viewMode === 'split') {
      const half = Math.floor(w / 2);
      Object.assign(allViews[0], { x: 0, y: 0, width: half, height: h, visible: true });
      Object.assign(allViews[1], { x: half, y: 0, width: w - half, height: h, visible: true });
      visibleViews = [allViews[0], allViews[1]];
    } else {
      for (const v of allViews) Object.assign(v, { x: 0, y: 0, width: w, height: h, visible: v.player === three.soloPlayer });
      visibleViews = [allViews[three.soloPlayer]];
    }
    for (const v of allViews) {
      v.camera.aspect = v.width / Math.max(1, v.height);
      v.camera.updateProjectionMatrix();
    }
  }

  function resize(): void {
    renderer.setPixelRatio(pixelRatioFor(three.viewMode));
    renderer.setSize(window.innerWidth, window.innerHeight);
    layout();
  }
  window.addEventListener('resize', resize);

  const size = new THREE.Vector2();
  // Relevé pour les bancs (plan/rendus/RTVIEW.md) : appels de dessin de la dernière image, par vue.
  const rtview = { calls: [0, 0], mode: 'solo' as ViewMode };
  window.__rtview = rtview;
  const drawer: ViewsDrawer = {
    draw(target) {
      renderer.getSize(size);
      const W = size.x;
      const H = size.y;
      const sx = target ? target.width / W : 1;
      const sy = target ? target.height / H : 1;
      renderer.shadowMap.needsUpdate = true; // consommé par la 1re vue : les ombres ne sont calculées qu'une fois
      for (const v of visibleViews) {
        const yb = H - v.y - v.height; // WebGL : origine en bas à gauche
        if (target) {
          const x0 = Math.round(v.x * sx);
          const y0 = Math.round(yb * sy);
          const w = Math.round((v.x + v.width) * sx) - x0;
          const h = Math.round((yb + v.height) * sy) - y0;
          target.viewport.set(x0, y0, w, h);
          target.scissor.set(x0, y0, w, h);
          target.scissorTest = true;
          renderer.setRenderTarget(target);
        } else {
          renderer.setRenderTarget(null);
          renderer.setViewport(v.x, yb, v.width, v.height);
          renderer.setScissor(v.x, yb, v.width, v.height);
          renderer.setScissorTest(true);
        }
        for (const fn of beforeView) fn(v);
        renderer.render(scene, v.camera);
        rtview.calls[v.player] = renderer.info.render.calls; // info repart de 0 à chaque render() (+ ombres pour la 1re vue)
      }
      rtview.mode = three.viewMode;
      if (target) {
        target.viewport.set(0, 0, target.width, target.height);
        target.scissor.set(0, 0, target.width, target.height);
        target.scissorTest = false;
      } else {
        renderer.setViewport(0, 0, W, H);
        renderer.setScissor(0, 0, W, H);
        renderer.setScissorTest(false);
      }
    },
    separator() {
      if (three.viewMode !== 'split') return;
      renderer.getSize(size);
      const sep = RTVIEW.separateurPx;
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(null);
      renderer.setScissor(Math.round(allViews[1].x - sep / 2), 0, sep, size.y);
      renderer.setScissorTest(true);
      renderer.setClearColor(rendu.contour.encre, 1);
      renderer.clear(true, false, false);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.setScissor(0, 0, size.x, size.y);
      renderer.setScissorTest(false);
    },
  };
  const clearColor = new THREE.Color();
  const fwd = new THREE.Vector3();

  const three: Three = {
    scene,
    camera: cameras[0],
    cameras,
    renderer,
    canvas: renderer.domElement,
    uiRoot,
    render: () => { drawer.draw(null); drawer.separator(); },
    viewMode: 'solo',
    soloPlayer: 0,
    setViewMode(mode, soloPlayer = 0) {
      if (three.viewMode === mode && three.soloPlayer === soloPlayer) return;
      const ratioChanges = pixelRatioFor(mode) !== pixelRatioFor(three.viewMode);
      three.viewMode = mode;
      three.soloPlayer = soloPlayer;
      // Le ratio de pixels change (budget du scindé) : on prévient tout le monde (compositeur, effets, UI).
      if (ratioChanges) window.dispatchEvent(new Event('resize'));
      else layout();
    },
    viewOf: (player) => allViews[player],
    views: () => visibleViews,
    onBeforeView: (fn) => { beforeView.push(fn); },
    // Repli tant que src/scene/camera n'a pas posé ses caméras verrouillées : l'avant réel de la caméra.
    forwardOf(player) {
      cameras[player].getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-8) return [0, 0, -1];
      fwd.normalize();
      return [fwd.x, 0, fwd.z];
    },
  };
  layout();
  return { three, drawer };
}

declare global { interface Window { ctx?: Ctx; __rtview?: { calls: number[]; mode: ViewMode } } }

let _drawer: ViewsDrawer | null = null;
/** Pour le post-traitement : dessin des vues dans une cible. */
export function getViewsDrawer(): ViewsDrawer {
  if (!_drawer) throw new Error('createCtx() doit être appelé avant getViewsDrawer()');
  return _drawer;
}

export async function createCtx(root: HTMLElement): Promise<Ctx> {
  const demo = isDemo();
  const seed = demo ? DEMO_SEED : (Math.random() * 1e9) | 0;
  const bus = createBus();
  const loop = createLoop(bus);
  const rng = createRng(seed);
  const state = createState(seed, demo);
  const { three, drawer } = createThree(root);
  _drawer = drawer;
  const physics = await createPhysics();
  const hooks = createHooks(bus, () => ctx.state, rng);

  const ctx: Ctx = { bus, state, three, loop, physics, rng, demo, hooks };

  exposeState(() => ctx.state);
  bus.onAny((name) => { ctx.state.lastEvent = name; });
  bus.on('phase:change', ({ to }) => { ctx.state.phase = to; });
  if (demo) installDemoKeys(bus);

  loop.addSystem('physics', (dt) => physics.step(dt), 100);
  // Qualité « basse » (GPU faible, voir quality.ts) : rendu direct dans le canvas (MSAA natif), sans la chaîne
  // de post-traitement. Le canvas garde sa définition : le réduire forcerait Chrome à le mettre à l'échelle,
  // mesuré plus saccadé (images de 56-63 ms) même sur la carte NVIDIA.
  const { renderer, scene, camera } = three;
  const qualite = createQualite(bus, async (n) => {
    if (n !== 'basse') return;
    renderer.setRenderTarget(null); // shaders du rendu direct (sortie sRGB), compilés sans bloquer l'image
    await renderer.compileAsync(scene, camera);
  });
  loop.addSystem('render', (_dt, real) => {
    qualite.frame(real);
    if (qualite.niveau === 'basse') { drawer.draw(null); drawer.separator(); }
    else ctx.three.render();
  }, 1000);
  installShaderWarmup(ctx);

  window.ctx = ctx; // débogage : ctx.bus.emit('hit', …) depuis la console
  return ctx;
}
