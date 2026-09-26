// Post-traitement : vues → UnrealBloom → étalonnage (vignette) → OutputPass (rendu-premium skill §5 : threshold haut,
// 1 seul effet). Remplace ctx.three.render (contrat LA). Écran scindé (lot RTVIEW) : les 2 vues sont dessinées
// dans la MÊME cible (ViewsPass), puis la chaîne tourne une seule fois sur l'image complète ; la vignette est
// calculée par vue (sinon le centre de l'écran, entre les 2 vues, resterait clair et les bords extérieurs sombres).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { rendu, maps } from '../../art/tokens.js';
import { getViewsDrawer, type ViewsDrawer } from '../../core/ctx';
import type { Ctx, MapId } from '../../core/types';

export interface PostFx {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  onResize(fn: () => void): void;
}

/** Remplace RenderPass : chaque vue dans son rectangle de la cible du compositeur (ombres calculées une fois). */
class ViewsPass extends Pass {
  private readonly drawer: ViewsDrawer;
  constructor(drawer: ViewsDrawer) {
    super();
    this.drawer = drawer;
    this.needsSwap = false;
  }
  render(_renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.drawer.draw(readBuffer);
  }
}

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteOffset: { value: 1.0 },
    vignetteDarkness: { value: 1.2 },
    tintColor: { value: new THREE.Color(1, 1, 1) },
    saturation: { value: 1.0 },
    uViews: { value: 1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    uniform vec3 tintColor;
    uniform float saturation;
    uniform float uViews;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      // Saturation
      float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
      vec3 gray = vec3(luma);
      vec3 satColor = mix(gray, texel.rgb, saturation);

      // Tint
      vec3 tinted = satColor * tintColor;

      // Vignette, centrée sur chaque vue (écran scindé : 2 vues côte à côte)
      vec2 vv = vec2(fract(vUv.x * uViews), vUv.y);
      vec2 uv = (vv - vec2(0.5)) * vec2(vignetteOffset);
      float vignette = clamp(1.0 - dot(uv, uv) * vignetteDarkness, 0.0, 1.0);

      gl_FragColor = vec4(tinted * vignette, texel.a);
    }
  `
};

function mapEnv(mapId: MapId) {
  const table = maps as unknown as Record<string, any>;
  return table[mapId] ?? table.archipel;
}

export function installPostFx(ctx: Ctx): PostFx {
  const { renderer } = ctx.three;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const drawer = getViewsDrawer();

  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  // Lot LPERF : définition CSS fixe (sinon +56 % de pixels au 1er redimensionnement, sans rien gagner à l'œil).
  composer.setPixelRatio(1);
  composer.addPass(new ViewsPass(drawer));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), rendu.bloom.force, rendu.bloom.rayon, rendu.bloom.seuil);
  composer.addPass(bloom);

  const colorGradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(colorGradePass);

  composer.addPass(new OutputPass());

  const resizeCbs: (() => void)[] = [];
  function resize(): void {
    composer.setSize(window.innerWidth, window.innerHeight);
    for (const cb of resizeCbs) cb();
  }
  window.addEventListener('resize', resize);

  function applyMapFx(mapId: MapId) {
    const m = mapEnv(mapId);
    if (m.decor) {
      colorGradePass.uniforms.tintColor.value.set(m.decor.teinte || '#ffffff');
      colorGradePass.uniforms.saturation.value = m.decor.saturation ?? 1.0;
    }
  }

  applyMapFx(ctx.state.mapId);
  ctx.bus.on('match:start', ({ mapId }) => applyMapFx(mapId));

  ctx.three.render = () => {
    colorGradePass.uniforms.uViews.value = ctx.three.views().length;
    composer.render();
    drawer.separator();
  };

  return { composer, bloom, onResize: (fn) => resizeCbs.push(fn) };
}
