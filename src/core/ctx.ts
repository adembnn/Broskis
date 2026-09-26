// Crée le contexte partagé (rendu three, bus, boucle, physique, hasard, état, hooks) passé à chaque install().
import * as THREE from 'three';
import { rendu } from '../art/tokens.js';
import { createBus } from './bus';
import { DEMO_SEED, installDemoKeys, isDemo } from './demo';
import { createHooks } from './hooks';
import { createLoop } from './loop';
import { createPhysics } from './physics';
import { createRng } from './rng';
import { createState, exposeState } from './state';
import type { Ctx, Three } from './types';

const TONE_MAPPING: Record<string, THREE.ToneMapping> = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
};

function createThree(root: HTMLElement): Three {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[rendu.toneMapping] ?? THREE.AgXToneMapping;
  renderer.toneMappingExposure = rendu.exposition;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  const uiRoot = document.createElement('div');
  uiRoot.id = 'ui';
  root.appendChild(uiRoot);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 4, 12);
  camera.lookAt(0, 1, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const three: Three = {
    scene,
    camera,
    renderer,
    canvas: renderer.domElement,
    uiRoot,
    render: () => renderer.render(scene, camera),
  };
  return three;
}

declare global { interface Window { ctx?: Ctx } }

export async function createCtx(root: HTMLElement): Promise<Ctx> {
  const demo = isDemo();
  const seed = demo ? DEMO_SEED : (Math.random() * 1e9) | 0;
  const bus = createBus();
  const loop = createLoop(bus);
  const rng = createRng(seed);
  const state = createState(seed, demo);
  const three = createThree(root);
  const physics = await createPhysics();
  const hooks = createHooks(bus, () => ctx.state, rng);

  const ctx: Ctx = { bus, state, three, loop, physics, rng, demo, hooks };

  exposeState(() => ctx.state);
  bus.onAny((name) => { ctx.state.lastEvent = name; });
  bus.on('phase:change', ({ to }) => { ctx.state.phase = to; });
  if (demo) installDemoKeys(bus);

  loop.addSystem('physics', (dt) => physics.step(dt), 100);
  loop.addSystem('render', () => ctx.three.render(), 1000);

  window.ctx = ctx; // débogage : ctx.bus.emit('hit', …) depuis la console
  return ctx;
}
