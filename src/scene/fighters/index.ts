// Persos : place state.players[i].pos dans la scène (personne d'autre ne le fait), fait tourner l'anim/squash,
// et accroche le sticker de l'arme sélectionnée (lot LS) à handslot.r. Écoute le bus pour les à-coups (un clip,
// une impulsion de squash) ; lit ctx.state chaque image pour la position/orientation/idle-vs-run (architecture
// du plan : "les modules lisent l'état central").
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { Category, Ctx, PlayerId, Weapon } from '../../core/types';
import { angleLerp, expFollow } from '../mathUtils';
import { setFighterObject, setHandSlot } from '../registry';
import { makeFallbackSticker, makeSticker } from '../sticker';
import { applyVinylRank, buildFighterRig, defaultFighter, disposeFighterRig, type FighterRig } from './rig';

const CATEGORY_ANIM: Record<Category, string> = {
  blaster: 'cast',
  grenade: 'throw',
  throwable: 'throw',
  shield: 'block',
};

export interface FighterSystem {
  getRig(player: PlayerId): FighterRig | null;
}

function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function installFighters(ctx: Ctx): FighterSystem {
  const rigs: [FighterRig | null, FighterRig | null] = [null, null];
  const tmpTarget = new THREE.Vector3();
  const tmpOpponent = new THREE.Vector3();

  async function attachWeaponSticker(player: PlayerId): Promise<void> {
    const rig = rigs[player];
    const slot = rig?.handSlotR;
    if (!rig || !slot) return;
    for (const child of [...slot.children]) if (child.userData.isWeaponSticker) child.removeFromParent();
    const ps = ctx.state.players[player];
    const weapon: Weapon | undefined = ps.weapons[ps.selected];
    if (!weapon) return;
    let group: THREE.Object3D;
    try {
      group = weapon.stickerUrl
        ? await makeSticker(weapon.stickerUrl, { height: 0.5 })
        : makeFallbackSticker(weapon.category, weapon.palette);
    } catch (e) {
      console.error('[fighters] sticker', e);
      group = makeFallbackSticker(weapon.category, weapon.palette);
    }
    group.userData.isWeaponSticker = true;
    group.rotation.set(0, Math.PI / 2, -Math.PI / 2);
    group.position.set(0, 0.06, 0.08);
    slot.add(group);
  }

  async function spawn(player: PlayerId): Promise<void> {
    const def = ctx.state.players[player].fighter ?? defaultFighter(player);
    const rig = await buildFighterRig(def, player, ctx);
    rigs[player] = rig;
    const pos = ctx.state.players[player].pos;
    rig.container.position.set(pos[0], pos[1], pos[2]);
    rig.facing = player === 0 ? Math.PI / 2 : -Math.PI / 2;
    rig.container.rotation.y = rig.facing;
    ctx.three.scene.add(rig.container);
    setFighterObject(player, rig.container);
    setHandSlot(player, rig.handSlotR);
    await attachWeaponSticker(player);
  }

  async function respawnAll(): Promise<void> {
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (rig) disposeFighterRig(rig);
      rigs[p] = null;
    }
    await Promise.all([spawn(0), spawn(1)]);
  }

  function playOneShot(rig: FighterRig, clip: string, squash: number): void {
    rig.animator.bump(squash);
    rig.animator.play(clip, {
      loop: false,
      fade: 0.08,
      onFinished: () => rig.animator.play(rig.moving ? 'run' : 'idle', { fade: 0.15 }),
    });
  }

  ctx.bus.on('match:start', () => {
    respawnAll().catch((e) => console.error('[fighters] match:start', e));
  });

  ctx.bus.on('move:update', ({ player }) => {
    const rig = rigs[player];
    if (rig?.animator.has('run')) rig.animator.play('run', { fade: 0.15 });
  });

  ctx.bus.on('move:jump', ({ player }) => {
    const rig = rigs[player];
    if (!rig) return;
    rig.animator.bump(juice.action.etirement);
    rig.animator.play('jump', {
      loop: false,
      fade: 0.05,
      onFinished: () => rig.animator.play(rig.moving ? 'run' : 'idle', { fade: 0.2 }),
    });
  });

  ctx.bus.on('weapon:pick', ({ player }) => {
    attachWeaponSticker(player).catch((e) => console.error('[fighters] weapon:pick', e));
  });

  ctx.bus.on('fire', ({ player, weapon }) => {
    const rig = rigs[player];
    if (rig) playOneShot(rig, CATEGORY_ANIM[weapon.category] ?? 'cast', juice.action.squash);
  });

  ctx.bus.on('shield:placed', ({ player }) => {
    const rig = rigs[player];
    if (rig) playOneShot(rig, 'block', juice.action.squash);
  });

  ctx.bus.on('hit', ({ target, crit }) => {
    const rig = rigs[target];
    if (rig) playOneShot(rig, crit && rig.animator.has('hitB') ? 'hitB' : 'hit', juice.toucher.squash);
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    const rig = rigs[player];
    if (rig && grade !== 'miss') playOneShot(rig, 'block', grade === 'perfect' ? 0.85 : 0.92);
  });

  ctx.bus.on('ko', ({ player }) => {
    rigs[player]?.animator.play('death', { loop: false, fade: 0.1 });
  });

  ctx.loop.addSystem('la-fighters', (dt) => {
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (!rig) continue;
      const pos = ctx.state.players[p].pos;
      tmpTarget.set(pos[0], pos[1], pos[2]);
      const dist = tmpTarget.distanceTo(rig.container.position);
      rig.moving = dist > 0.02 && ctx.state.active === p && ctx.state.phase === 'move';
      rig.container.position.lerp(tmpTarget, expFollow(dt, 0.12));

      const opp = ctx.state.players[opponentOf(p)].pos;
      tmpOpponent.set(opp[0], pos[1], opp[2]);
      const desired = Math.atan2(tmpOpponent.x - rig.container.position.x, tmpOpponent.z - rig.container.position.z);
      rig.facing = angleLerp(rig.facing, desired, expFollow(dt, 0.15));
      rig.container.rotation.y = rig.facing;

      if (rig.moving && rig.animator.has('run')) rig.animator.play('run', { fade: 0.2 });
      else if (!rig.moving && rig.animator.has('idle')) rig.animator.play('idle', { fade: 0.2 });

      rig.animator.update(dt, rig.squashWrapper);
    }

    // Règle 2 (DA) : coques vinyle intercalées du plus loin au plus proche de la caméra, sinon la marge du
    // perso de devant est mangée par le corps de celui de derrière.
    const [r0, r1] = rigs;
    if (r0 && r1) {
      const camPos = ctx.three.camera.position;
      const d0 = r0.container.position.distanceToSquared(camPos);
      const d1 = r1.container.position.distanceToSquared(camPos);
      applyVinylRank(r0, d0 >= d1 ? 0 : 1);
      applyVinylRank(r1, d1 > d0 ? 0 : 1);
    }
  }, 200);

  ctx.hooks.animPlay = (player, action) => {
    const rig = rigs[player];
    if (rig) {
      if (action.toLowerCase().includes('ko') || action.toLowerCase().includes('death')) {
        rig.animator.play('death', { loop: false, fade: 0.1 });
      } else if (action === 'blaster') {
        rig.animator.play('cast', { loop: false, fade: 0.1 });
      } else if (action === 'hitFront') {
        rig.animator.play('hit', { loop: false, fade: 0.05 });
      } else if (action === 'hitBack') {
        rig.animator.play('hitB', { loop: false, fade: 0.05 });
      } else if (action === 'parry') {
        rig.animator.play('block', { loop: false, fade: 0.05 });
      } else {
        rig.animator.play(action, { loop: true, fade: 0.1 });
      }
    }
  };

  return { getRig: (p) => rigs[p] };
}
