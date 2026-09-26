// Le mur-bouclier : l'objet scanné grandit en sticker géant à la taille EXACTE du collider du gameplay
// (largeur = stat b, hauteur = stat a, projectiles.ts), monte du sol avec un rebond et soulève de la poussière.
// Touché : étincelles + vacillement. Disparaît en se décollant quand son temps est écoulé (RT.shieldLifeS) ou
// à la revanche.
import * as THREE from 'three';
import type { Ctx, PlayerId, Vec3, Weapon } from '../../core/types';
import { lerp } from '../../gameplay/trajectory';
import { RT, SHIELD_HEIGHT_MAX, SHIELD_HEIGHT_MIN, SHIELD_WIDTH_MAX, SHIELD_WIDTH_MIN } from '../../gameplay/tuning';
import { excludeFromOcclusion } from '../registry';
import type { BlastFx } from './blast';
import { WEAPON_FX } from './tokens';
import { WeaponModel } from './visual';

interface Wall {
  owner: PlayerId;
  model: WeaponModel;
  base: THREE.Vector3;
  yaw: number;
  width: number;
  height: number;
  t: number;
  wobble: number;
  wobbleV: number;
  life: number;
  leaving: number;
}

const _l = new THREE.Vector3();
const _inv = new THREE.Matrix4();

export function installShields(ctx: Ctx, blast: BlastFx) {
  const root = new THREE.Group();
  root.name = 'latk-murs';
  ctx.three.scene.add(root);
  excludeFromOcclusion(root);
  const walls: Wall[] = [];

  function place(player: PlayerId, weapon: Weapon, pos: Vec3): void {
    const width = lerp(SHIELD_WIDTH_MIN, SHIELD_WIDTH_MAX, weapon.stats.b);
    const height = lerp(SHIELD_HEIGHT_MIN, SHIELD_HEIGHT_MAX, weapon.stats.a);
    const me = ctx.state.players[player].pos;
    const yaw = Math.atan2(pos[0] - me[0], pos[2] - me[2]);
    const base = new THREE.Vector3(pos[0], pos[1] - height / 2, pos[2]);
    const model = new WeaponModel(weapon);
    root.add(model.root);
    // Durée de vie = celle du collider (RT.shieldLifeS, en temps de jeu comme dans combat.ts).
    walls.push({ owner: player, model, base, yaw, width, height, t: 0, wobble: 0, wobbleV: 0, life: RT.shieldLifeS, leaving: 0 });
    blast.dust(base, width * 0.6 + 0.6, 18);
    blast.fxAdd.burst(base.clone().setY(base.y + 0.2), { count: 10, color: [weapon.palette[0], weapon.palette[1]], speed: [2, 5], life: [0.3, 0.6], size: [0.1, 0.2], gravity: 8 });
  }

  /** Un objet arrive en `pos` : si c'est sur un mur, étincelles et vacillement. */
  function arrived(pos: THREE.Vector3, weapon: Weapon, shooter: PlayerId): void {
    for (const w of walls) {
      if (w.leaving > 0) continue;
      w.model.root.updateMatrixWorld();
      _inv.makeRotationY(-w.yaw);
      _l.copy(pos).sub(w.base).applyMatrix4(_inv);
      if (Math.abs(_l.z) > 0.7 || Math.abs(_l.x) > w.width / 2 + 0.35 || _l.y < -0.3 || _l.y > w.height + 0.4) continue;
      blast.sparks(pos, weapon.palette, 14, new THREE.Vector3(Math.sin(w.yaw), 0.4, Math.cos(w.yaw)).multiplyScalar(w.owner === shooter ? 1 : -1));
      blast.flash(pos, 0.5);
      w.wobbleV += (w.owner === shooter ? 1 : -1) * WEAPON_FX.mur.vacille * 30;
    }
  }

  function clear(): void {
    for (const w of walls) w.model.dispose();
    walls.length = 0;
  }

  ctx.bus.on('shield:placed', ({ player, weapon, pos }) => {
    try { place(player, weapon, pos); } catch (e) { console.error('[weapons] shield:placed', e); }
  });
  ctx.bus.on('match:start', clear);

  function update(dt: number): void {
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i];
      w.t += dt;
      if (w.t > w.life && w.leaving === 0) w.leaving = 0.001;
      if (w.leaving > 0) {
        w.leaving += dt;
        if (w.leaving > WEAPON_FX.mur.montee / 1000) { w.model.dispose(); walls.splice(i, 1); continue; }
      }
      // Ressort de vacillement (bascule autour du pied).
      w.wobbleV += (-w.wobble * 90 - w.wobbleV * 9) * dt;
      w.wobble += w.wobbleV * dt;
      // Montée : 0 → dépassement → 1 (easeOutBack), puis décollage à la fin.
      const u = Math.min(1, w.t / (WEAPON_FX.mur.montee / 1000));
      const c = WEAPON_FX.mur.depassement;
      let rise = u < 1 ? 1 + (c + 0.7) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2) : 1;
      if (w.leaving > 0) rise *= Math.max(0.001, 1 - w.leaving / (WEAPON_FX.mur.montee / 1000));
      // Le sticker couvre exactement la surface du collider (le mur qu'on voit est le mur qui bloque).
      const m = w.model;
      const r = m.root;
      r.rotation.set(w.wobble, w.yaw, 0, 'YXZ');
      r.scale.set(w.width / Math.max(0.05, m.size.x), (w.height / Math.max(0.05, m.size.y)) * rise, 3);
      r.position.copy(w.base).setY(w.base.y + (w.height / 2) * rise);
    }
  }

  return { update, arrived, clear };
}
