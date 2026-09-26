// L'objet en vol (temps réel) : la grenade suit sa cloche et clignote comme une mèche ; le throwable file en
// tournant avec une traînée ; le blaster crache des traçantes. Le code arbitre, la scène suit :
//  - position = celle du projectile du gameplay (`liveProjectiles()`, lecture seule), à défaut rejouée depuis
//    `projectile:spawn { from, vel, gravity }` ; au départ, l'écart main → origine du tir se résorbe en 0,15 s ;
//  - fin = `projectile:end { pos, reason }` : impact (hit / world), renvoi (parried), disparition (expired) ;
//  - parade parfaite : `parry:result` puis `projectile:spawn` du renvoi → c'est le MÊME objet qui repart.
// Anneau de parade : se referme autour de l'objet entrant pendant `etaMs`, dans la vue du joueur visé seulement.
import * as THREE from 'three';
import { palette, rendu } from '../../art/tokens.js';
import type { Ctx, PlayerId, Vec3, Weapon } from '../../core/types';
import { liveProjectiles } from '../../gameplay/projectiles';
import { lerp } from '../../gameplay/trajectory';
import { GRENADE_RADIUS_MAX, GRENADE_RADIUS_MIN, SHOT_ORIGIN_HEIGHT, TRAIT_TUNING } from '../../gameplay/tuning';
import { cameraShake } from '../api';
import { excludeFromOcclusion } from '../registry';
import type { BlastFx, ObjectHit } from './blast';
import { lookOf, type ObjectLook } from './physics';
import { WEAPON_FX } from './tokens';
import { Trail } from './trail';
import { WeaponModel } from './visual';

type Kind = 'grenade' | 'throwable' | 'bolt';
type State = 'flying' | 'deflect' | 'debris' | 'done';

interface Flight {
  id: string;
  weapon: Weapon;
  kind: Kind;
  owner: PlayerId;
  target: PlayerId;
  base: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity: number;
  handOffset: THREE.Vector3;
  axis: THREE.Vector3;
  start: THREE.Vector3;
  age: number;
  t: number;
  state: State;
  returning: boolean;
  model: WeaponModel | null;
  twins: WeaponModel[];
  bolt: THREE.Group | null;
  trail: Trail | null;
  shadow: THREE.Mesh | null;
  ring: THREE.Sprite | null;
  /** Anneau de parade : âge et durée (s, temps de JEU comme le vol : le ralenti le ralentit aussi). */
  ringAge: number;
  ringDur: number;
  size: number;
  spin: number;
  spinDir: number;
  squash: number;
  ground: number;
  /** Physique réelle vue par le rendu : taille, poids, matière, forme. */
  look: ObjectLook;
  /** Rotation propre selon la forme (repère de l'objet), axe et vitesse angulaire (rad/s). */
  rot: THREE.Quaternion;
  spinAxis: THREE.Vector3;
  omega: number;
}

export interface FlightDeps {
  blast: BlastFx;
  /** Position monde de l'objet en main (ou du bout du canon), null si pas de main. */
  handPos(player: PlayerId, muzzle: boolean): THREE.Vector3 | null;
  /** Un tir part du blaster en main : recul, éclair, douille. */
  shot(player: PlayerId, weapon: Weapon): void;
  /** Point d'impact : le bouclier touché réagit (étincelles, vacillement). */
  arrived(pos: THREE.Vector3, weapon: Weapon, shooter: PlayerId): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _qz = new THREE.Quaternion();
const _qt = new THREE.Quaternion();

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function other(p: PlayerId): PlayerId { return p === 0 ? 1 : 0; }

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.lineWidth = 16; g.strokeStyle = rendu.contour.encre;
  g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 8; g.strokeStyle = '#ffffff';
  g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
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
  let pendingReflect: { flight: Flight; at: number } | null = null;
  /** Dernier objet liquide qui a giclé (couleur de la flaque du gameplay). */
  let lastLiquid: { pos: THREE.Vector3; color: string; t: number } | null = null;

  function cameraShakeFor(f: Flight, k: number): void {
    cameraShake(THREE.MathUtils.lerp(WEAPON_FX.trauma.impactLeger, WEAPON_FX.trauma.impactLourd, f.look.weight) * k);
  }

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
  const boltMats = new Map<string, [THREE.Material, THREE.SpriteMaterial]>();
  const coreMat = new THREE.MeshBasicMaterial({ color: palette.lumiere, toneMapped: false });
  function boltMaterials(color: string): [THREE.Material, THREE.SpriteMaterial] {
    let m = boltMats.get(color);
    if (!m) {
      m = [
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
        new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      ];
      boltMats.set(color, m);
    }
    return m;
  }
  const boltPool: THREE.Group[] = [];
  function makeBolt(color: string): THREE.Group {
    const [bodyMat, haloMat] = boltMaterials(color);
    let g = boltPool.pop();
    if (!g) {
      g = new THREE.Group();
      const body = new THREE.Mesh(boltGeo, bodyMat);
      body.scale.set(WEAPON_FX.tir.epaisseur * 1.8, WEAPON_FX.tir.epaisseur * 1.8, WEAPON_FX.tir.longueur);
      const core = new THREE.Mesh(boltGeo, coreMat);
      core.scale.set(WEAPON_FX.tir.epaisseur * 0.7, WEAPON_FX.tir.epaisseur * 0.7, WEAPON_FX.tir.longueur * 0.8);
      const halo = new THREE.Sprite(haloMat);
      halo.scale.setScalar(0.6);
      halo.position.z = WEAPON_FX.tir.longueur * 0.45;
      for (const o of [body, core, halo]) { o.raycast = () => {}; g.add(o); }
    }
    (g.children[0] as THREE.Mesh).material = bodyMat;
    (g.children[2] as THREE.Sprite).material = haloMat;
    g.visible = false;
    root.add(g);
    return g;
  }

  // Anneau de parade : sprite (face à chaque caméra), dessiné seulement dans la vue du joueur visé.
  const ringTex = ringTexture();
  function makeRing(f: Flight): THREE.Sprite {
    const mat = new THREE.SpriteMaterial({ map: ringTex, color: palette.lumiere, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 40;
    s.raycast = () => {};
    s.onBeforeRender = (_r, _s, cam) => {
      const cams = ctx.three.cameras;
      const mine = !cams || cams[f.target] === cam || (cams[0] !== cam && cams[1] !== cam);
      mat.opacity = mine ? ((s.userData.alpha as number | undefined) ?? 1) : 0;
    };
    root.add(s);
    return s;
  }

  // Préchauffe : un exemplaire de chaque matériau créé plus tard, pour que la compilation des shaders du
  // début de match (src/core/shaders.ts, qui compile même ce qui est caché) les couvre : pas de gel au 1er tir.
  {
    const warm = new THREE.Group();
    warm.visible = false;
    warm.add(makeBolt(palette.lumiere));
    const t1 = new Trail(4, 0.1, palette.lumiere, 0.8, true);
    const t2 = new Trail(4, 0.1, palette.lumiere, 0.8, false);
    warm.add(t1.mesh, t2.mesh, new THREE.Mesh(shadowGeo, shadowMat), new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, depthTest: false, depthWrite: false, toneMapped: false })));
    warm.traverse((o) => { o.raycast = () => {}; });
    root.add(warm);
  }

  function isPlayerCollider(c: { parent(): { userData?: unknown } | null }): boolean {
    return (c.parent()?.userData as { kind?: string } | undefined)?.kind === 'player';
  }

  function groundBelow(p: THREE.Vector3): number {
    const { RAPIER: R, world } = ctx.physics;
    const hit = world.castRay(new R.Ray({ x: p.x, y: p.y + 0.2, z: p.z }, { x: 0, y: -1, z: 0 }), 40, true, undefined, undefined, undefined, undefined,
      (c) => !c.isSensor() && !isPlayerCollider(c));
    return hit ? p.y + 0.2 - hit.timeOfImpact : -50;
  }

  function nearestPlayer(p: Vec3): PlayerId {
    const a = ctx.state.players[0].pos, b = ctx.state.players[1].pos;
    return Math.hypot(a[0] - p[0], a[2] - p[2]) <= Math.hypot(b[0] - p[0], b[2] - p[2]) ? 0 : 1;
  }

  function chest(player: PlayerId): THREE.Vector3 {
    const p = ctx.state.players[player].pos;
    return new THREE.Vector3(p[0], p[1] + SHOT_ORIGIN_HEIGHT, p[2]);
  }

  /** Rayon réel de l'explosion : même formule que le gameplay (projectiles.ts, stat b + trait explosive). */
  function splashRadius(w: Weapon): number {
    const base = w.category === 'grenade' ? lerp(GRENADE_RADIUS_MIN, GRENADE_RADIUS_MAX, w.stats.b) : 0;
    return base + (w.trait === 'explosive' ? TRAIT_TUNING.explosive.bonusRadius : 0);
  }

  // ------------------------------------------------------------------ création
  function spawn(id: string, weapon: Weapon, from: Vec3, vel: Vec3, gravity: number, ownerIn?: PlayerId): void {
    const now = performance.now();
    const owner = ownerIn ?? nearestPlayer(from);
    // Renvoi d'une parade parfaite : le même objet repart vers son lanceur.
    if (pendingReflect && pendingReflect.flight.weapon.id === weapon.id && now - pendingReflect.at < 250) {
      const f = pendingReflect.flight;
      pendingReflect = null;
      blast.sparks(f.pos.clone(), f.weapon.palette, 16);
      blast.flash(f.pos.clone(), 0.9);
      f.id = id;
      f.owner = owner;
      f.target = other(owner);
      f.base.set(from[0], from[1], from[2]);
      f.vel.set(vel[0], vel[1], vel[2]);
      f.gravity = gravity;
      f.handOffset.copy(f.pos).sub(f.base);
      f.age = 0;
      f.returning = true;
      f.spinDir *= -1;
      f.axis.negate();
      f.start.copy(f.base);
      clearRing(f);
      return;
    }
    const kind: Kind = weapon.category === 'grenade' ? 'grenade' : weapon.category === 'blaster' ? 'bolt' : 'throwable';
    const target = other(owner);
    const base = new THREE.Vector3(from[0], from[1], from[2]);
    const axis = new THREE.Vector3(vel[0], 0, vel[2]);
    if (axis.lengthSq() < 1e-6) axis.set(owner === 0 ? 1 : -1, 0, 0);
    axis.normalize();
    const look = lookOf(weapon);
    const f: Flight = {
      id, weapon, kind, owner, target, base, pos: base.clone(), vel: new THREE.Vector3(vel[0], vel[1], vel[2]), gravity,
      handOffset: new THREE.Vector3(), axis, start: base.clone(), age: 0, t: 0, state: 'flying', returning: false,
      model: null, twins: [], bolt: null, trail: null, shadow: null, ring: null, ringAge: 0, ringDur: 0.4, size: look.size,
      spin: Math.random() * Math.PI * 2, spinDir: owner === 0 ? -1 : 1, squash: 0, ground: 0,
      look, rot: new THREE.Quaternion(), spinAxis: new THREE.Vector3(1, 0, 0), omega: look.turns * Math.PI * 2,
    };
    setSpin(f);
    // Part de la main : l'écart main → origine du gameplay se résorbe sur les premiers instants.
    const hand = deps.handPos(owner, kind === 'bolt');
    if (hand && hand.distanceTo(base) < 2) f.handOffset.copy(hand).sub(base);
    f.pos.add(f.handOffset);
    if (kind === 'bolt') {
      f.bolt = makeBolt(weapon.palette[0]);
      f.trail = new Trail(10, WEAPON_FX.tir.epaisseur * 0.8, weapon.palette[0], 0.8, true);
      root.add(f.trail.mesh);
      deps.shot(owner, weapon);
    } else {
      f.model = new WeaponModel(weapon);
      root.add(f.model.root);
      if (weapon.trait === 'split') {
        // Trait split : l'objet se divise en 3 (deux copies plus petites l'escortent et se referment à l'impact).
        for (let k = 0; k < 2; k++) { const m = new WeaponModel(weapon); m.root.visible = false; root.add(m.root); f.twins.push(m); }
      }
      f.shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
      f.shadow.rotation.x = -Math.PI / 2;
      f.shadow.raycast = () => {};
      root.add(f.shadow);
      // Traînée : épaisse et longue pour un objet lourd, fine pour un léger.
      f.trail = new Trail(10 + Math.round(8 * look.weight), f.size * (0.12 + 0.4 * look.weight), weapon.palette[0], 0.55 + 0.3 * look.weight);
      root.add(f.trail.mesh);
    }
    flights.push(f);
  }

  /** Rotation propre selon la forme (demande d'Adem) ; vitesse ≈ 1 / √masse (lookOf). */
  function setSpin(f: Flight): void {
    const [h, w] = f.look.phys.sizeM;
    switch (f.look.shape) {
      case 'long': f.spinAxis.set(h >= w ? 1 : 0, h >= w ? 0 : 1, 0); break; // bout par-dessus bout
      case 'flat': f.spinAxis.set(0, 0, 1); break; // frisbee : tourne à plat dans son plan
      case 'round': f.spinAxis.set(0, 0, 1); break; // roule : la face tourne vers le défenseur
      case 'box': f.spinAxis.set(1, 0.6, 0.2).normalize(); f.omega *= 0.55; break; // culbute lente
      default: f.spinAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); f.omega *= 1.4; // aléatoire, amortie
    }
    f.rot.identity();
  }

  // ------------------------------------------------------------------ fin de vol
  function traitsAt(f: Flight, at: THREE.Vector3, groundPos: THREE.Vector3): void {
    const w = f.weapon;
    if (w.trait === 'slippery') blast.puddle(groundPos, w.palette[0], 1.5, TRAIT_TUNING.slippery.slideMs);
    if (w.trait === 'sticky') blast.splat(groundPos, w.palette[0], 1.1);
    if (w.trait === 'loud') blast.soundWaves(at.clone(), w.palette[0]);
    if (w.trait === 'heavy') blast.dust(groundPos, 2.4, 16);
  }

  function objectHitOf(f: Flight): ObjectHit {
    const p = f.look.phys;
    return { colors: f.weapon.palette, weight: f.look.weight, size: f.size, material: p.material, fragile: p.fragile, liquid: p.liquid, viewer: f.owner };
  }

  function impact(f: Flight, at: THREE.Vector3, on: 'player' | 'world'): void {
    const w = f.weapon;
    const p = f.look.phys;
    f.pos.copy(at);
    clearRing(f);
    deps.arrived(at, w, f.owner);
    const gy = groundBelow(at);
    const g = new THREE.Vector3(at.x, at.y - gy < 3 ? gy : at.y, at.z);
    // Pour le son (clang, crash, splash…) : matière et masse réelles de l'objet.
    if (f.kind !== 'bolt') ctx.bus.emit('weapon:impact', { pos: [at.x, at.y, at.z], weaponId: w.id, category: w.category, material: p.material, massKg: p.massKg, fragile: p.fragile, liquid: p.liquid, on });
    if (p.liquid) lastLiquid = { pos: at.clone(), color: w.palette[0], t: performance.now() };
    if (f.kind === 'grenade') {
      // L'explosion part du point d'impact ; son anneau au sol montre le VRAI rayon de dégâts. La matière s'y
      // lit aussi : une bouteille éclate en verre et gicle, un canard en caoutchouc part en morceaux jaunes.
      blast.explosion(at.y - g.y > 0.4 ? g.clone() : at.clone(), splashRadius(w) || 2, w.palette, { big: w.trait === 'explosive', viewer: f.owner });
      blast.materialBurst(at.clone(), g.y, objectHitOf(f), 0.8);
      traitsAt(f, at, g);
      finish(f);
      return;
    }
    if (f.kind === 'throwable') {
      blast.objectHit(at.clone(), g.y, objectHitOf(f));
      if (w.trait === 'explosive') blast.explosion(g, TRAIT_TUNING.explosive.bonusRadius, w.palette, { word: false });
      traitsAt(f, at, g);
      hideTwins(f);
      if (p.fragile) { finish(f); return; } // brisé : il n'en reste que les éclats
      // L'objet rebondit sur ce qu'il a touché puis retombe : caoutchouc et plastique rebondissent fort
      // (écrasés à chaque rebond), le tissu tombe mou, le lourd retombe lourdement.
      const bounce = Math.min(1, Math.max(0.05, p.bounciness + (w.trait === 'bouncy' ? 0.35 : 0)));
      f.state = 'debris';
      f.t = 0;
      f.ground = g.y;
      _v.copy(f.vel).setY(0);
      if (_v.lengthSq() < 1e-4) _v.copy(f.axis);
      f.vel.copy(_v.normalize()).multiplyScalar(-(1.2 + 4 * bounce)).addScaledVector(UP, 2 + 6 * bounce);
      f.squash = 0.6 + 0.4 * bounce;
      return;
    }
    blast.sparks(at.clone(), w.palette, 10);
    if (w.trait === 'explosive') blast.explosion(g, TRAIT_TUNING.explosive.bonusRadius, w.palette, { word: false });
    if (w.trait === 'slippery' || w.trait === 'loud' || w.trait === 'sticky') traitsAt(f, at, g);
    finish(f);
  }

  function deflect(f: Flight): void {
    // Parée sans renvoi reçu : l'objet est chassé loin du défenseur.
    const d = chest(f.target);
    f.state = 'deflect';
    f.t = 0;
    clearRing(f);
    f.vel.copy(f.pos).sub(d).setY(0);
    if (f.vel.lengthSq() < 1e-4) f.vel.copy(f.axis).negate();
    f.vel.normalize().multiplyScalar(7).addScaledVector(UP, 6);
    blast.sparks(f.pos.clone(), f.weapon.palette, 18);
    blast.flash(f.pos.clone(), 0.7);
    hideTwins(f);
  }

  function hideTwins(f: Flight): void {
    for (const m of f.twins) m.dispose();
    f.twins.length = 0;
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
    hideTwins(f);
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
  ctx.bus.on('projectile:spawn', ({ id, weapon, from, vel, gravity, owner }) => {
    try { spawn(id, weapon, from, vel, gravity ?? (weapon.category === 'grenade' ? 14 : 0), owner); } catch (e) { console.error('[weapons] projectile:spawn', e); }
  });

  ctx.bus.on('projectile:end', ({ id, pos, reason }) => {
    const f = flights.find((x) => x.id === id && x.state === 'flying');
    if (!f) return; // déjà repris par un renvoi, ou jamais vu
    const at = new THREE.Vector3(pos[0], pos[1], pos[2]);
    if (reason === 'parried') { if (pendingReflect?.flight === f) pendingReflect = null; f.pos.copy(at); deflect(f); return; }
    if (reason === 'expired') { blast.sparks(f.pos.clone(), f.weapon.palette, 6); finish(f); return; }
    impact(f, at, reason === 'hit' ? 'player' : 'world');
  });

  ctx.bus.on('projectile:incoming', ({ id, etaMs }) => {
    const f = flights.find((x) => x.id === id && x.state === 'flying');
    if (!f) return;
    clearRing(f);
    f.ring = makeRing(f);
    f.ringAge = 0; f.ringDur = Math.max(0.08, etaMs / 1000);
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    if (grade !== 'perfect') return;
    // Le renvoi (projectile:spawn du même objet) suit dans la même image : on garde l'objet pour lui.
    let best: Flight | undefined; let bd = Infinity;
    const c = chest(player);
    for (const f of flights) {
      if (f.state !== 'flying' || f.target !== player) continue;
      const d = f.pos.distanceToSquared(c);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) pendingReflect = { flight: best, at: performance.now() };
  });

  ctx.bus.on('hit', ({ weapon, attacker }) => {
    if (weapon.trait === 'healing') blast.heal(chest(attacker));
  });

  // Rebond réel (gameplay, selon `bounciness`) : l'objet s'écrase, soulève un peu de poussière, et sa matière
  // parle (étincelles du métal, échardes du bois…) en petit.
  ctx.bus.on('projectile:bounce', ({ id, pos }) => {
    const f = flights.find((x) => x.id === id && x.state === 'flying');
    if (!f) return;
    const at = new THREE.Vector3(pos[0], pos[1], pos[2]);
    f.squash = 1;
    blast.dust(at, 0.5 + 0.9 * f.look.weight, 4 + Math.round(8 * f.look.weight));
    blast.materialBurst(at, at.y, { ...objectHitOf(f), liquid: false, fragile: false }, 0.25);
    cameraShakeFor(f, 0.35);
  });

  // Flaque glissante du gameplay (objet liquide) : à la couleur du dernier objet liquide qui a giclé là.
  ctx.bus.on('ground:slippery', ({ pos, radius, ms }) => {
    const at = new THREE.Vector3(pos[0], groundBelow(new THREE.Vector3(pos[0], pos[1] + 0.5, pos[2])), pos[2]);
    const color = lastLiquid && lastLiquid.pos.distanceTo(at) < 3 && performance.now() - lastLiquid.t < 1000 ? lastLiquid.color : WEAPON_FX.matiere.eau;
    blast.puddle(at, color, radius, ms);
  });

  ctx.bus.on('match:start', () => {
    for (const f of [...flights]) { finish(f); remove(f); }
    pendingReflect = null;
    blast.clear();
  });

  // ------------------------------------------------------------------ image par image
  function update(dt: number): void {
    const now = performance.now();
    const live = flights.length ? liveProjectiles() : [];
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (f.state === 'done') {
        if (f.trail) { f.trail.shrink(); f.trail.shrink(); f.trail.update(camera); if (!f.trail.mesh.visible) remove(f); }
        continue;
      }
      f.t += dt;
      if (f.state === 'flying') {
        f.age += dt;
        const p = live.find((x) => x.id === f.id);
        if (p) { f.base.set(p.pos[0], p.pos[1], p.pos[2]); f.vel.set(p.vel[0], p.vel[1], p.vel[2]); }
        else { f.vel.y -= f.gravity * dt; f.base.addScaledVector(f.vel, dt); }
        f.pos.copy(f.base).addScaledVector(f.handOffset, 1 - smooth(0, 0.15, f.age));
        if (f.age > 6 || f.pos.y < -40) { finish(f); continue; }
      } else {
        f.vel.y -= 16 * dt;
        f.pos.addScaledVector(f.vel, dt);
        const floor = f.ground + f.size * 0.3;
        if (f.pos.y < floor && f.vel.y < 0 && f.state === 'debris') {
          f.pos.y = floor;
          f.vel.y *= -Math.min(0.85, f.look.phys.bounciness * 0.8 + (f.weapon.trait === 'bouncy' ? 0.3 : 0));
          if (f.look.weight > 0.45) blast.dust(_w.set(f.pos.x, f.ground, f.pos.z), 0.6 + f.look.weight, 6); // lourd : retombe dans la poussière
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
      render(f, dt, now);
    }
  }

  function render(f: Flight, dt: number, now: number): void {
    f.squash = Math.max(0, f.squash - dt * 6);
    if (f.ring) {
      f.ringAge += dt;
      const u = Math.min(1, f.ringAge / f.ringDur);
      const base = f.kind === 'bolt' ? 0.55 : f.size;
      f.ring.position.copy(f.pos);
      f.ring.scale.setScalar(base * (1.15 + 3.4 * (1 - u) * (1 - u)));
      f.ring.userData.alpha = 0.4 + 0.6 * u;
      f.ring.material.color.set(u > 0.72 ? palette.danger : palette.lumiere);
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
    // Face au défenseur (axe tireur → cible : lisible dans les 2 vues), puis rotation propre selon la FORME réelle :
    // long = bout par-dessus bout, flat = frisbee (à plat, penché vers le défenseur), round = roule face à lui,
    // box = culbute lente, irregular = axe aléatoire qui s'amortit. Vitesse ≈ 1 / √masse.
    let omega = f.omega * (f.state === 'flying' ? 1 : 1.8) * (f.returning ? 1.4 : 1);
    if (f.look.shape === 'irregular') omega *= 0.35 + 0.65 * Math.exp(-1.6 * f.t);
    f.rot.multiply(_qz.setFromAxisAngle(f.spinAxis, f.spinDir * omega * dt));
    if (f.look.shape === 'flat') {
      // Disque couché : normale vers le haut, un peu inclinée vers le défenseur pour que sa vue voie la face.
      _v.copy(UP).addScaledVector(f.axis, 0.55).normalize();
      m.root.quaternion.setFromUnitVectors(Z, _v).multiply(f.rot);
    } else {
      _qt.setFromAxisAngle(X, 0.25 * Math.sin(f.t * 5)); // léger roulis : montre l'épaisseur du carton
      m.root.quaternion.setFromUnitVectors(Z, f.axis).multiply(_qt).multiply(f.rot);
    }
    // Grossit en arrivant sur le défenseur (lisible au moment de parer), sans dépasser une taille lisible ;
    // bouncy : s'écrase comme du caoutchouc.
    let k = f.size;
    if (f.state === 'flying') {
      const d = f.pos.distanceTo(chest(f.target));
      k = Math.min(Math.max(k, WEAPON_FX.physique.tailleMaxApproche), k * (1 + (WEAPON_FX.vol.approche - 1) * (1 - smooth(1.5, 7, d))));
      if (f.weapon.trait === 'bouncy') f.squash = Math.max(f.squash, 0.5 + 0.5 * Math.sin(f.t * 16));
    }
    if (f.state === 'debris' && f.t > 0.8) k *= Math.max(0.001, 1 - (f.t - 0.8) / 0.3); // se décolle
    const sq = f.squash;
    m.root.scale.set(k * (1 + 0.3 * sq), k * (1 - 0.3 * sq), k);
    m.root.position.copy(f.pos);
    // Split : deux copies plus petites s'écartent puis se referment sur l'objet avant l'impact.
    if (f.twins.length) {
      const total = Math.max(0.5, f.start.distanceTo(chest(f.target)));
      const left = f.pos.distanceTo(chest(f.target));
      const spread = 0.55 * smooth(0.04, 0.16, f.age) * smooth(0.6, 2.5, left) * Math.min(1, total / 3);
      _w.crossVectors(f.axis, UP).normalize();
      f.twins.forEach((tw, j) => {
        const s = j === 0 ? 1 : -1;
        tw.root.visible = spread > 0.02;
        tw.root.position.copy(f.pos).addScaledVector(_w, s * spread * 1.4).addScaledVector(UP, 0.25 * spread);
        tw.root.quaternion.copy(m.root.quaternion);
        tw.root.scale.setScalar(k * WEAPON_FX.vol.fragment);
      });
    }
    // Mèche (grenade) : clignote de plus en plus vite jusqu'à l'impact.
    if (f.kind === 'grenade') {
      const fuse = Math.min(1, f.age / 1.0);
      const freq = THREE.MathUtils.lerp(WEAPON_FX.meche.freqMin, WEAPON_FX.meche.freqMax, fuse * fuse);
      const on = Math.sin((now / 1000) * freq * Math.PI * 2) > 0;
      m.glow(on ? palette.danger : palette.lumiere, on ? 0.85 : 0.15);
      if (on && f.state === 'flying' && Math.random() < 0.5) blast.fxAdd.burst(_v.copy(f.pos).addScaledVector(UP, k * 0.5), { count: 1, color: [palette.lumiere, palette.danger], speed: [0.5, 1.5], life: [0.1, 0.25], size: [0.06, 0.12], gravity: 3 });
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
      // Tache d'encre à la taille de l'objet ; plus nette (plus opaque) pour un objet lourd.
      f.shadow.scale.setScalar(WEAPON_FX.vol.ombre * k * (1 + h * 0.06));
      (f.shadow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, rendu.ombres.tache * (0.6 + 1.1 * f.look.weight)) * Math.max(0.25, 1 - h / 10);
    }
  }

  return { update };
}
