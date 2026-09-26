// Post-traitement : RenderPass → UnrealBloom → OutputPass (rendu-premium skill §5 : threshold haut, 1 seul effet).
// Remplace ctx.three.render (contrat LA). Budget : ≤ 2 passes d'effet — on n'en a qu'une (bloom).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { rendu } from '../../art/tokens.js';
import type { Ctx } from '../../core/types';

export interface PostFx {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  /** Enregistre un callback à rappeler au resize (ex. particules : uScale dépend de la taille du drawing buffer). */
  onResize(fn: () => void): void;
}

export function installPostFx(ctx: Ctx): PostFx {
  const { scene, camera, renderer } = ctx.three;
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Render target en HalfFloat + 4x MSAA : compense l'absence d'AA native du canvas une fois qu'on passe
  // par un composer (le bloom en profite aussi, moins de banding sur les hautes lumières additives).
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), rendu.bloom.force, rendu.bloom.rayon, rendu.bloom.seuil);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resizeCbs: (() => void)[] = [];
  function resize(): void {
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const cb of resizeCbs) cb();
  }
  window.addEventListener('resize', resize);

  ctx.three.render = () => composer.render();

  return { composer, bloom, onResize: (fn) => resizeCbs.push(fn) };
}
