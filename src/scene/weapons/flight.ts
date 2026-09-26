// L'objet en vol : la grenade suit sa cloche et clignote comme une mèche ; le throwable file en tournant avec
// une traînée ; le blaster crache des traçantes. Le code arbitre, la scène suit :
//  - temps réel (pivot 15h25) : l'objet part de `projectile:spawn { from, vel }` et vole en physique simple
//    (gravité de la grenade = GRENADE_ARC_GRAVITY), rayons Rapier pour le contact ;
//  - tour par tour (ancien) : trajectoire rejouée avec predictTrajectory (lecture seule) et arrivée calée sur
//    l'échéance réelle de `projectile:incoming` ;
//  - au contact d'un joueur, l'objet attend le verdict du gameplay (`hit`, `parry:result`) avant d'exploser,
//    d'être renvoyé (parade parfaite) ou chassé.
// Anneau de parade : se referme autour de l'objet entrant pendant `etaMs`, dans la vue du joueur visé seulement.
import * as THREE from 'three';
import { palette, rendu } from '../../art/tokens.js';
import type { Ctx, PlayerId, Vec3, Weapon } from '../../core/types';
import { getRuntime } from '../../gameplay/runtime';
import { lerp, predictTrajectory } from '../../gameplay/trajectory';
import { GRENADE_ARC_GRAVITY, GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, REFLECT_RETURN_MS, SHOT_ORIGIN_HEIGHT, TRAIT_TUNING } from '../../gameplay/tuning';
import { excludeFromOcclusion } from '../registry';
import type { BlastFx } from './blast';
import { WEAPON_FX } from './tokens';
import { Trail } from './trail';
import { WeaponModel } from './visual';

type Kind = 'grenade' | 'throwable' | 'bolt';
type State = 'hand' | 'flying' | 'contact' | 'stuck' | 'deflect' | 'debris' | 'done';

interface Flight {
  id: string;
  weapon: Weapon;
  kind: Kind;
  phys: boolean;
  shooter: PlayerId;
  target: PlayerId;
  from: THREE.Vector3;
  impact: THREE.Vector3;
  path: THREE.Vector3[] | null;
  ground: number;
  radius: number;
  axis: THREE.Vector3;
  distance: number;
  spawnAt: number;
  plannedMs: number;
  releaseAt: number;
  handOffset: THREE.Vector3;
  elapsedMs: number;
  age: number;
  p: number;
  synced: boolean;
  syncT0: number;
  syncP0: number;
  tImpact: number;
  state: State;
  main: boolean;
  fragment: boolean;
  split: boolean;
  returning: boolean;
  model: WeaponModel | null;
  bolt: THREE.Group | null;
  trail: Trail | null;
  shadow: THREE.Mesh | null;
  ring: THREE.Sprite | null;
  ringT0: number;
  ringT1: number;
  size: number;
  spin: number;
  spinDir: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  until: number;
  squash: number;
  squashCount?: number;
}

export interface FlightDeps {
  blast: BlastFx;
  /** Position monde de l'objet en main (ou du bout du canon), null si pas de main. */
  handPos(player: PlayerId, muzzle: boolean): THREE.Vector3 | null;
  /** L'objet quitte la main (grenade, throwable). */
  released(player: PlayerId): void;
  /** Un tir part du blaster en main : recul, éclair, douille. */
  shot(player: PlayerId, weapon: Weapon): void;
  /** Point d'arrivée : le bouclier touché réagit (étincelles, vacillement). */
  arrived(pos: THREE.Vector3, weapon: Weapon, shooter: PlayerId): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _qz = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const TURN_PHASES = new Set(['turn-intro', 'move', 'aim', 'resolve', 'snap-time']);
const CONTACT_WAIT_MS = 180; // attente max du verdict (hit / parade) quand l'objet touche un joueur

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function other(p: PlayerId): PlayerId { return p === 0 ? 1 : 0; }

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineWidth = 14; g.strokeStyle = rendu.contour.encre;
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 7; g.strokeStyle = '#ffffff';
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function installFlights(ctx: Ctx, deps: FlightDeps) {
  const { scene, camera } = ctx.three;
  const { blast } = deps;
  const root = new THREE.Group();
  root.name = 'latk-vol';
  scene.add(root);
  excludeFromOcclusion(root);

  const flights: Flight[] = [];
  type FireInfo = { power: number; at: number; count: number; weaponId: string };
  const lastFire: [FireInfo | null, FireInfo | null] = [null, null];
  let pendingReflect: { flight: Flight; at: number } | null = null;

  // Tache d'encre sous l'objet (rendu.ombres.tache) : se lit comme la hauteur de la cloche.
  const shadowGeo = new THREE.CircleGeometry(0.5, 20);
  const shadowMat = new THREE.MeshBasicMaterial({ color: rendu.contour.encre, transparent: true, opacity: rendu.ombres.tache, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  // Traçante du blaster : corps étiré (vue de côté) + halo rond (vue de face). Matériaux partagés par couleur.
  const boltGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  boltGeo.rotateX(Math.PI / 2); // axe long sur Z
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const boltMats = new Map<string, [THREE.Material, THREE.Material, THREE.SpriteMaterial]>();
  const coreMat = new THREE.MeshBasicMaterial({ color: palette.lumiere, toneMapped: false });
  function boltMaterials(color: string) {
    let m = boltMats.get(color);
    if (!m) {
      m = [
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
        coreMat,
        new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      ];
      boltMats.set(color, m);
    }
    return m;
  }
  const boltPool: THREE.Group[] = [];
  function makeBolt(color: string): THREE.Group {
    const [bodyMat, core, haloMat] = boltMaterials(color);
    let g = boltPool.pop();
    if (!g) {
      g = new THREE.Group();
      const body = new THREE.Mesh(boltGeo, bodyMat);
      body.scale.set(WEAPON_FX.tir.epaisseur * 1.8, WEAPON_FX.tir.epaisseur * 1.8, WEAPON_FX.tir.longueur);
      const c = new THREE.Mesh(boltGeo, core);
      c.scale.set(WEAPON_FX.tir.epaisseur * 0.7, WEAPON_FX.tir.epaisseur * 0.7, WEAPON_FX.tir.longueur * 0.8);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(0.55);
      halo.position.z = WEAPON_FX.tir.longueur * 0.45;
      for (const o of [body, c, halo]) { o.raycast = () => {}; g.add(o); }
    }
    (g.children[0] as THREE.Mesh).material = bodyMat;
    (g.children[2] as THREE.Sprite).material = haloMat;
    g.visible = false;
    root.add(g);
    return g;
  }

  // Anneau de parade : sprite (face à chaque caméra), visible dans la vue du joueur visé seulement.
  const ringTex = ringTexture();
  function makeRing(f: Flight): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: ringTex, color: palette.lumiere, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 40;
    s.raycast = () => {};
    // Écran scindé (RTVIEW) : `ctx.three.cameras[joueur]` ; sans vues multiples, on l'affiche partout.
    s.onBeforeRender = (_r, _s, cam) => {
      const cams = (ctx.three as { cameras?: THREE.Camera[] }).cameras;
      const mine = !cams || cams.length < 2 || cams[f.target] === cam;
      mat.opacity = mine ? (s.userData.alpha as number ?? 1) : 0;
    };
    root.add(s);
    return s;
  }

  function isPlayerCollider(c: { parent(): { userData?: unknown } | null }, player?: PlayerId): boolean {
    const d = c.parent()?.userData as { kind?: string; player?: PlayerId } | undefined;
    return d?.kind === 'player' && (player === undefined || d.player === player);
  }

  function groundBelow(p: THREE.Vector3): number {
    const { RAPIER: R, world } = ctx.physics;
    const hit = world.castRay(new R.Ray({ x: p.x, y: p.y + 0.2, z: p.z }, { x: 0, y: -1, z: 0 }), 40, true, undefined, undefined, undefined, undefined,
      (c) => !c.isSensor() && !isPlayerCollider(c));
    return hit ? p.y + 0.2 - hit.timeOfImpact : -50;
  }

  /** Premier contact sur le segment a→b (décor, bouclier, adversaire), hors tireur. */
  function sweep(f: Flight, a: THREE.Vector3, b: THREE.Vector3): { point: THREE.Vector3; player: boolean } | null {
    const { RAPIER: R, world } = ctx.physics;
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 1e-5) return null;
    _v.divideScalar(len);
    const hit = world.castRay(new R.Ray({ x: a.x, y: a.y, z: a.z }, { x: _v.x, y: _v.y, z: _v.z }), len, true, undefined, undefined, undefined, undefined,
      (c) => !c.isSensor() && !isPlayerCollider(c, f.shooter));
    if (!hit) return null;
    return { point: a.clone().addScaledVector(_v, hit.timeOfImpact), player: isPlayerCollider(hit.collider) };
  }

  function nearestPlayer(p: Vec3): PlayerId {
    const a = ctx.state.players[0].pos, b = ctx.state.players[1].pos;
    return Math.hypot(a[0] - p[0], a[2] - p[2]) <= Math.hypot(b[0] - p[0], b[2] - p[2]) ? 0 : 1;
  }

  function chest(player: PlayerId): THREE.Vector3 {
    const p = ctx.state.players[player].pos;
    return new THREE.Vector3(p[0], p[1] + SHOT_ORIGIN_HEIGHT, p[2]);
  }

  function axisBetween(a: PlayerId, b: PlayerId, out: THREE.Vector3): THREE.Vector3 {
    const pa = ctx.state.players[a].pos, pb = ctx.state.players[b].pos;
    out.set(pb[0] - pa[0], 0, pb[2] - pa[2]);
    if (out.lengthSq() < 1e-6) out.set(a === 0 ? 1 : -1, 0, 0);
    return out.normalize();
  }

  // ------------------------------------------------------------------ création
  function spawn(id: string, weapon: Weapon, from: Vec3, vel: Vec3): void {
    const now = performance.now();
    const phys = !TURN_PHASES.has(ctx.state.phase);
    // Renvoi d'une parade parfaite : le même objet repart vers son lanceur.
    if (pendingReflect && pendingReflect.flight.weapon.id === weapon.id && now - pendingReflect.at < 250) {
      const f = pendingReflect.flight;
      pendingReflect = null;
      startReturn(f, id, from, vel, phys);
      return;
    }
    const shooter = nearestPlayer(from);
    const lf = lastFire[shooter];
    const fresh = lf && lf.weaponId === weapon.id && now - lf.at < 1500;
    const power = fresh ? lf!.power : 0.5;
    const count = fresh ? ++lf!.count : 1;
    const kind: Kind = weapon.category === 'grenade' ? 'grenade' : weapon.category === 'blaster' ? 'bolt' : 'throwable';
    const main = count === 1;
    const split = weapon.trait === 'split' && kind !== 'bolt';
    const fragment = split && !main;

    const fromV = new THREE.Vector3(from[0], from[1], from[2]);
    const velV = new THREE.Vector3(vel[0], vel[1], vel[2]);
    const speed = Math.max(0.01, velV.length());
    let impact = fromV.clone().addScaledVector(velV, 1.5);
    let path: THREE.Vector3[] | null = null;
    let radius = 0;
    if (!phys) {
      try {
        const dir: Vec3 = [vel[0] / speed, vel[1] / speed, vel[2] / speed];
        const aimPoint = kind === 'grenade' && main ? getRuntime().players[shooter].aimPoint : null;
        const traj = predictTrajectory(ctx, shooter, weapon, from, dir, power, aimPoint);
        impact = new THREE.Vector3(...traj.impact);
        if (kind === 'grenade') path = traj.path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        radius = traj.splashRadius;
      } catch (e) { console.warn('[weapons] trajectoire', e); }
    } else if (kind === 'grenade') {
      // Rayon réel : mêmes formules que le gameplay (stat b).
      radius = predictRadius(weapon);
    }
    if (weapon.trait === 'explosive') radius += TRAIT_TUNING.explosive.bonusRadius;
    const distance = impact.distanceTo(fromV);
    // Tour par tour : le gameplay règle la vitesse pour que distance / vitesse = temps de vol réel.
    const plannedMs = Math.max(200, (distance / speed) * 1000);
    const target = other(shooter);

    const f: Flight = {
      id, weapon, kind, phys, shooter, target, from: fromV, impact, path, ground: phys ? fromV.y - SHOT_ORIGIN_HEIGHT : groundBelow(impact), radius,
      axis: axisBetween(shooter, target, new THREE.Vector3()), distance,
      spawnAt: now, plannedMs, releaseAt: now + (kind === 'bolt' || !main || phys ? 0 : WEAPON_FX.main.relache), handOffset: new THREE.Vector3(),
      elapsedMs: 0, age: 0, p: 0, synced: false, syncT0: now, syncP0: 0, tImpact: now + plannedMs, state: 'hand', main, fragment, split, returning: false,
      model: null, bolt: null, trail: null, shadow: null, ring: null, ringT0: 0, ringT1: 0, size: 1, spin: Math.random() * Math.PI * 2,
      spinDir: shooter === 0 ? -1 : 1, pos: fromV.clone(), vel: velV.clone(), t: 0, until: 0, squash: 0,
    };
    if (kind === 'bolt') {
      f.bolt = makeBolt(weapon.palette[0]);
      f.trail = new Trail(10, WEAPON_FX.tir.epaisseur * 0.8, weapon.palette[0], 0.8, true);
      root.add(f.trail.mesh);
    } else {
      f.model = new WeaponModel(weapon);
      f.size = kind === 'grenade' ? WEAPON_FX.vol.grenade.taille : WEAPON_FX.vol.throwable.taille;
      if (fragment) f.size *= WEAPON_FX.vol.fragment;
      f.model.root.visible = false;
      root.add(f.model.root);
      f.shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
      f.shadow.rotation.x = -Math.PI / 2;
      f.shadow.visible = false;
      f.shadow.raycast = () => {};
      root.add(f.shadow);
      if (kind === 'throwable') { f.trail = new Trail(14, f.size * 0.42, weapon.palette[0], 0.75); root.add(f.trail.mesh); }
    }
    flights.push(f);
    if (f.releaseAt <= now) release(f);
  }

  /** Rayon réel de la grenade : même formule que le gameplay (trajectory.ts, stat b = radius). */
  function predictRadius(weapon: Weapon): number {
    return lerp(GRENADE_RADIUS_MIN, GRENADE_RADIUS_MAX, weapon.stats.b);
  }

  function release(f: Flight): void {
    if (f.state !== 'hand') return;
    f.state = 'flying';
    f.releaseAt = performance.now();
    const hand = deps.handPos(f.shooter, f.kind === 'bolt');
    if (hand && !f.fragment) f.handOffset.copy(hand).sub(f.from);
    if (f.handOffset.lengthSq() > 4) f.handOffset.setLength(2); // garde-fou : main introuvable ou perso téléporté
    if (f.kind === 'bolt') deps.shot(f.shooter, f.weapon);
    else if (f.main) deps.released(f.shooter);
  }

  function startReturn(f: Flight, newId: string, from: Vec3, vel: Vec3, phys: boolean): void {
    // Ricochet : étincelles au point de renvoi, puis retour tendu vers le lanceur.
    blast.sparks(f.pos.clone(), f.weapon.palette, 16);
    blast.flash(f.pos.clone(), 0.9);
    const now = performance.now();
    f.id = newId;
    [f.shooter, f.target] = [f.target, f.shooter];
    f.from.copy(f.pos);
    f.returning = true;
    f.spinDir *= -1;
    f.state = 'flying';
    f.handOffset.set(0, 0, 0);
    f.axis.negate();
    f.age = 0;
    clearRing(f);
    f.phys = phys;
    if (phys) {
      f.vel.set(vel[0], vel[1], vel[2]);
      if (f.kind === 'bolt' && f.vel.lengthSq() < 1e-4) f.vel.copy(chest(f.target)).sub(f.pos).setLength(20);
      void from;
      return;
    }
    f.kind = f.kind === 'bolt' ? 'bolt' : 'throwable';
    f.path = null;
    f.impact.copy(chest(f.target));
    f.distance = f.impact.distanceTo(f.from);
    f.synced = true; f.syncT0 = now; f.syncP0 = 0; f.p = 0; f.tImpact = now + REFLECT_RETURN_MS;
    f.ground = groundBelow(f.impact);
  }

  // ------------------------------------------------------------------ trajectoire (tour par tour)
  function samplePath(path: THREE.Vector3[], u: number, out: THREE.Vector3): THREE.Vector3 {
    const x = Math.min(1, Math.max(0, u)) * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(x));
    return out.copy(path[i]).lerp(path[i + 1], x - i);
  }

  function posAt(f: Flight, p: number, out: THREE.Vector3): void {
    if (f.kind === 'grenade' && f.path && f.path.length >= 2) { samplePath(f.path, p, out); return; }
    out.copy(f.from).lerp(f.impact, p);
    if (f.kind === 'throwable') out.y += Math.min(0.9, f.distance * WEAPON_FX.vol.fleche) * 4 * p * (1 - p);
  }

  // ------------------------------------------------------------------ arrivée
  /** Contact : sur un joueur, on attend le verdict du gameplay ; sinon on résout tout de suite. */
  function contact(f: Flight, point: THREE.Vector3, onPlayer: boolean): void {
    f.pos.copy(point);
    f.impact.copy(point);
    if (onPlayer) {
      f.state = 'contact';
      f.until = performance.now() + CONTACT_WAIT_MS;
      return;
    }
    arrive(f);
  }

  function arrive(f: Flight): void {
    const w = f.weapon;
    f.impact.copy(f.pos);
    f.ground = groundBelow(f.pos);
    deps.arrived(f.impact, w, f.shooter);
    clearRing(f);
    if (w.trait === 'sticky' && f.kind !== 'bolt' && f.state !== 'stuck') {
      f.state = 'stuck'; // colle et clignote jusqu'au coup réel (fusible du trait sticky)
      f.until = performance.now() + TRAIT_TUNING.sticky.fuseMs + 150;
      blast.splat(_v.set(f.impact.x, f.ground, f.impact.z), w.palette[0], 1.1);
      return;
    }
    detonate(f);
  }

  function traitsAt(f: Flight, groundPos: THREE.Vector3): void {
    const w = f.weapon;
    if (w.trait === 'slippery') blast.puddle(groundPos, w.palette[0], 1.5, TRAIT_TUNING.slippery.slideMs);
    if (w.trait === 'loud') blast.soundWaves(f.impact.clone(), w.palette[0]);
    if (w.trait === 'heavy') blast.dust(groundPos, 2.4, 16);
  }

  function detonate(f: Flight): void {
    const w = f.weapon;
    const g = new THREE.Vector3(f.impact.x, Math.max(f.ground, f.impact.y - 2.5), f.impact.z);
    if (f.kind === 'grenade') {
      const center = f.impact.y - g.y > 0.35 ? g.clone() : f.impact.clone();
      blast.explosion(center, f.radius || 2, w.palette, { big: w.trait === 'explosive' });
      traitsAt(f, g);
      finish(f);
      return;
    }
    if (f.kind === 'throwable') {
      blast.wham(f.impact.clone(), g.y, w.palette, w.trait === 'heavy');
      if (w.trait === 'explosive') blast.explosion(g, TRAIT_TUNING.explosive.bonusRadius, w.palette, { word: false });
      traitsAt(f, g);
      // L'objet rebondit sur la cible puis retombe (et s'écrase s'il est bouncy).
      f.state = 'debris';
      f.t = 0;
      f.ground = g.y;
      _v.copy(f.vel).setY(0);
      if (_v.lengthSq() < 1e-4) _v.copy(f.axis);
      const back = w.trait === 'bouncy' ? 5 : 2.4;
      f.vel.copy(_v.normalize()).multiplyScalar(-back).addScaledVector(UP, w.trait === 'bouncy' ? 7 : 4.2);
      return;
    }
    blast.sparks(f.impact.clone(), w.palette, 10);
    if (w.trait === 'explosive') blast.explosion(g, TRAIT_TUNING.explosive.bonusRadius, w.palette, { word: false });
    if (w.trait === 'slippery' || w.trait === 'loud') traitsAt(f, g);
    finish(f);
  }

  function deflect(f: Flight): void {
    // Parade parfaite sans renvoi (tour par tour : grenade, tir) : l'objet est chassé loin du défenseur.
    const d = chest(f.target);
    f.state = 'deflect';
    f.t = 0;
    clearRing(f);
    f.vel.copy(f.pos).sub(d).setY(0);
    if (f.vel.lengthSq() < 1e-4) f.vel.copy(f.axis).negate();
    f.vel.normalize().multiplyScalar(7).addScaledVector(UP, 6);
    f.vel.applyAxisAngle(UP, (Math.random() - 0.5) * 1.6);
    blast.sparks(f.pos.clone(), f.weapon.palette, 18);
    blast.flash(f.pos.clone(), 0.7);
  }

  function clearRing(f: Flight): void {
    if (!f.ring) return;
    f.ring.removeFromParent();
    f.ring.material.dispose();
    f.ring = null;
  }

  function finish(f: Flight): void {
    f.state = 'done';
    f.model?.dispose();
    f.model = null;
    if (f.bolt) { f.bolt.removeFromParent(); boltPool.push(f.bolt); f.bolt = null; }
    if (f.shadow) { f.shadow.removeFromParent(); (f.shadow.material as THREE.Material).dispose(); f.shadow = null; }
    clearRing(f);
    if (!f.trail) remove(f);
  }

  function remove(f: Flight): void {
    f.trail?.dispose();
    f.trail = null;
    const i = flights.indexOf(f);
    if (i >= 0) flights.splice(i, 1);
  }

  // ------------------------------------------------------------------ bus
  const live = (x: Flight) => x.state === 'flying' || x.state === 'hand' || x.state === 'contact';

  function closest(pred: (f: Flight) => boolean, to: THREE.Vector3): Flight | undefined {
    let best: Flight | undefined; let bd = Infinity;
    for (const f of flights) {
      if (!pred(f)) continue;
      const d = f.pos.distanceToSquared(to);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  ctx.bus.on('fire', ({ player, weapon, power }) => {
    lastFire[player] = { power, at: performance.now(), count: 0, weaponId: weapon.id };
  });

  ctx.bus.on('projectile:spawn', ({ id, weapon, from, vel }) => {
    try { spawn(id, weapon, from, vel); } catch (e) { console.error('[weapons] projectile:spawn', e); }
  });

  ctx.bus.on('anim:release', ({ player }) => {
    for (const f of flights) if (f.shooter === player && f.state === 'hand') release(f);
  });

  ctx.bus.on('projectile:incoming', ({ id, etaMs }) => {
    const f = flights.find((x) => x.id === id);
    if (!f || !live(f)) return;
    const now = performance.now();
    if (f.state === 'hand') release(f);
    if (!f.phys) { f.syncP0 = f.p; f.syncT0 = now; f.synced = true; f.tImpact = now + etaMs; }
    clearRing(f);
    f.ring = makeRing(f);
    f.ringT0 = now; f.ringT1 = now + Math.max(80, etaMs);
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    const f = closest((x) => x.target === player && live(x) && !x.returning, chest(player));
    if (!f) return;
    if (grade !== 'perfect') {
      if (f.state === 'contact') f.until = Math.min(f.until, performance.now() + 60); // le coup (réduit) va suivre
      return;
    }
    // Parfaite : on attend le renvoi (`projectile:spawn` du même objet) ; sans renvoi, l'objet est chassé.
    pendingReflect = { flight: f, at: performance.now() };
    f.state = 'contact';
    f.until = performance.now() + 250;
    f.vel.set(0, 0, 0);
    blast.sparks(f.pos.clone(), f.weapon.palette, 12);
  });

  ctx.bus.on('hit', ({ weapon, attacker, pos }) => {
    if (weapon.trait === 'healing') blast.heal(chest(attacker));
    const hp = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const f = closest((x) => x.weapon.id === weapon.id && (live(x) || x.state === 'stuck'), hp);
    if (!f) return;
    if (f.state === 'stuck') { f.until = 0; return; }
    if (f.state === 'hand') release(f);
    // Le gameplay a tranché : l'explosion se centre sur SON point d'impact (le rayon affiché est le vrai).
    if (f.kind === 'grenade' || f.pos.distanceTo(hp) > 2.5) f.pos.copy(hp);
    if (!f.phys && f.state === 'flying' && f.p < 0.97) {
      // Parade anticipée (tour par tour) : l'objet finit sa course en 110 ms au lieu de se téléporter.
      const now = performance.now();
      f.syncP0 = f.p; f.syncT0 = now; f.synced = true; f.tImpact = now + 110;
      f.state = 'flying';
      f.until = -1; // marqueur : résoudre à l'arrivée sans attendre de verdict
      return;
    }
    arrive(f);
  });

  ctx.bus.on('match:start', () => {
    for (const f of [...flights]) { finish(f); remove(f); }
    pendingReflect = null;
    blast.clear();
  });

  // ------------------------------------------------------------------ image par image
  function update(dt: number): void {
    const now = performance.now();
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (f.state === 'done') {
        if (f.trail) { f.trail.shrink(); f.trail.shrink(); f.trail.update(camera); if (!f.trail.mesh.visible) remove(f); }
        continue;
      }
      if (f.state === 'hand') {
        if (now >= f.releaseAt) release(f);
        else continue;
      }
      f.t += dt;

      if (f.state === 'flying') {
        f.age += dt;
        if (f.phys) stepPhysics(f, dt);
        else stepTimed(f, dt, now);
      } else if (f.state === 'contact') {
        if (now >= f.until) {
          if (pendingReflect?.flight === f) {
            pendingReflect = null;
            if (f.kind === 'throwable') { arrive(f); } else deflect(f);
          } else arrive(f);
        }
      } else if (f.state === 'stuck') {
        if (now >= f.until) detonate(f);
      } else if (f.state === 'deflect' || f.state === 'debris') {
        f.vel.y -= 16 * dt;
        f.pos.addScaledVector(f.vel, dt);
        const floor = f.ground + f.size * 0.3;
        if (f.pos.y < floor && f.vel.y < 0 && f.state === 'debris') {
          f.pos.y = floor;
          f.vel.y *= f.weapon.trait === 'bouncy' ? -0.6 : -0.3;
          f.vel.x *= 0.6; f.vel.z *= 0.6;
          f.squash = 1;
        }
        const life = f.state === 'deflect' ? 0.55 : 1.1;
        if (f.t >= life) {
          if (f.state === 'deflect' && f.kind === 'grenade') blast.explosion(f.pos.clone(), 1.2, f.weapon.palette, { air: true, word: false });
          else if (f.state === 'deflect') blast.sparks(f.pos.clone(), f.weapon.palette, 6);
          finish(f);
          continue;
        }
      }
      if ((f.state as State) !== 'done') render(f, dt, now);
    }
  }

  function stepPhysics(f: Flight, dt: number): void {
    const prev = _w.copy(f.pos);
    const g = f.kind === 'grenade' ? GRENADE_ARC_GRAVITY : 0;
    f.vel.y -= g * dt;
    // Position « gameplay » (origine + vitesse) ; l'écart main → origine se résorbe en 0,15 s.
    f.from.addScaledVector(f.vel, dt);
    f.pos.copy(f.from).addScaledVector(f.handOffset, 1 - smooth(0, 0.15, f.age));
    const hit = sweep(f, prev, f.pos);
    if (hit) {
      // Trait bouncy : la grenade rebondit (écrasée) avant d'exploser.
      if (f.kind === 'grenade' && f.weapon.trait === 'bouncy' && !hit.player && f.t < 2 && (f.squashCount ?? 0) < 2) {
        f.squashCount = (f.squashCount ?? 0) + 1;
        f.from.copy(hit.point).addScaledVector(UP, 0.05);
        f.pos.copy(f.from);
        f.handOffset.set(0, 0, 0);
        f.vel.y = Math.abs(f.vel.y) * 0.55;
        f.vel.x *= 0.8; f.vel.z *= 0.8;
        f.squash = 1;
        blast.dust(hit.point, 0.8, 5);
        return;
      }
      contact(f, hit.point, hit.player);
      return;
    }
    if (f.age > 6 || f.pos.y < -40) finish(f);
  }

  function stepTimed(f: Flight, dt: number, now: number): void {
    if (f.synced) {
      const span = Math.max(1, f.tImpact - f.syncT0);
      f.p = f.syncP0 + (1 - f.syncP0) * Math.min(1, (now - f.syncT0) / span);
    } else {
      f.elapsedMs += dt * 1000;
      const flightMs = Math.max(250, f.plannedMs - (f.releaseAt - f.spawnAt));
      f.p = Math.min(1, f.elapsedMs / flightMs);
    }
    const prev = _w.copy(f.pos);
    posAt(f, f.p, f.pos);
    // Parti de la main : l'écart main → origine du gameplay se résorbe sur le premier quart du vol.
    f.pos.addScaledVector(f.handOffset, 1 - smooth(0, 0.25, f.p));
    f.vel.subVectors(f.pos, prev).divideScalar(Math.max(dt, 1e-3));
    if (f.p >= 1) {
      f.pos.copy(f.impact);
      // Menace réelle (annoncée par projectile:incoming) : on attend le verdict ; sinon on résout.
      if (f.until === -1) { f.until = 0; arrive(f); return; }
      contact(f, f.impact, f.synced && !f.returning);
    }
  }

  function render(f: Flight, dt: number, now: number): void {
    f.squash = Math.max(0, f.squash - dt * 6);
    if (f.ring) {
      const u = Math.min(1, (now - f.ringT0) / Math.max(1, f.ringT1 - f.ringT0));
      const base = f.kind === 'bolt' ? 0.5 : f.size;
      f.ring.position.copy(f.pos);
      f.ring.scale.setScalar(base * (1.1 + 3.2 * (1 - u) * (1 - u)));
      f.ring.userData.alpha = 0.35 + 0.65 * u;
      f.ring.material.color.set(u > 0.8 ? palette.danger : palette.lumiere);
    }
    if (f.bolt) {
      f.bolt.visible = true;
      f.bolt.position.copy(f.pos);
      if (f.vel.lengthSq() > 1e-6) f.bolt.quaternion.setFromUnitVectors(Z, _v.copy(f.vel).normalize());
      if (f.state === 'flying') f.trail?.push(f.pos); else f.trail?.shrink();
      f.trail?.update(camera);
      return;
    }
    const m = f.model;
    if (!m) return;
    m.root.visible = true;
    // Face au défenseur (axe tireur → cible) : lisible dans les 2 vues de l'écran scindé ; rotation dans son
    // plan + léger roulis qui montre l'épaisseur du carton.
    const turns = f.kind === 'grenade' ? WEAPON_FX.vol.grenade.tours : WEAPON_FX.vol.throwable.tours;
    const spinRate = (f.state === 'debris' || f.state === 'deflect' ? 2.2 : 1) * (f.returning ? 1.6 : 1);
    if (f.state === 'flying' || f.state === 'debris' || f.state === 'deflect') f.spin += f.spinDir * turns * Math.PI * 2 * dt * spinRate;
    _qz.setFromAxisAngle(Z, f.spin);
    _qt.setFromAxisAngle(X, 0.35 * Math.sin(f.t * 5));
    m.root.quaternion.setFromUnitVectors(Z, _v.copy(f.axis).negate()).multiply(_qt).multiply(_qz);
    // Grossit en arrivant sur le défenseur (vue de parade), s'écrase à chaque rebond.
    let k = f.size;
    if (f.state === 'flying' && !f.phys) k *= 1 + (WEAPON_FX.vol.approche - 1) * smooth(0.55, 1, f.p);
    if (f.state === 'flying' && f.phys) {
      const d = f.pos.distanceTo(chest(f.target));
      k *= 1 + (WEAPON_FX.vol.approche - 1) * (1 - smooth(1.5, 7, d));
    }
    if (f.split) {
      const pop = f.phys ? smooth(0.12, 0.2, f.age) : smooth(0.14, 0.24, f.p);
      if (f.fragment) k *= Math.max(0.001, pop);
      else if (f.state === 'flying') k *= 1 - (1 - WEAPON_FX.vol.fragment) * pop;
      if (f.fragment && pop > 0 && !m.root.userData.split) { m.root.userData.split = true; blast.sparks(f.pos.clone(), f.weapon.palette, 8); }
    }
    if (f.state === 'debris' && f.t > 0.8) k *= Math.max(0.001, 1 - (f.t - 0.8) / 0.3); // se décolle
    const sq = f.squash;
    m.root.scale.set(k * (1 + 0.35 * sq), k * (1 - 0.4 * sq), k);
    m.root.position.copy(f.pos);
    // Mèche (grenade) : clignote de plus en plus vite ; collé (sticky) ou en attente : clignote vite.
    if (f.kind === 'grenade' || f.state === 'stuck') {
      const fuse = f.phys ? Math.min(1, f.age / 1.4) : f.p;
      const freq = f.state === 'stuck' || f.state === 'contact' ? WEAPON_FX.meche.freqMax : THREE.MathUtils.lerp(WEAPON_FX.meche.freqMin, WEAPON_FX.meche.freqMax, fuse * fuse);
      const on = Math.sin(now / 1000 * freq * Math.PI * 2) > 0;
      m.glow(on ? palette.danger : palette.lumiere, on ? 0.85 : 0.15);
      if (on && Math.random() < 0.5) blast.fxAdd.burst(_v.copy(f.pos).addScaledVector(UP, k * 0.5), { count: 1, color: [palette.lumiere, palette.danger], speed: [0.5, 1.5], life: [0.1, 0.25], size: [0.06, 0.12], gravity: 3 });
    } else if (f.returning) m.glow(palette.lumiere, 0.4);
    if (f.trail) {
      if (f.state === 'flying') f.trail.push(f.pos); else f.trail.shrink();
      f.trail.update(camera);
    }
    if (f.shadow) {
      const g = f.state === 'flying' ? groundBelow(f.pos) : f.ground;
      const h = f.pos.y - g;
      f.shadow.visible = h > -0.1 && h < 12;
      f.shadow.position.set(f.pos.x, g + 0.03, f.pos.z);
      f.shadow.scale.setScalar(WEAPON_FX.vol.ombre * k / f.size * (1 + h * 0.08));
      (f.shadow.material as THREE.MeshBasicMaterial).opacity = rendu.ombres.tache * Math.max(0.2, 1 - h / 9);
    }
  }

  return { update, flights };
}
