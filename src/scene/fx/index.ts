// Orchestre les effets (contrat LA §6) : particules par catégorie d'arme, onomatopée-sticker, flash + chiffres
// de dégâts, onde de parade, mur-sticker posé (shield), avertissement/atterrissage de la caisse Snap, lumière
// de victoire (juice.victoire.lumiere). Écoute le bus ; ne lit/n'écrit aucune position de perso directement
// (ça, c'est fighters/).
import * as THREE from 'three';
import { juice, rendu, ui } from '../../art/tokens.js';
import type { Category, Ctx, PlayerId } from '../../core/types';
import { cameraShake } from '../api';
import { LOCAL_TOKENS } from '../localTokens';
import { excludeFromOcclusion } from '../registry';
import { makeFallbackSticker, makeSticker } from '../sticker';
import { teamColorLight } from '../team';
import { installImpactFx } from './impact';
import { installOnomato } from './onomato';
import { ParticleBurstSystem } from './particles';

const CATEGORY_GRAVITY: Record<Category, number> = { blaster: 1, grenade: -1, throwable: 2, shield: 0 };

function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

export function installFx(ctx: Ctx): void {
  const { scene, renderer, camera } = ctx.three;
  const fxAdd = new ParticleBurstSystem(LOCAL_TOKENS.particles.maxAdditive, 'additive');
  const fxNorm = new ParticleBurstSystem(LOCAL_TOKENS.particles.maxNormal, 'normal');
  scene.add(fxAdd.points, fxNorm.points);
  excludeFromOcclusion(fxAdd.points);
  excludeFromOcclusion(fxNorm.points);
  fxAdd.resize(renderer, camera);
  fxNorm.resize(renderer, camera);
  window.addEventListener('resize', () => { fxAdd.resize(renderer, camera); fxNorm.resize(renderer, camera); });

  const impact = installImpactFx(scene);
  const onomato = installOnomato(ctx);

  const shieldStickers: [THREE.Object3D | null, THREE.Object3D | null] = [null, null];
  function clearShield(player: PlayerId): void {
    shieldStickers[player]?.removeFromParent();
    shieldStickers[player] = null;
  }

  // Alerte caisse Snap : disque pulsant (ombre annoncée), ui.alerte. Un seul à la fois (une caisse en vol).
  const crateWarn = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 24),
    new THREE.MeshBasicMaterial({ color: ui.alerte, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  crateWarn.rotation.x = -Math.PI / 2;
  crateWarn.visible = false;
  crateWarn.raycast = () => {};
  scene.add(crateWarn);
  excludeFromOcclusion(crateWarn);

  ctx.bus.on('match:start', () => { clearShield(0); clearShield(1); crateWarn.visible = false; });

  ctx.bus.on('fire', ({ player, weapon }) => {
    const pos = ctx.state.players[player].pos;
    const p = new THREE.Vector3(pos[0], pos[1] + 1, pos[2]);
    fxAdd.burst(p, { count: 10, color: weapon.palette, speed: [1, 3], life: [0.15, 0.3], size: [0.08, 0.16], gravity: 1 });
  });

  ctx.bus.on('hit', ({ target, weapon, damage, crit, pos }) => {
    const p = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const count = crit ? juice.critique.particules : juice.toucher.particules;
    fxAdd.burst(p, { count, color: [...weapon.palette, '#ffffff'], speed: [2, crit ? 8 : 5], life: [0.25, 0.55], size: [0.12, 0.3], gravity: CATEGORY_GRAVITY[weapon.category] ?? 1 });
    impact.hitFlash(target);
    impact.damageNumber(p.clone().setY(p.y + 1), damage, weapon.palette[0]);
    onomato.spawn(weapon.category, pos, weapon.palette[0]);
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    if (grade === 'miss') return;
    const j = grade === 'perfect' ? juice.parfaite : juice.parade;
    const p = ctx.state.players[player].pos;
    impact.shockwave(new THREE.Vector3(p[0], 0.5, p[2]), rendu.contour.encre, j.onde);
  });

  ctx.bus.on('shield:placed', ({ player, weapon, pos }) => {
    clearShield(player);
    (async () => {
      let group: THREE.Object3D;
      try {
        group = weapon.stickerUrl ? await makeSticker(weapon.stickerUrl, { height: 1.4 }) : makeFallbackSticker(weapon.category, weapon.palette);
      } catch (e) { console.error('[fx] shield sticker', e); group = makeFallbackSticker(weapon.category, weapon.palette); }
      group.position.set(pos[0], 0.9, pos[2]);
      const towardCenter = Math.atan2(-pos[0], -pos[2]);
      group.rotation.y = towardCenter;
      scene.add(group);
      excludeFromOcclusion(group);
      shieldStickers[player] = group;
    })().catch((e) => console.error('[fx] shield:placed', e));
  });

  ctx.bus.on('crate:warn', ({ pos }) => {
    crateWarn.position.set(pos[0], 0.03, pos[2]);
    crateWarn.visible = true;
  });

  ctx.bus.on('crate:land', ({ pos }) => {
    crateWarn.visible = false;
    const p = new THREE.Vector3(pos[0], 0.2, pos[2]);
    fxNorm.burst(p, { count: 22, color: ['#cfae86', '#efe0c4'], speed: [1.5, 4], life: [0.5, 1], size: [0.2, 0.4], gravity: 6 });
    cameraShake(0.15); // pas de ligne dédiée dans `juice` pour cet impact ; léger, cohérent avec juice.action.trauma
  });

  ctx.bus.on('ko', ({ player }) => {
    clearShield(player);
    const winner = other(player);
    const from = new THREE.Color(scene.background instanceof THREE.Color ? scene.background.getHex() : 0x000000);
    const to = new THREE.Color(teamColorLight(winner));
    const dur = juice.victoire.lumiere;
    const start = performance.now();
    const anim = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const mixed = from.clone().lerp(to, t);
      if (scene.background instanceof THREE.Color) scene.background.copy(mixed);
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(mixed);
      if (t < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  });

  ctx.loop.addSystem('la-fx', (dt) => {
    fxAdd.update(dt);
    fxNorm.update(dt);
    impact.update(dt);
  }, 400);
}
