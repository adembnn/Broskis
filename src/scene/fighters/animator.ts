// Contrôleur d'animation KayKit : crossfade entre clips + squash & stretch ressort (design-system-cartoon.md §1).
// Vocabulaire commun aux 6 modèles (manifest.json) : idle, run, jump, throw, cast, castLong, raise, block,
// dodge, hit, hitB, death, cheer (+ taunt pour les squelettes).
import * as THREE from 'three';

export interface PlayOptions {
  loop?: boolean;
  fade?: number;
  onFinished?: () => void;
}

/** k=1 neutre, k<1 écrasé (anticipation/impact), k>1 étiré (lancer) ; ressort critique amorti vers 1. */
interface SpringState { k: number; v: number }

const STIFFNESS = 180;
const DAMPING = 12;

export class FighterAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private readonly spring: SpringState = { k: 1, v: 0 };
  private readonly baseScale: number;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], baseScale: number) {
    this.mixer = new THREE.AnimationMixer(root);
    this.baseScale = baseScale;
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  /** Joue `name` avec fondu enchaîné depuis le clip courant. Ignoré si le clip n'existe pas sur ce modèle. */
  play(name: string, opts: PlayOptions = {}): void {
    const { loop = true, fade = 0.2, onFinished } = opts;
    const action = this.actions.get(name);
    if (!action) return;
    if (action === this.current && loop) return; // déjà en boucle sur ce clip : rien à refaire
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.play();
    if (this.current && this.current !== action) this.current.crossFadeTo(action, fade, false);
    this.current = action;
    if (onFinished) {
      const handler = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return;
        this.mixer.removeEventListener('finished', handler);
        onFinished();
      };
      this.mixer.addEventListener('finished', handler);
    }
  }

  /** Impulsion de squash cartoon : k<1 écrase (impact), k>1 étire (release), le ressort ramène à 1. */
  bump(k: number): void {
    this.spring.k = k;
    this.spring.v = 0;
  }

  update(dt: number, wrapper: THREE.Object3D): void {
    this.mixer.update(dt);
    if (dt > 0) {
      const a = -STIFFNESS * (this.spring.k - 1) - DAMPING * this.spring.v;
      this.spring.v += a * dt;
      this.spring.k += this.spring.v * dt;
    }
    const k = this.spring.k;
    const side = this.baseScale / Math.sqrt(Math.max(0.25, k));
    wrapper.scale.set(side, this.baseScale * k, side);
  }
}
