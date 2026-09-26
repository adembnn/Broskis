// Persos : place state.players[i].pos dans la scène (personne d'autre ne le fait), fait tourner l'anim/squash,
// et accroche le sticker de l'arme sélectionnée (lot LS) à handslot.r. Écoute le bus pour les à-coups (un clip,
// une impulsion de squash) ; lit ctx.state chaque image pour la position/orientation/idle-vs-run (architecture
// du plan : "les modules lisent l'état central").
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import { LOCAL_TOKENS } from '../localTokens';
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
  const L = LOCAL_TOKENS.locomotion;

  /** Clip de locomotion voulu d'après l'état (sol/air, vitesse) — ne coupe jamais un clip ponctuel. */
  // `transient` : l'impulsion et la réception sont des clips ponctuels qu'on laisse finir ; à leur fin
  // (resumeLocomotion) on repasse à la boucle de l'état courant.
  function locomotionClip(rig: FighterRig, keepTransient = true): string {
    const cur = rig.animator.current;
    if (rig.airborne) {
      if (keepTransient && cur === 'jumpStart') return 'jumpStart';
      return rig.animator.has('jumpAir') ? 'jumpAir' : 'idle';
    }
    // Il repart en courant : la réception s'interrompt tout de suite (Smash ne fige jamais le joueur).
    if (keepTransient && cur === 'jumpLand' && !rig.moving) return 'jumpLand';
    return rig.moving && rig.animator.has('run') ? 'run' : 'idle';
  }

  function resumeLocomotion(rig: FighterRig, fade = 0.15): void {
    rig.animator.play(locomotionClip(rig, false), { fade });
  }

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
    rig.prevTarget.set(pos[0], pos[1], pos[2]);
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
      onFinished: () => resumeLocomotion(rig),
    });
  }

  ctx.bus.on('match:start', () => {
    respawnAll().catch((e) => console.error('[fighters] match:start', e));
  });

  // Saut en 3 temps (pack KayKit) : impulsion jouée vite → boucle en l'air → réception (voir la boucle).
  ctx.bus.on('move:jump', ({ player }) => {
    const rig = rigs[player];
    if (!rig) return;
    rig.animator.bump(juice.action.etirement);
    rig.airborne = true;
    rig.groundedFor = 0;
    rig.minVelY = 0;
    if (rig.animator.has('jumpStart')) {
      rig.animator.play('jumpStart', {
        loop: false, fade: 0.08, speed: L.jumpStartSpeed,
        onFinished: () => resumeLocomotion(rig, 0.12),
      });
    } else {
      rig.animator.play('jump', { loop: false, fade: 0.08, onFinished: () => resumeLocomotion(rig, 0.2) });
    }
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

  // Réapparition (vies, LSMASH) : on se pose net au nouveau point, sans « glisser » depuis la sortie ni
  // rester figé dans le clip de KO.
  ctx.bus.on('respawn', ({ player, pos }) => {
    const rig = rigs[player];
    if (!rig) return;
    rig.container.position.set(pos[0], pos[1], pos[2]);
    rig.prevTarget.set(pos[0], pos[1], pos[2]);
    rig.velXZ.set(0, 0);
    rig.velY = 0;
    rig.airborne = true; // il retombe sur la plateforme de réapparition : la réception jouera
    rig.groundedFor = 0;
    rig.minVelY = 0;
    rig.animator.play(rig.animator.has('jumpAir') ? 'jumpAir' : 'idle', { fade: 0.08 });
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

      // Vitesse réelle (position physique d'une image à l'autre), lissée : pilote course, orientation, saut.
      if (dt > 0) {
        const k = expFollow(dt, L.velSmooth);
        const vx = (tmpTarget.x - rig.prevTarget.x) / dt;
        const vz = (tmpTarget.z - rig.prevTarget.z) / dt;
        const vy = (tmpTarget.y - rig.prevTarget.y) / dt;
        // Téléportation (réapparition, recul d'éjection) : on ne la lit pas comme une course.
        if (Math.hypot(vx, vz) < 30) rig.velXZ.set(rig.velXZ.x + (vx - rig.velXZ.x) * k, rig.velXZ.y + (vz - rig.velXZ.y) * k);
        rig.velY = Math.abs(vy) < 40 ? vy : 0;
      }
      rig.prevTarget.copy(tmpTarget);
      const speed = rig.velXZ.length();
      const dead = ctx.state.players[p].hp <= 0;

      // En l'air / posé : quitte le sol dès qu'il monte ou tombe vite, ne se repose qu'après un court
      // temps immobile verticalement (sinon le sommet du saut passe pour une réception).
      if (Math.abs(rig.velY) > L.airVelY) {
        if (!rig.airborne) rig.minVelY = 0;
        rig.airborne = true;
        rig.groundedFor = 0;
        rig.minVelY = Math.min(rig.minVelY, rig.velY);
      } else if (rig.airborne) {
        rig.groundedFor += dt;
        // Il tombait vite et s'arrête net : c'est le sol, pas le sommet du saut → réception immédiate.
        if (rig.groundedFor >= L.groundHold || rig.minVelY < -L.landFallFast) {
          rig.airborne = false;
          // Réception : écrasement selon la vitesse de chute + clip de réception (si rien de plus important).
          const fall = Math.min(1, -rig.minVelY / L.landFallRef);
          rig.animator.bump(L.landSquashMin + (L.landSquashMax - L.landSquashMin) * fall);
          if (!dead && !rig.animator.isBusy() && rig.animator.has('jumpLand')) {
            rig.animator.play('jumpLand', { loop: false, fade: 0.08, speed: L.landSpeed, onFinished: () => resumeLocomotion(rig) });
          }
        }
      }

      rig.moving = speed > L.runThreshold && !rig.airborne;
      rig.animator.setGroundSpeed(rig.airborne ? 0 : speed);
      const cp = rig.container.position;
      const kxz = expFollow(dt, L.followXZ);
      cp.x += (tmpTarget.x - cp.x) * kxz;
      cp.z += (tmpTarget.z - cp.z) * kxz;
      cp.y += (tmpTarget.y - cp.y) * expFollow(dt, L.followY);

      // Orientation façon Smash : il regarde où il court (demi-tour vif), et se retourne vers l'adversaire
      // à l'arrêt ou pendant une action.
      const busy = rig.animator.isBusy();
      let desired: number;
      let tau: number;
      if (rig.moving && !busy) {
        desired = Math.atan2(rig.velXZ.x, rig.velXZ.y);
        tau = L.turnRun;
      } else {
        const opp = ctx.state.players[opponentOf(p)].pos;
        tmpOpponent.set(opp[0], pos[1], opp[2]);
        desired = Math.atan2(tmpOpponent.x - cp.x, tmpOpponent.z - cp.z);
        tau = busy ? L.turnAction : L.turnIdle;
      }
      rig.facing = angleLerp(rig.facing, desired, expFollow(dt, tau));
      rig.container.rotation.y = rig.facing;

      if (!busy && !dead) {
        const want = locomotionClip(rig);
        if (rig.animator.current !== want && rig.animator.has(want)) rig.animator.play(want, { fade: want === 'run' ? 0.12 : 0.18 });
      }

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
