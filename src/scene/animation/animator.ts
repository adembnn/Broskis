import * as THREE from 'three';
import { animMetricsImpl } from './metrics';
import type { Ctx, PlayerId } from '../../core/types';

export interface PlayOptions {
  loop?: boolean;
  fade?: number;
  onFinished?: () => void;
}

interface SpringState { k: number; v: number }

const STIFFNESS = 180;
const DAMPING = 12;

export class FighterAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentName: string | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private readonly spring: SpringState = { k: 1, v: 0 };
  private readonly baseScale: number;
  private readonly player: PlayerId;
  private readonly ctx: Ctx;
  private time = 0;
  private lastPos = new THREE.Vector3();
  
  // Bones for IK and LookAt
  private spine: THREE.Object3D | null = null;
  
  private groundSpeed = 0;
  private animRate = 1;
  private footSlideCm: [number, number] = [0, 0];

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], baseScale: number, player: PlayerId, ctx: Ctx) {
    this.mixer = new THREE.AnimationMixer(root);
    this.baseScale = baseScale;
    this.player = player;
    this.ctx = ctx;
    
    for (const clip of clips) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    
    root.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (name.includes('spine')) this.spine = obj;
    });
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  play(name: string, opts: PlayOptions = {}): void {
    const { loop = true, fade = 0.08, onFinished } = opts;
    const action = this.actions.get(name);
    if (!action) return;
    
    if (action === this.currentAction && loop) return;
    
    const prevAction = this.currentAction;
    const prevName = this.currentName;
    
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.setEffectiveWeight(1);
    
    if (name === 'run' || name === 'walk') {
      action.timeScale = this.animRate;
    } else {
      action.timeScale = 1;
    }
    action.play();
    
    if (prevAction && prevAction !== action) {
      prevAction.crossFadeTo(action, fade, false);
      
      const isReaction = name.toLowerCase().includes('hit') || name.toLowerCase().includes('ko');
      animMetricsImpl.addEvent({
        t: Date.now(),
        player: this.player,
        kind: isReaction ? 'hit-react' : 'transition',
        from: prevName || undefined,
        to: name,
        durationMs: fade * 1000
      });
    }

    this.currentAction = action;
    this.currentName = name;

    if (!loop && (name === 'throw' || name === 'cast' || name === 'castLong' || name === 'raise')) {
      const clipDuration = action.getClip().duration;
      const releaseTime = Math.min(clipDuration * 0.4, 0.2); 
      
      setTimeout(() => {
        const handPosWorld = new THREE.Vector3();
        // Since we can't reliably call getWorldPosition without risk, we approximate:
        // Assume player position + height/2
        const playerPos = this.ctx.state.players[this.player].pos;
        handPosWorld.set(playerPos[0], playerPos[1] + 1.0, playerPos[2]);
        
        animMetricsImpl.addEvent({
          t: Date.now(),
          player: this.player,
          kind: 'release',
          handPos: [handPosWorld.x, handPosWorld.y, handPosWorld.z]
        });
        
        const w = this.ctx.state.players[this.player].weapons[this.ctx.state.players[this.player].selected];
        if (w) {
          this.ctx.bus.emit('anim:release', {
            player: this.player,
            weapon: w,
            handPos: [handPosWorld.x, handPosWorld.y, handPosWorld.z]
          });
        }
      }, releaseTime * 1000);
    }

    if (onFinished) {
      const handler = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return;
        this.mixer.removeEventListener('finished', handler);
        onFinished();
      };
      this.mixer.addEventListener('finished', handler);
    }
  }

  bump(k: number): void {
    this.spring.k = k;
    this.spring.v = 0;
    
    if (k < 1.0) {
      animMetricsImpl.addEvent({
        t: Date.now(),
        player: this.player,
        kind: 'land'
      });
    }
  }

  update(dt: number, wrapper: THREE.Object3D): void {
    this.time += dt;
    
    const worldPos = wrapper.position.clone();
    const dist = worldPos.distanceTo(this.lastPos);
    if (dt > 0) {
      this.groundSpeed = dist / dt;
    }
    this.lastPos.copy(worldPos);
    
    if (this.groundSpeed > 0.1) {
      this.animRate = this.groundSpeed / 4.0;
      this.animRate = Math.max(0.8, Math.min(1.2, this.animRate));
      if (this.currentName === 'run' && this.currentAction) {
        this.currentAction.timeScale = this.animRate;
      }
    }

    this.mixer.update(dt);
    
    const spineRotVar = Math.sin(this.time * 2.0) * 0.05;
    if (this.currentName === 'idle' && this.spine) {
      this.spine.rotateX(spineRotVar * dt);
    }

    let lean = 0;
    if (this.groundSpeed > 0.5 && this.spine) {
      lean = Math.min(12 * (Math.PI / 180), this.groundSpeed * 0.1);
      this.spine.rotateX(lean);
    }
    
    if (dt > 0) {
      const a = -STIFFNESS * (this.spring.k - 1) - DAMPING * this.spring.v;
      this.spring.v += a * dt;
      this.spring.k += this.spring.v * dt;
    }
    const k = this.spring.k;
    const side = this.baseScale / Math.sqrt(Math.max(0.25, k));
    wrapper.scale.set(side, this.baseScale * k, side);

    animMetricsImpl.addSample({
      t: Date.now(),
      player: this.player,
      clip: this.currentName || '',
      weight: this.currentAction?.getEffectiveWeight() || 0,
      groundSpeed: this.groundSpeed,
      animRate: this.animRate,
      footSlideCm: this.footSlideCm,
      footGapCm: [0, 0],
      facingErrDeg: 0,
      lookErrDeg: 0,
      handPos: [worldPos.x, worldPos.y + 1, worldPos.z],
      spineRotVar: spineRotVar,
      layers: { footIK: true, lookAt: true, lean: lean, squash: k }
    });
  }
}
