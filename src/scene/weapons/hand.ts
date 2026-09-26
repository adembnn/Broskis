// L'objet en main : sticker de l'arme choisie dans la main droite (handslot.r), ≈ 0,5 m, qui change avec l'arme.
// Pendant la charge : tremble et luit de plus en plus. Blaster : recul, éclair de bouche, douilles.
// Suit la main par position/orientation MONDE (pas d'enfant du squelette) : indépendant de l'échelle du rig.
import * as THREE from 'three';
import { palette } from '../../art/tokens.js';
import type { Ctx, PlayerId, Weapon } from '../../core/types';
import { getRuntime } from '../../gameplay/runtime';
import { registry } from '../registry';
import { excludeFromOcclusion } from '../registry';
import { WEAPON_FX } from './tokens';
import { WeaponModel } from './visual';

interface Held {
  model: WeaponModel | null;
  weaponId: string;
  hidden: boolean;
  pop: number;
  power: number;
  kick: number;
  flash: THREE.Sprite;
  flashT: number;
  aim: THREE.Vector3;
}

interface Casing { active: boolean; t: number; pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; ground: number }

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _o = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// Orientation de l'objet dans la main (reprise de l'ancien affichage validé du lot LA, fighters/index.ts).
const HOLD_ROT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -Math.PI / 2));
const HOLD_OFFSET = new THREE.Vector3(0, 0.06, 0.08);

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 22 : 62;
    const a = (i / 16) * Math.PI * 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function installHands(ctx: Ctx) {
  const { scene } = ctx.three;
  const root = new THREE.Group();
  root.name = 'latk-main';
  scene.add(root);
  excludeFromOcclusion(root);
  const star = starTexture();

  const held: [Held, Held] = [0, 1].map(() => {
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flash.visible = false; flash.raycast = () => {};
    root.add(flash);
    return { model: null, weaponId: '', hidden: false, pop: 1, power: 0, kick: 0, flash, flashT: 1, aim: new THREE.Vector3(1, 0, 0) };
  }) as [Held, Held];

  // Douilles colorées : petites boîtes qui sautent de la main et rebondissent.
  const casingN = WEAPON_FX.tir.douilles;
  const casingMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.11), new THREE.MeshToonMaterial({ color: '#ffffff' }), casingN);
  casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  casingMesh.frustumCulled = false;
  casingMesh.raycast = () => {};
  root.add(casingMesh);
  const casings: Casing[] = Array.from({ length: casingN }, () => ({ active: false, t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), ground: 0 }));
  for (let i = 0; i < casingN; i++) { casingMesh.setColorAt(i, _c.set('#ffffff')); casingMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); }

  function selected(p: PlayerId): Weapon | undefined {
    const ps = ctx.state.players[p];
    return ps.weapons[ps.selected];
  }

  /** Position et orientation monde de la main (ou repli devant le perso). */
  function handFrame(p: PlayerId, pos: THREE.Vector3, quat: THREE.Quaternion): boolean {
    const slot = registry.handSlots[p];
    if (slot && slot.parent) {
      slot.getWorldPosition(pos);
      slot.getWorldQuaternion(quat);
      slot.getWorldScale(_s);
      _o.copy(HOLD_OFFSET).multiplyScalar(_s.x).applyQuaternion(quat);
      pos.add(_o);
      quat.multiply(HOLD_ROT);
      return true;
    }
    const fighter = registry.fighterRoots[p];
    if (!fighter) return false;
    fighter.getWorldPosition(pos);
    fighter.getWorldQuaternion(quat);
    _o.set(-0.35, 1.0, 0.3).applyQuaternion(quat);
    pos.add(_o);
    return true;
  }

  function rebuild(p: PlayerId): void {
    const h = held[p];
    h.model?.dispose();
    h.model = null;
    const w = selected(p);
    h.weaponId = w?.id ?? '';
    if (!w) return;
    h.model = new WeaponModel(w);
    root.add(h.model.root);
    h.pop = 0;
  }

  function show(p: PlayerId): void {
    const h = held[p];
    if (!h.hidden) return;
    h.hidden = false;
    h.pop = 0;
  }

  ctx.bus.on('match:start', () => { for (const p of [0, 1] as const) { held[p].hidden = false; held[p].weaponId = '#'; } });
  ctx.bus.on('weapon:pick', ({ player }) => { held[player].hidden = false; held[player].weaponId = '#'; });
  ctx.bus.on('turn:start', () => { show(0); show(1); });
  ctx.bus.on('respawn', ({ player }) => show(player));
  ctx.bus.on('aim:update', ({ player, power, dir }) => {
    held[player].power = getRuntime()?.players?.[player]?.charging ? power : 0;
    held[player].aim.set(dir[0], dir[1], dir[2]).normalize();
  });
  ctx.bus.on('fire', ({ player, weapon, dir }) => {
    held[player].power = 0;
    held[player].aim.set(dir[0], dir[1], dir[2]).normalize();
    if (weapon.category === 'shield') held[player].hidden = true; // l'objet devient le mur
  });

  function handPos(p: PlayerId, muzzle: boolean): THREE.Vector3 | null {
    const h = held[p];
    if (!h.model || !h.model.root.visible) {
      if (!handFrame(p, _p, _q)) return null;
      return _p.clone();
    }
    const out = h.model.root.position.clone();
    if (muzzle) out.addScaledVector(h.aim, WEAPON_FX.main.taille * 0.6);
    return out;
  }

  function released(p: PlayerId): void {
    held[p].hidden = true;
  }

  function shot(p: PlayerId, weapon: Weapon): void {
    const h = held[p];
    h.kick = 1;
    h.flashT = 0;
    const tip = handPos(p, true);
    if (tip) {
      h.flash.position.copy(tip);
      (h.flash.material as THREE.SpriteMaterial).color.set(palette.lumiere).lerp(_c.set(weapon.palette[0]), 0.35);
      (h.flash.material as THREE.SpriteMaterial).rotation = Math.random() * Math.PI;
      // Douille : éjectée sur le côté, vers le haut.
      const c = casings.find((x) => !x.active) ?? casings[0];
      const i = casings.indexOf(c);
      const side = new THREE.Vector3().crossVectors(h.aim, UP).normalize();
      c.active = true; c.t = 0;
      c.pos.copy(tip).addScaledVector(h.aim, -0.3);
      c.vel.copy(side).multiplyScalar(1.6 + Math.random()).addScaledVector(UP, 2.6 + Math.random()).addScaledVector(h.aim, -0.6);
      c.rot.set(Math.random() * 3, Math.random() * 3, 0);
      c.spin.set(12 + Math.random() * 8, 6, 9);
      c.ground = ctx.state.players[p].pos[1];
      casingMesh.setColorAt(i, _c.set(weapon.palette[casings.indexOf(c) % 2]));
      if (casingMesh.instanceColor) casingMesh.instanceColor.needsUpdate = true;
    }
  }

  function update(dt: number, real: number): void {
    const t = performance.now() / 1000;
    for (const p of [0, 1] as const) {
      const h = held[p];
      const w = selected(p);
      if ((w?.id ?? '') !== h.weaponId) rebuild(p);
      const m = h.model;
      if (!m) continue;
      const rt = getRuntime()?.players?.[p];
      const fighter = registry.fighterRoots[p];
      const alive = !rt?.dead && !!fighter && fighter.visible && fighter.scale.x > 0.2;
      const ok = alive && handFrame(p, _p, _q);
      m.root.visible = ok && !h.hidden;
      if (!m.root.visible) continue;
      h.pop = Math.min(1, h.pop + real * 1000 / WEAPON_FX.main.pop);
      const pop = h.pop < 1 ? 1 + 0.25 * Math.sin(h.pop * Math.PI) : 1;
      // Charge : tremble et luit. Temps réel : `charge` (0..1) dans l'état du joueur ; sinon charge du tour.
      const live = (ctx.state.players[p] as { charge?: number }).charge;
      const k = typeof live === 'number' ? Math.max(0, Math.min(1, live)) : rt?.charging ? h.power : 0;
      m.glow(palette.lumiere, k * WEAPON_FX.main.lueur);
      const amp = WEAPON_FX.main.tremble * k;
      if (amp > 0) _p.add(_o.set(Math.sin(t * 91) * amp, Math.sin(t * 77 + 1) * amp, Math.cos(t * 83) * amp));
      // Recul du blaster : l'objet part en arrière le long de la visée et se cabre.
      h.kick = Math.max(0, h.kick - real * 9);
      if (h.kick > 0) {
        _p.addScaledVector(h.aim, -WEAPON_FX.tir.recul * h.kick);
        _q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().crossVectors(h.aim, UP).normalize(), -WEAPON_FX.tir.reculAngle * h.kick));
      }
      m.root.position.copy(_p);
      m.root.quaternion.copy(_q);
      m.root.scale.setScalar(WEAPON_FX.main.taille * pop * (1 + 0.12 * k));
      // Éclair de bouche : 70 ms.
      h.flashT += real;
      const fu = h.flashT / 0.07;
      h.flash.visible = fu < 1;
      if (h.flash.visible) h.flash.scale.setScalar(WEAPON_FX.tir.eclair * (1 - fu * 0.6));
    }
    // Douilles
    for (let i = 0; i < casings.length; i++) {
      const c = casings[i];
      if (!c.active) continue;
      c.t += dt;
      if (c.t > 1.6) { c.active = false; casingMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      c.vel.y -= 14 * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < c.ground + 0.03 && c.vel.y < 0) { c.pos.y = c.ground + 0.03; c.vel.y *= -0.4; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.4); }
      c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
      const s = c.t > 1.3 ? (1.6 - c.t) / 0.3 : 1;
      _m.compose(c.pos, _q.setFromEuler(c.rot), _s.setScalar(s));
      casingMesh.setMatrixAt(i, _m);
    }
    casingMesh.instanceMatrix.needsUpdate = true;
  }

  return { update, handPos, released, shot, show };
}
