// Animateur d'un combattant (lots LAN puis LATK2) : clips KayKit (13 du perso + pack Character Animations)
// en fondus enchaînés, puis une couche procédurale posée APRÈS le mixeur, os par os, dans le repère du perso
// (+Z devant, +Y haut, +X à sa gauche) : regard et torse vers la cible, torsion et tremblement de la charge,
// recul du tir, fouet du torse dans le sens du coup, moulinet au bord du vide, bras levés accroché au bord,
// vrille de l'éjection, respiration. Le lâcher d'un objet est un repère sur le TEMPS DU CLIP (image mesurée
// dans pack.ts), jamais une minuterie : la main est vraiment en avant quand l'objet part.
import * as THREE from 'three';
import type { Ctx, PlayerId, Vec3 } from '../../core/types';
import { ANIM } from './animTokens';
import { animMetricsImpl } from './metrics';
import { fitClipToRig, packData, type KeyTimes } from './pack';

export interface PlayOptions {
  loop?: boolean;
  fade?: number;
  /** Temps de départ dans le clip (s). */
  from?: number;
  timeScale?: number;
  /** Pose tenue : le clip est figé à ce temps (charge, garde, accroché). */
  holdAt?: number;
  onFinished?: () => void;
  /** Appelé une fois quand le clip franchit ce temps (s), avec la position monde de la main droite. */
  mark?: { at: number; fn: (handPos: Vec3) => void };
  /** Réaction à un coup : fondu mesuré comme tel (≥ 50 ms au lieu de 80). */
  reaction?: boolean;
  /** Rejoue le clip même si c'est déjà le clip courant. */
  restart?: boolean;
}

/** Ressort amorti (angle) : on lui donne une vitesse, il revient seul à 0. */
class Spring {
  x = 0;
  v = 0;
  kick(v: number): void { this.v += v; }
  step(dt: number, k: number = ANIM.ressort.raideur, c: number = ANIM.ressort.amortissement): void {
    const a = -k * this.x - c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
}

/** Couches procédurales pilotées par l'orchestration (fighters/index.ts). */
export interface ProcState {
  /** Point regardé (monde) ; null = pas de regard imposé. */
  lookAt: THREE.Vector3 | null;
  /** Part du regard appliquée (0 = le clip seul, 1 = torse et tête sur la cible). */
  lookWeight: number;
  /** Charge 0..1 : torsion du torse + tremblement. */
  charge: number;
  /** Au bord du vide : direction du vide (monde, horizontale) ; null = pas au bord. */
  teeter: THREE.Vector3 | null;
  /** Accroché au bord. */
  hang: boolean;
}

const MX = new THREE.Vector3(1, 0, 0);
const MY = new THREE.Vector3(0, 1, 0);
const MZ = new THREE.Vector3(0, 0, 1);

const STIFFNESS = 180;
const DAMPING = 12;

export class FighterAnimator {
  readonly mixer: THREE.AnimationMixer;
  readonly proc: ProcState = { lookAt: null, lookWeight: 0.5, charge: 0, teeter: null, hang: false };
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly root: THREE.Object3D;
  private readonly player: PlayerId;
  private readonly ctx: Ctx;
  private readonly baseScale: number;
  private currentName: string | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private mark: PlayOptions['mark'] | null = null;
  private markAction: THREE.AnimationAction | null = null;
  private time = 0;
  private readonly squash = { k: 1, v: 0 };
  // ressorts additifs
  private readonly recoil = new Spring();
  private readonly whipF = new Spring();
  private readonly whipS = new Spring();
  // os (noms KayKit « assainis » par GLTFLoader : les points disparaissent, handslot.r → handslotr)
  private readonly bones: Record<'hips' | 'spine' | 'chest' | 'head' | 'armL' | 'armR' | 'foreR' | 'hand' | 'footL' | 'footR', THREE.Object3D | null>;
  private readonly chestFwd = new THREE.Vector3(0, 0, 1);
  private readonly headFwd = new THREE.Vector3(0, 0, 1);
  private readonly hipsRest = new THREE.Vector3();
  private ankleRest = 0;
  private packAdded = false;
  // tampons
  private readonly rootInvQ = new THREE.Quaternion();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly vc = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private readonly lastFeet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private groundSpeed = 0;
  private animRate = 1;
  private spineVar = 0;
  private lastSpineQ = new THREE.Quaternion();

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], baseScale: number, player: PlayerId, ctx: Ctx) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.baseScale = baseScale;
    this.player = player;
    this.ctx = ctx;
    for (const clip of clips) {
      if (clip.name === 'T-Pose') continue;
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    const get = (...names: string[]) => {
      for (const n of names) { const o = root.getObjectByName(n); if (o) return o; }
      return null;
    };
    this.bones = {
      hips: get('hips'), spine: get('spine'), chest: get('chest'), head: get('head'),
      armL: get('upperarml', 'upperarm.l'), armR: get('upperarmr', 'upperarm.r'), foreR: get('lowerarmr', 'lowerarm.r'),
      hand: get('handslotr', 'handslot.r'), footL: get('footl', 'foot.l'), footR: get('footr', 'foot.r'),
    };
    // Pose de repos : direction « devant » de la poitrine et de la tête dans leur propre repère.
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(this.qa).invert();
    const fwdLocal = (b: THREE.Object3D | null, out: THREE.Vector3) => {
      if (!b) return;
      b.getWorldQuaternion(this.qb).premultiply(this.qa).invert();
      out.copy(MZ).applyQuaternion(this.qb);
    };
    fwdLocal(this.bones.chest, this.chestFwd);
    fwdLocal(this.bones.head, this.headFwd);
    if (this.bones.hips) this.hipsRest.copy(this.bones.hips.position);
    if (this.bones.footL) {
      const w = this.bones.footL.getWorldPosition(this.va);
      this.ankleRest = root.worldToLocal(w).y;
    }
    this.addPackClips();
  }

  /** Ajoute les clips du pack (dès qu'ils sont chargés ; rappelé à chaque image tant qu'ils ne le sont pas). */
  private addPackClips(): void {
    if (this.packAdded) return;
    const pack = packData();
    if (!pack) return;
    this.packAdded = true;
    for (const [name, clip] of pack.clips) {
      if (this.actions.has(name)) continue;
      this.actions.set(name, this.mixer.clipAction(fitClipToRig(clip, pack.hipsRest, this.hipsRest)));
    }
  }

  has(name: string): boolean {
    this.addPackClips();
    return this.actions.has(name);
  }

  /** Premier clip disponible de la liste (pack puis clips du perso). */
  pick(...names: string[]): string {
    for (const n of names) if (this.has(n)) return n;
    return 'idle';
  }

  keys(name: string): KeyTimes | null {
    return packData()?.keys.get(name) ?? null;
  }

  duration(name: string): number {
    return this.actions.get(name)?.getClip().duration ?? 0;
  }

  get clip(): string | null {
    return this.currentName;
  }

  /** Temps courant du clip joué (s). */
  get clipTime(): number {
    return this.currentAction?.time ?? 0;
  }

  play(name: string, opts: PlayOptions = {}): void {
    const { loop = true, fade = ANIM.fondu.action, onFinished } = opts;
    this.addPackClips();
    const action = this.actions.get(name);
    if (!action) return;
    const same = action === this.currentAction;
    if (same && loop && !opts.restart && opts.holdAt === undefined) return;

    const prev = this.currentAction;
    const prevName = this.currentName;
    if (!same || opts.restart || opts.from !== undefined || opts.holdAt !== undefined) {
      action.reset();
      if (opts.from !== undefined) action.time = opts.from;
      if (opts.holdAt !== undefined) action.time = opts.holdAt;
    }
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.enabled = true;
    action.paused = opts.holdAt !== undefined;
    action.timeScale = opts.timeScale ?? (name === 'run' ? this.animRate : 1);
    action.setEffectiveWeight(1);
    action.play();

    if (prev && prev !== action) {
      prev.crossFadeTo(action, fade, false);
      animMetricsImpl.addEvent({ t: Date.now(), player: this.player, kind: 'transition', from: prevName ?? undefined, to: name, durationMs: Math.round(fade * 1000) });
    } else if (!prev) {
      action.fadeIn(fade);
    }
    this.currentAction = action;
    this.currentName = name;
    this.mark = opts.mark ?? null;
    this.markAction = opts.mark ? action : null;

    if (onFinished) {
      const handler = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return;
        this.mixer.removeEventListener('finished', handler);
        if (this.currentAction === action) onFinished();
      };
      this.mixer.addEventListener('finished', handler);
    }
  }

  /** Reprend un clip tenu (pose de charge) à la vitesse donnée, sans nouveau fondu. */
  resume(timeScale: number, mark?: PlayOptions['mark'], onFinished?: () => void): void {
    const action = this.currentAction;
    if (!action) return;
    action.paused = false;
    action.timeScale = timeScale;
    this.mark = mark ?? null;
    this.markAction = mark ? action : null;
    if (onFinished) {
      const handler = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return;
        this.mixer.removeEventListener('finished', handler);
        if (this.currentAction === action) onFinished();
      };
      this.mixer.addEventListener('finished', handler);
    }
  }

  /** Pose tenue en cours (clip figé) ? */
  get holding(): boolean {
    return !!this.currentAction?.paused;
  }

  bump(k: number): void {
    this.squash.k = k;
    this.squash.v = 0;
  }

  /** Réception : écrasement + événement de mesure. */
  land(k: number): void {
    this.bump(k);
    animMetricsImpl.addEvent({ t: Date.now(), player: this.player, kind: 'land' });
  }

  /** Recul d'un coup de feu (additif, ~60 ms aller). */
  kickRecoil(strength = 1): void {
    this.recoil.kick(-ANIM.tir.recul * 18 * strength);
  }

  /** Fouet du torse dans le sens du recul reçu (direction monde, angle en rad). */
  kickWhip(dirWorld: THREE.Vector3, angle: number): void {
    const inv = this.root.getWorldQuaternion(this.qa).invert();
    const d = this.va.copy(dirWorld).setY(0).applyQuaternion(inv);
    d.y = 0;
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    // vitesse initiale : le ressort atteint ~angle au premier aller
    this.whipF.kick(d.z * angle * 14);
    this.whipS.kick(d.x * angle * 14);
  }

  /** Position monde de la main droite (os handslotr), mise à jour de la pose comprise. */
  handWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.bones.hand;
    if (!h) return this.root.getWorldPosition(out).add(this.vc.set(0, 1, 0));
    return h.getWorldPosition(out);
  }

  // ---------------------------------------------------------------- couche procédurale

  /** Tourne l'os `b` autour d'un axe exprimé dans le repère du perso. */
  private rot(b: THREE.Object3D | null, axisModel: THREE.Vector3, angle: number): void {
    if (!b || !b.parent || Math.abs(angle) < 1e-5) return;
    b.parent.getWorldQuaternion(this.qa).premultiply(this.rootInvQ).invert();
    this.vb.copy(axisModel).applyQuaternion(this.qa);
    this.qb.setFromAxisAngle(this.vb, angle);
    b.quaternion.premultiply(this.qb);
  }

  /** Direction « devant » actuelle d'un os, dans le repère du perso. */
  private fwdOf(b: THREE.Object3D, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    b.getWorldQuaternion(this.qa).premultiply(this.rootInvQ);
    return out.copy(local).applyQuaternion(this.qa);
  }

  private applyProcedural(dt: number): void {
    const { spine, chest, head, armL, armR, foreR } = this.bones;
    const p = this.proc;
    this.root.getWorldQuaternion(this.rootInvQ).invert();
    const t = this.time;

    // Respiration : la poitrine se soulève doucement (jamais figé).
    const breath = Math.sin(t * Math.PI * 2 * ANIM.respiration.hz) * ANIM.respiration.amplitude;
    this.rot(chest, MX, -breath);

    // Charge : le torse s'enroule (épaule droite en arrière) et tremble de plus en plus.
    if (p.charge > 0) {
      const coil = ANIM.lancer.torsion * Math.min(1, p.charge * 1.2);
      this.rot(spine, MY, coil * 0.45);
      this.rot(chest, MY, coil * 0.55);
      const tr = ANIM.lancer.tremblement * p.charge;
      this.rot(chest, MX, Math.sin(t * 71) * tr);
      this.rot(chest, MZ, Math.sin(t * 53 + 1) * tr * 0.7);
      this.rot(armR, MX, Math.sin(t * 89 + 2) * tr * 1.5);
    }

    // Regard : torse et tête vers la cible, répartis colonne / poitrine / tête.
    if (p.lookAt && p.lookWeight > 0 && chest && head) {
      const headPos = head.getWorldPosition(this.vc);
      const dir = this.va.copy(p.lookAt).sub(headPos);
      if (dir.lengthSq() > 1e-4) {
        dir.normalize().applyQuaternion(this.rootInvQ);
        const f = this.fwdOf(chest, this.chestFwd, this.vb);
        let err = Math.atan2(dir.x, dir.z) - Math.atan2(f.x, f.z);
        err = Math.atan2(Math.sin(err), Math.cos(err));
        err = THREE.MathUtils.clamp(err, -ANIM.regard.max, ANIM.regard.max) * p.lookWeight;
        this.rot(spine, MY, err * ANIM.regard.colonne);
        this.rot(chest, MY, err * ANIM.regard.poitrine);
        this.rot(head, MY, err * ANIM.regard.tete);
        // tangage : poitrine et tête vers la hauteur de la cible
        const hf = this.fwdOf(head, this.headFwd, this.vb);
        const errP = (Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) - Math.asin(THREE.MathUtils.clamp(hf.y, -1, 1))) * p.lookWeight;
        const side = this.vc.set(dir.z, 0, -dir.x); // haut × direction horizontale
        if (side.lengthSq() > 1e-6) {
          side.normalize();
          const e = THREE.MathUtils.clamp(errP, -ANIM.regard.max * 0.6, ANIM.regard.max * 0.6);
          this.rot(chest, side, -e * 0.4);
          this.rot(head, side, -e * 0.6);
        }
      }
    }

    // Recul du tir : poitrine rejetée en arrière, bras qui remonte.
    this.recoil.step(dt, 900, 38);
    if (Math.abs(this.recoil.x) > 1e-4) {
      this.rot(chest, MX, this.recoil.x);
      this.rot(armR, MX, this.recoil.x * (ANIM.tir.reculBras / ANIM.tir.recul));
      this.rot(foreR, MX, this.recoil.x * 0.5);
    }

    // Fouet du coup reçu : le haut du corps part dans le sens du recul, puis revient.
    this.whipF.step(dt, 260, 14);
    this.whipS.step(dt, 260, 14);
    if (Math.abs(this.whipF.x) + Math.abs(this.whipS.x) > 1e-4) {
      // pencher vers +Z = rotation autour de +X ; vers +X = rotation autour de -Z
      this.rot(spine, MX, this.whipF.x * 0.4);
      this.rot(chest, MX, this.whipF.x * 0.6);
      this.rot(head, MX, this.whipF.x * 0.5);
      this.rot(spine, MZ, -this.whipS.x * 0.4);
      this.rot(chest, MZ, -this.whipS.x * 0.6);
    }

    // Au bord du vide : moulinet des deux bras et buste qui bascule vers le vide puis se rattrape.
    if (p.teeter) {
      const d = this.va.copy(p.teeter).applyQuaternion(this.rootInvQ).setY(0);
      if (d.lengthSq() > 1e-6) d.normalize(); else d.set(0, 0, -1);
      const axis = this.vc.set(d.z, 0, -d.x); // pencher vers d
      const w = Math.PI * 2 * ANIM.bord.moulinetHz * t;
      const sway = (0.55 + 0.45 * Math.sin(t * 5.3)) * ANIM.bord.penche;
      this.rot(spine, axis, sway * 0.5);
      this.rot(chest, axis, sway * 0.5);
      this.rot(head, axis, -sway * 0.6);
      // bras en cercles autour de l'axe des épaules (côté opposé déphasé)
      this.rot(armL, MX, -w * ANIM.bord.moulinet);
      this.rot(armR, MX, -(w + Math.PI) * ANIM.bord.moulinet);
      this.rot(armL, MZ, 0.6);
      this.rot(armR, MZ, -0.6);
    }

    // Accroché au bord : bras tendus au-dessus de la tête, corps qui se balance.
    if (p.hang) {
      const swing = Math.sin(t * 2.4) * ANIM.accroche.balancement;
      this.rot(spine, MX, swing);
      this.rot(armL, MX, -ANIM.accroche.bras);
      this.rot(armR, MX, -ANIM.accroche.bras);
      this.rot(head, MX, -0.35);
    }
  }

  // ---------------------------------------------------------------- image

  update(dt: number, wrapper: THREE.Object3D): void {
    this.time += dt;
    this.addPackClips();
    const container = wrapper.parent?.parent ?? wrapper;
    const pos = container.position;
    if (dt > 0) this.groundSpeed = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z) / dt;
    this.lastPos.copy(pos);
    if (this.groundSpeed > 0.1) {
      this.animRate = THREE.MathUtils.clamp(this.groundSpeed / 4, 0.8, 1.2);
      if (this.currentName === 'run' && this.currentAction) this.currentAction.timeScale = this.animRate;
    }

    this.mixer.update(dt);
    this.applyProcedural(dt);

    // Écrasement-étirement à volume constant (ressort).
    if (dt > 0) {
      const a = -STIFFNESS * (this.squash.k - 1) - DAMPING * this.squash.v;
      this.squash.v += a * dt;
      this.squash.k += this.squash.v * dt;
    }
    const k = this.squash.k;
    const side = this.baseScale / Math.sqrt(Math.max(0.25, k));
    wrapper.scale.set(side, this.baseScale * k, side);

    // Repère du clip (lâcher) : quand le temps du clip franchit la marque, la pose est déjà celle de l'image.
    if (this.mark && this.markAction && this.markAction === this.currentAction && this.markAction.time >= this.mark.at) {
      const m = this.mark;
      this.mark = null;
      this.markAction = null;
      container.updateMatrixWorld(true);
      const h = this.handWorld(this.va);
      m.fn([h.x, h.y, h.z]);
    }

    this.sample(container);
  }

  // ---------------------------------------------------------------- mesures (window.animMetrics)

  private sample(container: THREE.Object3D): void {
    const { chest, head, hand, footL, footR, spine } = this.bones;
    container.updateMatrixWorld(true);
    this.root.getWorldQuaternion(this.rootInvQ).invert();
    let facingErr = 0, lookErr = 0;
    if (this.proc.lookAt && chest && head) {
      const headPos = head.getWorldPosition(this.vc);
      const dir = this.va.copy(this.proc.lookAt).sub(headPos).normalize().applyQuaternion(this.rootInvQ);
      const f = this.fwdOf(chest, this.chestFwd, this.vb);
      facingErr = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(Math.atan2(dir.x, dir.z) - Math.atan2(f.x, f.z)), Math.cos(Math.atan2(dir.x, dir.z) - Math.atan2(f.x, f.z)))));
      const hf = this.fwdOf(head, this.headFwd, this.vb);
      lookErr = THREE.MathUtils.radToDeg(hf.angleTo(dir));
    }
    if (spine) {
      this.spineVar = spine.quaternion.angleTo(this.lastSpineQ);
      this.lastSpineQ.copy(spine.quaternion);
    }
    // Pieds : glissement horizontal du pied posé (le plus bas) et écart à la hauteur de repos de la cheville.
    const slide: [number, number] = [0, 0];
    const gap: [number, number] = [0, 0];
    const groundY = container.position.y;
    const scaleY = this.baseScale;
    if (footL && footR) {
      const fl = footL.getWorldPosition(this.va).clone();
      const fr = footR.getWorldPosition(this.vb).clone();
      const low = fl.y <= fr.y ? 0 : 1;
      const feet = [fl, fr];
      const grounded = !this.proc.hang && this.currentName !== 'airborne' && Math.abs(feet[low].y - groundY - this.ankleRest * scaleY) < 0.25;
      if (grounded) {
        const g = (feet[low].y - groundY - this.ankleRest * scaleY) * 100;
        gap[0] = g; gap[1] = g;
        const d = Math.hypot(feet[low].x - this.lastFeet[low].x, feet[low].z - this.lastFeet[low].z) * 100;
        slide[low] = this.groundSpeed < 0.05 ? d : 0;
      }
      this.lastFeet[0].copy(fl);
      this.lastFeet[1].copy(fr);
    }
    const hp = hand ? hand.getWorldPosition(this.vc) : this.vc.copy(container.position);
    animMetricsImpl.addSample({
      t: Date.now(),
      player: this.player,
      clip: this.currentName ?? '',
      weight: this.currentAction?.getEffectiveWeight() ?? 0,
      groundSpeed: this.groundSpeed,
      animRate: this.animRate,
      footSlideCm: slide,
      footGapCm: gap,
      facingErrDeg: facingErr,
      lookErrDeg: lookErr,
      handPos: [hp.x, hp.y, hp.z],
      spineRotVar: this.spineVar,
      layers: { footIK: false, lookAt: !!this.proc.lookAt && this.proc.lookWeight > 0, lean: Math.abs(this.whipF.x) + Math.abs(this.recoil.x), squash: this.squash.k },
    });
  }
}
