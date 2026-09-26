// Les plans du trailer. Les plans de combat jouent le VRAI gameplay (startMatch, aim, fire, parry via les
// hooks) avec les 8 armes-objets pré-générées ; la caméra est posée par-dessus, jamais de zoom.
import * as THREE from 'three';
import type { MapId, PlayerId, Vec3 } from '../core/types';
import { ensurePlayerBody, raycastDown } from '../gameplay/character';
import { aimOrigin } from '../gameplay/projectiles';
import { predictTrajectory } from '../gameplay/trajectory';
import { CAMERA_SWING_MS, MIN_REMAINING_FLIGHT_MS, TRAIT_TUNING } from '../gameplay/tuning';
import { makeSticker } from '../scene/sticker';
import { clamp01, ease, handheld, impactShake, orbit, v3, type Pose } from './cam';
import type { Env } from './director';
import { keyedSync } from './overlay';
import { BEAT } from './timeline.js';

export interface Shot {
  /** Secondes simulées hors caméra avant la première image capturée. */
  preroll?: number;
  /** Attente en temps RÉEL après le setup (chargement des modèles/maps). */
  settleMs?: number;
  /** false : plan 100 % couche 2D, la 3D n'est pas rendue. */
  showGame?: boolean;
  /** Garde la désaturation de la fenêtre de parade (lot LK2) ; sinon l'image reste en couleurs. */
  parryLook?: boolean;
  setup?(env: Env): void | Promise<void>;
  at?: [number, (env: Env) => void][];
  every?(env: Env, t: number): void;
  camera?(env: Env, t: number, dur: number): Pose | null;
  overlay?(env: Env, t: number, dur: number): void;
  cleanup?(env: Env): void;
}

// ---------------------------------------------------------------------------------------------------------
// Outils de mise en scène
// ---------------------------------------------------------------------------------------------------------

interface Frame { a: THREE.Vector3; d: THREE.Vector3; mid: THREE.Vector3; axis: THREE.Vector3; side: THREE.Vector3; len: number }

/** Repère du duel : axe attaquant → défenseur, côté « public » (règle des 180° : +Z d'abord). */
function duelFrame(a: THREE.Vector3, d: THREE.Vector3): Frame {
  const axis = d.clone().sub(a); axis.y = 0;
  const len = Math.max(0.1, axis.length());
  axis.normalize();
  let side = v3(-axis.z, 0, axis.x);
  if (side.z < -1e-3 || (Math.abs(side.z) <= 1e-3 && side.x < 0)) side = side.negate();
  return { a: a.clone(), d: d.clone(), mid: a.clone().lerp(d, 0.5), axis, side, len };
}

function groundY(env: Env, x: number, z: number): number | null {
  const dist = raycastDown(env.ctx, [x, 30, z], 60);
  return dist == null ? null : 30 - dist;
}

function teleport(env: Env, i: PlayerId, x: number, z: number): void {
  const y = groundY(env, x, z);
  if (y == null) return; // pas de sol ici : on garde la position d'apparition
  env.ctx.state.players[i].pos = [x, y, z];
  ensurePlayerBody(env.ctx, i);
}

/** Rapproche les combattants à `dist` m l'un de l'autre, sur du sol (sinon le tir sort de portée). */
function closeIn(env: Env, dist: number): void {
  const a = env.p(0);
  const d = env.p(1);
  const axis = d.clone().sub(a); axis.y = 0;
  if (axis.length() <= dist + 0.3) return;
  axis.normalize();
  const tries = [dist, dist - 1, dist + 1, dist - 2, dist + 2];
  for (const D of tries) { // l'attaquant vient vers le défenseur…
    const x = d.clone().addScaledVector(axis, -D);
    const y = groundY(env, x.x, x.z);
    if (y != null && Math.abs(y - d.y) < 1) { teleport(env, 0, x.x, x.z); return; }
  }
  for (const D of tries) { // …ou le défenseur vient vers l'attaquant
    const x = a.clone().addScaledVector(axis, D);
    const y = groundY(env, x.x, x.z);
    if (y != null && Math.abs(y - a.y) < 1) { teleport(env, 1, x.x, x.z); return; }
  }
}

interface Aim { yaw: number; pitch: number; power: number; travel: number }

/** Délai tir → impact tel que le jeu le programme (projectiles.ts : vol minimum pour laisser parer). */
function screenFlight(travel: number, trait: string): number {
  const raw = trait === 'heavy' ? travel / TRAIT_TUNING.heavy.speedMult : travel;
  const total = Math.max(raw * 1000, CAMERA_SWING_MS + MIN_REMAINING_FLIGHT_MS) / 1000;
  return total + (trait === 'sticky' ? TRAIT_TUNING.sticky.fuseMs / 1000 : 0);
}

/** Cherche un tir qui touche vraiment (même simulation que le jeu : predictTrajectory). */
function solveAim(env: Env, shooter: PlayerId, arc: boolean): Aim {
  const ctx = env.ctx;
  const st = ctx.state.players[shooter];
  const weapon = st.weapons[st.selected];
  const target = shooter === 0 ? 1 : 0;
  const origin = aimOrigin(ctx, shooter);
  const tp = ctx.state.players[target].pos;
  const yaw = Math.atan2(tp[0] - origin[0], tp[2] - origin[2]);
  const pitches = arc ? [42, 36, 48, 30, 54, 24, 60, 18, 12] : [0, 2, 4, -2, 6, 9, 12, 16, 20, 26, 32, 40];
  const powers = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
  let fallback: Aim | null = null;
  let bestDist = Infinity;
  for (const pd of pitches) {
    for (const pw of powers) {
      const p = THREE.MathUtils.degToRad(pd);
      const dir: Vec3 = [Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)];
      const r = predictTrajectory(ctx, shooter, weapon, origin, dir, pw);
      const aim = { yaw: THREE.MathUtils.radToDeg(yaw), pitch: pd, power: pw, travel: r.travelMs / 1000 };
      if (r.hitPlayer === target) return aim;
      const dd = Math.hypot(r.impact[0] - tp[0], r.impact[2] - tp[2]);
      if (dd < bestDist) { bestDist = dd; fallback = aim; }
    }
  }
  return fallback ?? { yaw: THREE.MathUtils.radToDeg(yaw), pitch: 4, power: 1, travel: 0.6 };
}

type CamFn = (env: Env, t: number, dur: number, f: Frame, s: DuelState) => Pose;

interface DuelState { tFire: number | null; tHit: number | null; travel: number; hitStrength: number }

function duelState(env: Env): DuelState {
  return env.scratch.duel as DuelState;
}

/** Point regardé pendant l'échange : l'attaquant, puis le projectile (estimé), puis le défenseur (live). */
function exchangeLook(env: Env, t: number, f: Frame, s: DuelState): THREE.Vector3 {
  const head = (v: THREE.Vector3) => v.clone().add(v3(0, 1.1, 0));
  const dLive = env.p(1);
  if (s.tFire == null || t < s.tFire) return head(f.a).lerp(head(f.d), 0.25);
  const k = clamp01((t - s.tFire) / Math.max(0.2, s.travel));
  return head(f.a).lerp(head(dLive), 0.25 + 0.75 * ease.inOutCubic(k));
}

function withShake(pose: Pose, _env: Env, t: number, s: DuelState, strength = 0.18): Pose {
  if (s.tHit != null) pose.pos.add(impactShake(t - s.tHit, strength * s.hitStrength));
  pose.pos.add(handheld(t, 0.025, 3));
  return pose;
}

/** Travelling latéral le long de l'axe du duel (caméra « public »). */
const sideTrack = (o: { dist?: number; h?: number; from?: number; to?: number; roll?: number } = {}): CamFn => (env, t, dur, f, s) => {
  const k = ease.inOutCubic(clamp01(t / dur));
  const along = (o.from ?? -0.25) + ((o.to ?? 0.3) - (o.from ?? -0.25)) * k;
  const pos = f.mid.clone().addScaledVector(f.side, o.dist ?? Math.max(7, f.len * 0.75)).addScaledVector(f.axis, along * f.len);
  pos.y += o.h ?? 2.1;
  return withShake({ pos, look: exchangeLook(env, t, f, s), roll: o.roll }, env, t, s);
};

/** Orbite autour du défenseur (live) ou du milieu. */
const orbitOn = (o: { on?: 'd' | 'a' | 'mid'; r?: number; h?: number; a0?: number; a1?: number; follow?: boolean } = {}): CamFn => (env, t, dur, f, s) => {
  const base = o.on === 'a' ? f.a : o.on === 'mid' ? f.mid : (o.follow ? env.p(1) : f.d);
  const center = base.clone().add(v3(0, 1.0, 0));
  const sideAngle = THREE.MathUtils.radToDeg(Math.atan2(f.side.x, f.side.z));
  const pose = orbit(center, Math.max(5.5, o.r ?? 6.5), Math.max(1.4, o.h ?? 1.8), sideAngle + (o.a0 ?? -40), sideAngle + (o.a1 ?? 40), ease.outCubic(clamp01(t / dur)));
  return withShake(pose, env, t, s);
};

/** Grue : monte en regardant le milieu du duel. */
const crane = (o: { y0?: number; y1?: number; dist?: number; along?: number } = {}): CamFn => (env, t, dur, f, s) => {
  const k = ease.inOutCubic(clamp01(t / dur));
  const pos = f.mid.clone().addScaledVector(f.side, o.dist ?? 8).addScaledVector(f.axis, (o.along ?? 0) * f.len);
  pos.y += (o.y0 ?? 0.5) + ((o.y1 ?? 6) - (o.y0 ?? 0.5)) * k;
  return withShake({ pos, look: exchangeLook(env, t, f, s) }, env, t, s);
};

/** Par-dessus l'épaule de l'attaquant, la caméra avance physiquement (pas de zoom). */
const shoulderPush = (o: { back?: number; side?: number; h?: number; push?: number } = {}): CamFn => (env, t, dur, f, s) => {
  const k = ease.outCubic(clamp01(t / dur));
  const pos = f.a.clone().addScaledVector(f.axis, -(o.back ?? 3.4) + (o.push ?? 1.6) * k).addScaledVector(f.side, o.side ?? 1.2);
  pos.y += o.h ?? 2.0;
  return withShake({ pos, look: exchangeLook(env, t, f, s) }, env, t, s, 0.12);
};

/** Contre-plongée près du défenseur, caméra penchée (roulis). */
const lowDutch = (o: { roll?: number; dist?: number; slide?: number } = {}): CamFn => (env, t, dur, f, s) => {
  const k = ease.outCubic(clamp01(t / dur));
  const pos = f.d.clone().addScaledVector(f.axis, -(o.dist ?? 4.2)).addScaledVector(f.side, 3.0 + (o.slide ?? 1.2) * k);
  pos.y += 1.0;
  const look = env.p(1).add(v3(0, 1.2, 0));
  return withShake({ pos, look, roll: (o.roll ?? 9) * (1 - 0.3 * k) }, env, t, s, 0.22);
};

/** Panoramique fouetté : regard sur l'attaquant, bascule en 0,15 s vers le défenseur au tir. */
const whip = (o: { dist?: number } = {}): CamFn => (env, t, _dur, f, s) => {
  const pos = f.mid.clone().addScaledVector(f.side, o.dist ?? 5.5);
  pos.y += 1.7;
  const tw = s.tFire ?? 1e9;
  const k = ease.inOutCubic(clamp01((t - tw) / 0.15));
  const look = f.a.clone().add(v3(0, 1.2, 0)).lerp(env.p(1).add(v3(0, 1.1, 0)), k);
  return withShake({ pos, look, roll: Math.sin(k * Math.PI) * 5 }, env, t, s);
};

/** KO : plan d'épaule jusqu'à l'impact, puis orbite lente qui suit l'éjecté. */
const koFollow: CamFn = (env, t, dur, f, s) => {
  if (s.tHit == null || t < s.tHit) return shoulderPush({ back: 3.8, push: 1.0 })(env, t, dur, f, s);
  const u = t - s.tHit;
  const center = env.p(1).add(v3(0, 1, 0));
  const sideAngle = THREE.MathUtils.radToDeg(Math.atan2(f.side.x, f.side.z));
  const pose = orbit(center, 6.5, 1.2 - Math.min(2.5, u * 0.8), sideAngle - 60, sideAngle + 110, ease.outCubic(clamp01(u / 3.2)));
  return withShake(pose, env, t, s, 0.3);
};

// ---------------------------------------------------------------------------------------------------------
// Plan de combat générique (vrai gameplay)
// ---------------------------------------------------------------------------------------------------------

interface AttackSpec {
  map: MapId;
  fighters?: [string, string];
  weapon: string;
  defWeapon?: string;
  /** PV du défenseur avant le coup (bas = grosse éjection, ≤ 5 = K.O.). */
  hp?: number;
  /** Distance visée entre les combattants (m). */
  dist?: number;
  /** Instant (temps local) où l'impact doit tomber. */
  impactAt: number;
  arc?: boolean;
  parry?: boolean;
  cam: CamFn;
  freeze?: number;
  slowAfter?: number;
  seed?: number;
  preroll?: number;
  overlay?: (env: Env, t: number, dur: number, s: DuelState) => void;
}

function attack(spec: AttackSpec): Shot {
  const PREROLL = spec.preroll ?? 3.4;
  const SETUP_T = -PREROLL + 1.15; // après le bandeau de tour (1 s) : phase « move »
  return {
    preroll: PREROLL,
    settleMs: 700,
    parryLook: spec.parry,
    setup(env) {
      const ctx = env.ctx;
      const [fa, fd] = spec.fighters ?? ['knight', 'rogue_hooded'];
      const w = env.weapon(spec.weapon);
      const dw = env.weapon(spec.defWeapon ?? 'frying-pan');
      ctx.hooks.startMatch({ map: spec.map, seed: spec.seed ?? 4242, fighters: [env.fighter(fa), env.fighter(fd)], weapons: [[w], [dw]], vsAI: false, stocks: 1 });
      env.scratch.duel = { tFire: null, tHit: null, travel: 0.6, hitStrength: 1 } satisfies DuelState;
    },
    at: [
      [SETUP_T, (env) => {
        const ctx = env.ctx;
        closeIn(env, spec.dist ?? 7);
        if (spec.hp != null) ctx.state.players[1].hp = spec.hp;
        ctx.hooks.pickWeapon(0);
        const aim = solveAim(env, 0, spec.arc ?? env.ctx.state.players[0].weapons[0].category === 'grenade');
        ctx.hooks.aim(aim.yaw, aim.pitch);
        const s = duelState(env);
        s.travel = screenFlight(aim.travel, ctx.state.players[0].weapons[0].trait);
        env.scratch.aim = aim;
        env.scratch.fireAt = Math.max(SETUP_T + 0.1, spec.impactAt - s.travel);
        (window as unknown as { trailerDebug?: unknown }).trailerDebug = { aim, p0: env.p(0).toArray(), p1: env.p(1).toArray() };
        env.scratch.frame = duelFrame(env.p(0), env.p(1));
      }],
    ],
    every(env, t) {
      const ctx = env.ctx;
      const s = duelState(env);
      const aim = env.scratch.aim as Aim | undefined;
      if (aim && s.tFire == null && t >= (env.scratch.fireAt as number)) {
        s.tFire = t;
        ctx.hooks.fire(aim.power);
      }
      if (spec.parry && s.tFire != null && !env.scratch.parried && t >= s.tFire + s.travel - 0.06) {
        env.scratch.parried = true;
        ctx.hooks.parry(0);
      }
      const hit = env.first('hit');
      if (hit && s.tHit == null) {
        s.tHit = hit.t;
        s.hitStrength = (hit.data as { crit?: boolean }).crit ? 1.5 : 1;
        if (spec.freeze) ctx.loop.setSlow('trailer', 0.02);
      }
      if (spec.freeze && s.tHit != null && t >= s.tHit + spec.freeze) {
        if (spec.slowAfter) ctx.loop.setSlow('trailer', spec.slowAfter); else ctx.loop.clearSlow('trailer');
      }
    },
    camera(env, t, dur) {
      const f = env.scratch.frame as Frame | undefined;
      if (!f) return null;
      return spec.cam(env, t, dur, f, duelState(env));
    },
    overlay(env, t, dur) { spec.overlay?.(env, t, dur, duelState(env)); },
    cleanup(env) { env.ctx.loop.clearSlow('trailer'); },
  };
}

const black: Shot = { showGame: false, overlay(env) { env.o.black(1); } };

// ---------------------------------------------------------------------------------------------------------
// Plans spéciaux
// ---------------------------------------------------------------------------------------------------------

let stickerMesh: THREE.Object3D | null = null;

const stickerShot: Shot = {
  preroll: 1.2,
  settleMs: 900,
  async setup(env) {
    const ctx = env.ctx;
    ctx.hooks.startMatch({ map: 'archipel', seed: 7, fighters: [env.fighter('knight'), env.fighter('rogue_hooded')], vsAI: false });
    const w = env.weapon('rubber-duck');
    stickerMesh = await makeSticker(w.stickerUrl!, { height: 2.6 });
    stickerMesh.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | THREE.MeshBasicMaterial[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        if (m.color) m.color.multiplyScalar(0.6); // sous le seuil du bloom (sinon le jaune vire au blanc)
        const e = (m as unknown as THREE.MeshStandardMaterial).emissive;
        if (e) e.setScalar(0);
      }
    });
    const mid = env.p(0).lerp(env.p(1), 0.5);
    stickerMesh.position.set(mid.x, mid.y + 3.2, mid.z);
    ctx.three.scene.add(stickerMesh);
    env.scratch.center = mid.add(v3(0, 3.2, 0));
  },
  camera(env, t, dur) {
    const c = env.scratch.center as THREE.Vector3;
    if (stickerMesh) {
      stickerMesh.rotation.y = -0.5 + t * 0.9;
      stickerMesh.position.y = c.y + Math.sin(t * 2.4) * 0.12;
    }
    return orbit(c, 5.2, 0.4, -70, 50, ease.outCubic(clamp01(t / dur)));
  },
  overlay(env, t) { env.o.slam('Snap *anything.*', t - 0.25, { y: 0.62, tilt: -3 }); },
  cleanup(env) { if (stickerMesh) env.ctx.three.scene.remove(stickerMesh); stickerMesh = null; },
};

const snapShot: Shot = {
  showGame: false,
  overlay(env, t, dur) {
    const w = env.weapon('rubber-duck');
    const flashAt = Math.max(0.6, dur - 0.5);
    env.o.viewfinder(keyedSync(w.stickerUrl!), 'RUBBER DUCK · GRENADE', t, flashAt);
    const since = t - flashAt;
    if (since >= 0) env.o.flash(since < 0.05 ? 1 : 1 - ease.outCubic(clamp01((since - 0.05) / 0.3)));
  },
};

const cardShot: Shot = {
  preroll: 1.2,
  settleMs: 600,
  setup(env) {
    env.ctx.hooks.startMatch({ map: 'archipel', seed: 8, fighters: [env.fighter('knight'), env.fighter('rogue_hooded')], vsAI: false });
  },
  camera(env, t, dur) {
    const f = duelFrame(env.p(0), env.p(1));
    const k = ease.linear(clamp01(t / dur));
    const pos = f.mid.clone().addScaledVector(f.side, 9).addScaledVector(f.axis, (-0.3 + 0.5 * k) * f.len);
    pos.y += 3.5;
    return { pos, look: f.mid.clone().add(v3(0, 0.8, 0)) };
  },
  overlay(env, t) {
    env.o.black(0.45);
    env.o.card(env.weapon('rubber-duck'), t);
  },
};

const fighterShot: Shot = {
  preroll: 1.4,
  settleMs: 1200,
  setup(env) {
    env.ctx.hooks.startMatch({ map: 'archipel', seed: 9, fighters: [env.fighter('barbarian'), env.fighter('mage')], vsAI: false });
  },
  at: [[0.9, (env) => env.ctx.hooks.animPlay?.(0, 'throw')]],
  camera(env, t, dur) {
    const me = env.p(0);
    const f = duelFrame(me, env.p(1));
    const k = ease.inOutCubic(clamp01(t / dur));
    const a = THREE.MathUtils.radToDeg(Math.atan2(f.axis.x, f.axis.z));
    const pose = orbit(me.clone().add(v3(0, 1.25 + 0.3 * k, 0)), 3.4, -0.7 + 1.6 * k, a - 35 + 25 * k, a - 20 + 25 * k, 1);
    pose.pos.add(handheld(t, 0.02, 5));
    return pose;
  },
  overlay(env, t) {
    const o = env.o;
    if (t < 1.35) {
      o.wave(t, Math.min(1, t * 3) * (0.55 + 0.45 * Math.abs(Math.sin(t * 5))));
      o.slam('Your *voice.*', t - 0.1, { y: -0.62, tilt: 2, size: 120 });
    } else {
      o.slam('Your *fighter.*', t - 1.35, { y: -0.62, tilt: -3, size: 120 });
    }
  },
};

const titleLock: Shot = {
  showGame: false,
  overlay(env, t) { env.o.paper(1); env.o.logo(t, -1, -1); },
};

const titleShot: Shot = {
  showGame: false,
  overlay(env, t) {
    const o = env.o;
    o.paper(1);
    const imgs = ['banana', 'rubber-duck', 'frying-pan', 'garden-gnome', 'smartphone', 'baguette', 'stapler', 'office-chair']
      .map((k) => keyedSync(env.weapon(k).stickerUrl!));
    o.stickers(imgs, t, BEAT);
    o.logo(t - 0.15, t - BEAT * 3, t - BEAT * 5);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Catalogue : l'identifiant de plan de timeline.js → définition
// ---------------------------------------------------------------------------------------------------------

const K2 = ['knight', 'rogue_hooded'] as [string, string];
const BM = ['barbarian', 'mage'] as [string, string];

export const SHOTS: Record<string, Shot> = {
  hook: attack({ map: 'archipel', weapon: 'banana', hp: 35, dist: 7, impactAt: 0.62, cam: sideTrack({ from: 0.05, to: 0.5, h: 1.5, dist: -5.4 }), seed: 11 }),
  black,
  silence: black,
  'black-end': black,
  snap: snapShot,
  sticker: stickerShot,
  card: cardShot,
  throw: attack({
    map: 'archipel', weapon: 'rubber-duck', hp: 60, dist: 7.5, impactAt: 1.15, arc: true, cam: whip(), seed: 12,
    overlay: (env, t, _d, s) => { env.o.slam('Fight *with it.*', t - (s.tHit ?? 1.15) + 0.05, { y: 0.6, tilt: 3 }); env.o.speedLines(s.tFire != null ? clamp01(1 - (t - s.tFire) / 0.5) * 0.5 : 0, t); },
  }),
  fighter: fighterShot,
  'title-lock': titleLock,
  // Montage (4 temps) : une arme différente par plan.
  m1: attack({ map: 'archipel', weapon: 'baguette', fighters: K2, hp: 100, dist: 7, impactAt: 0.9, cam: sideTrack({ from: -0.4, to: 0.1, dist: 8, h: 1.2 }), seed: 21 }),
  m2: attack({ map: 'cuisine', weapon: 'smartphone', fighters: BM, hp: 100, impactAt: 1.1, arc: true, cam: crane({ y0: 3, y1: 8, dist: 12 }), seed: 22 }),
  m3: attack({
    map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 80, dist: 6, impactAt: 0.95, parry: true, cam: lowDutch({ roll: -8 }), seed: 23,
    overlay: (env, t, _d, s) => { if (s.tFire != null) env.o.slam('Perfect *parry!*', t - (s.tFire + s.travel), { y: -0.6, size: 120, tilt: -4 }); },
  }),
  m4: attack({ map: 'archipel', weapon: 'stapler', fighters: K2, hp: 100, dist: 7.5, impactAt: 0.85, cam: shoulderPush(), seed: 24 }),
  m5: attack({ map: 'galion', weapon: 'rubber-duck', fighters: BM, hp: 100, impactAt: 1.2, arc: true, cam: orbitOn({ on: 'mid', r: 10, h: 3, a0: -30, a1: 25 }), seed: 25 }),
  m6: attack({ map: 'archipel', weapon: 'banana', fighters: K2, hp: 100, dist: 6, impactAt: 0.8, cam: whip({ dist: 6 }), seed: 26 }),
  m7: attack({ map: 'archipel', weapon: 'frying-pan', fighters: BM, hp: 100, impactAt: 0.9, cam: orbitOn({ on: 'a', r: 5, h: 1.2, a0: 20, a1: -40 }), seed: 27 }),
  m8: attack({ map: 'galion', weapon: 'garden-gnome', fighters: K2, hp: 100, dist: 6, impactAt: 0.85, cam: crane({ y0: 2.5, y1: 7, dist: 10 }), seed: 28 }),
  // Escalade (2 temps) : impact tôt dans le plan, caméra différente à chaque coupe.
  e1: attack({ map: 'archipel', weapon: 'baguette', fighters: BM, hp: 100, dist: 6, impactAt: 0.35, cam: lowDutch({ roll: 10 }), seed: 31 }),
  e2: attack({ map: 'archipel', weapon: 'smartphone', fighters: K2, hp: 45, impactAt: 0.4, arc: true, cam: orbitOn({ r: 6, a0: 40, a1: 80 }), seed: 32 }),
  e3: attack({ map: 'archipel', weapon: 'banana', fighters: K2, hp: 100, dist: 6, impactAt: 0.35, cam: shoulderPush({ back: 2.6 }), seed: 33 }),
  e4: attack({ map: 'archipel', weapon: 'stapler', fighters: BM, hp: 100, dist: 6, impactAt: 0.35, cam: sideTrack({ dist: 6, h: 0.9 }), seed: 34 }),
  e5: attack({ map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 45, dist: 6, impactAt: 0.3, cam: crane({ y0: 3, y1: 7, dist: 6 }), seed: 35 }),
  e6: attack({ map: 'archipel', weapon: 'rubber-duck', fighters: BM, hp: 100, impactAt: 0.35, arc: true, cam: lowDutch({ roll: -11 }), seed: 36 }),
  e7: attack({ map: 'archipel', weapon: 'baguette', fighters: K2, hp: 100, dist: 6, impactAt: 0.3, cam: whip({ dist: 4.5 }), seed: 37 }),
  e8: attack({ map: 'archipel', weapon: 'smartphone', fighters: BM, hp: 45, impactAt: 0.35, arc: true, cam: orbitOn({ r: 5, a0: -60, a1: -20 }), seed: 38 }),
  e9: attack({ map: 'archipel', weapon: 'stapler', fighters: K2, hp: 100, dist: 6, impactAt: 0.3, cam: sideTrack({ dist: 5.5, h: 3.2, from: 0.2, to: 0.4 }), seed: 39 }),
  e10: attack({ map: 'archipel', weapon: 'banana', fighters: BM, hp: 45, dist: 5, impactAt: 0.3, cam: lowDutch({ roll: 12 }), seed: 40 }),
  e11: attack({ map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 100, dist: 6, impactAt: 0.3, cam: shoulderPush({ back: 2.4, side: -1.2 }), seed: 41 }),
  e12: attack({ map: 'archipel', weapon: 'baguette', fighters: BM, hp: 45, dist: 6, impactAt: 0.3, cam: orbitOn({ r: 4.5, a0: 60, a1: 100 }), seed: 42 }),
  // Frappes (1 temps) : l'impact tombe presque sur la coupe.
  f1: attack({ map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 45, dist: 5, impactAt: 0.12, cam: lowDutch({ roll: 14, dist: 2.6 }), seed: 51 }),
  f2: attack({ map: 'archipel', weapon: 'banana', fighters: BM, hp: 100, dist: 5, impactAt: 0.12, cam: orbitOn({ r: 4, a0: -90, a1: -70 }), seed: 52 }),
  f3: attack({ map: 'archipel', weapon: 'stapler', fighters: K2, hp: 45, dist: 5, impactAt: 0.12, cam: lowDutch({ roll: -14, dist: 2.6 }), seed: 53 }),
  f4: attack({ map: 'archipel', weapon: 'baguette', fighters: BM, hp: 100, dist: 5, impactAt: 0.12, cam: orbitOn({ r: 4, a0: 70, a1: 90 }), seed: 54 }),
  climax: attack({
    map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 3, dist: 7, impactAt: 0.75, freeze: 0.5, slowAfter: 0.35, cam: koFollow, seed: 61,
    overlay: (env, t, _d, s) => { if (s.tHit != null) env.o.callout('GNOME WRECKER', 'THROWABLE · HEAVY · REAL GARDEN GNOME', t - s.tHit); },
  }),
  ko: attack({
    map: 'archipel', weapon: 'garden-gnome', fighters: K2, hp: 3, dist: 7, impactAt: -1.6, seed: 61, preroll: 6.5,
    cam: (_env, t, dur, f) => {
      const c = f.a.clone().add(v3(0, 1.1, 0));
      const sideAngle = THREE.MathUtils.radToDeg(Math.atan2(f.side.x, f.side.z));
      const pose = orbit(c, 4.2, -0.5, sideAngle - 20, sideAngle + 35, ease.outCubic(clamp01(t / dur)));
      pose.pos.add(handheld(t, 0.02, 7));
      return pose;
    },
    overlay: (env, t) => { env.o.slam('K.O.!', t, { size: 280, tilt: -5 }); },
  }),
  title: titleShot,
};
