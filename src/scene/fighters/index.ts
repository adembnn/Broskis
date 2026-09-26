// Persos (lots LA, LFLUID, LATK2) : place state.players[i].pos dans la scène (personne d'autre ne le fait),
// fait tourner l'animateur, et traduit le jeu en mouvements du corps :
// - course fondue calée sur la vitesse réelle ; visée verrouillée = course de côté ou à reculons ;
// - attaques sur le HAUT DU CORPS (lancer, tir, pose du bouclier, garde) : les jambes gardent la course ;
// - coups reçus directionnels, vrille d'éjection, accroché au bord, moulinet au bord du vide, salto du
//   double saut, réapparition, victoire.
// Temps réel (plan/PIVOT-TEMPS-REEL.md) : `charge`, `blocking` et l'événement `block` sont lus s'ils existent
// (contrat en cours de fusion) ; sinon repli sur le runtime du gameplay, en lecture seule (window.__lsmash).
// L'objet en main, les projectiles et les impacts sont au lot LATK1 (src/scene/weapons) : il trouve la main
// via registry.handSlots et se cale sur `anim:release`, émis ici à l'image exacte du lâcher.
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { Ctx, PlayerId, Vec3, Weapon } from '../../core/types';
import { ANIM } from '../animation/animTokens';
import { animMetricsImpl } from '../animation/metrics';
import { loadPack, packData } from '../animation/pack';
import { LOCAL_TOKENS } from '../localTokens';
import { angleDelta, angleLerp, easeInOutCubic, expFollow } from '../mathUtils';
import { setFighterObject, setHandSlot } from '../registry';
import { applyVinylRank, buildFighterRig, defaultFighter, disposeFighterRig, type FighterRig } from './rig';

export interface FighterSystem {
  getRig(player: PlayerId): FighterRig | null;
}

/** Vue en lecture seule du runtime gameplay (règles v2), exposée par src/gameplay/hooks.ts. */
interface RuntimeView {
  charging?: boolean;
  launch?: { vel: Vec3 } | null;
  ledge?: { edge: Vec3; inward: Vec3 } | null;
}
interface LsmashDebug { runtime?(p: PlayerId): unknown; arena?(): unknown }

function lsmash(): LsmashDebug | undefined {
  return (window as unknown as { __lsmash?: LsmashDebug }).__lsmash;
}

function runtimeOf(p: PlayerId): RuntimeView | null {
  try { return (lsmash()?.runtime?.(p) as RuntimeView | undefined) ?? null; } catch { return null; }
}

function arenaCenter(): Vec3 {
  try {
    const c = (lsmash()?.arena?.() as { center?: Vec3 } | undefined)?.center;
    return c ?? [0, 0, 0];
  } catch { return [0, 0, 0]; }
}

function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

/** Clip d'attaque (haut du corps) par catégorie. */
const ATTACK_CLIP = { grenade: 'throwP', throwable: 'throwP', shield: 'slam', blaster: 'aim1h' } as const;

/** Durée (s) de la remontée au bord et du salto du double saut. */
const CLIMB_S = 0.34;
const FLIP_S = 0.42;

export function installFighters(ctx: Ctx): FighterSystem {
  const rigs: [FighterRig | null, FighterRig | null] = [null, null];
  const tmpTarget = new THREE.Vector3();
  const tmpOpponent = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const lookTargets = [new THREE.Vector3(), new THREE.Vector3()];
  const voidDirs = [new THREE.Vector3(), new THREE.Vector3()];
  /** Dernière puissance vue dans `aim:update` (repli tour par tour quand `charge` n'existe pas). */
  const lastPower: [number, number] = [0, 0];
  /** Garde tenue d'après l'événement `block` (temps réel). */
  const blockOn: [boolean, boolean] = [false, false];
  const L = LOCAL_TOKENS.locomotion;
  loadPack().catch(() => { /* déjà journalisé : les clips du perso suffisent */ });

  // ------------------------------------------------------------------ lectures d'état

  function chargeOf(p: PlayerId): number {
    const ps = ctx.state.players[p] as unknown as { charge?: number };
    if (typeof ps.charge === 'number') return ps.charge;
    return runtimeOf(p)?.charging ? Math.max(0.05, lastPower[p]) : 0;
  }

  function isBlocking(p: PlayerId): boolean {
    const ps = ctx.state.players[p] as unknown as { blocking?: boolean };
    return ps.blocking === true || blockOn[p];
  }

  function selectedWeapon(p: PlayerId): Weapon | undefined {
    const ps = ctx.state.players[p];
    return ps.weapons[ps.selected];
  }

  // ------------------------------------------------------------------ locomotion (LFLUID + course directionnelle)

  /** Clip de locomotion voulu d'après l'état (sol/air, vitesse, visée verrouillée) ; vitesse de lecture. */
  function locomotionClip(rig: FighterRig, keepTransient = true): string {
    const a = rig.animator;
    const cur = a.current;
    if (rig.airborne) {
      if (keepTransient && (cur === 'jumpStart' || cur === 'dodgeF')) return cur;
      return a.has('jumpAir') ? 'jumpAir' : 'idle';
    }
    // Il repart en courant : la réception s'interrompt tout de suite (Smash ne fige jamais le joueur).
    if (keepTransient && cur === 'jumpLand' && !rig.moving) return 'jumpLand';
    if (!rig.moving || !a.has('run')) return 'idle';
    if (!rig.locked) return 'run';
    // Visée verrouillée : les jambes suivent la direction réelle du déplacement par rapport au regard.
    const rel = angleDelta(rig.facing, Math.atan2(rig.velXZ.x, rig.velXZ.y));
    if (Math.abs(rel) < 0.9) return 'run';
    if (Math.abs(rel) > 2.3) return a.pick('backpedal', 'run');
    return rel > 0 ? a.pick('strafeL', 'run') : a.pick('strafeR', 'run');
  }

  function resumeLocomotion(rig: FighterRig, fade = 0.15): void {
    rig.animator.play(locomotionClip(rig, false), { fade });
  }

  /** Vitesse de lecture d'un clip de course directionnelle : pieds calés sur la vitesse réelle. */
  function directionalRate(name: string, speed: number): number | null {
    const nat = packData()?.speeds.get(name);
    if (!nat) return null;
    return THREE.MathUtils.clamp(speed / (nat * LOCAL_TOKENS.fighterScale), 0.6, 2.2);
  }

  // ------------------------------------------------------------------ apparition

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
  }

  async function respawnAll(): Promise<void> {
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (rig) disposeFighterRig(rig);
      rigs[p] = null;
      blockOn[p] = false;
    }
    await Promise.all([spawn(0), spawn(1)]);
  }

  function resetBody(rig: FighterRig): void {
    const b = rig.body;
    b.spinRate = 0; b.spinAngle = 0; b.flipT = -1; b.climbT = -1; b.teeter = false; b.upper = null; b.outcome = null;
    rig.pivot.rotation.set(0, 0, 0);
    rig.animator.stopUpper(0.05);
  }

  ctx.bus.on('match:start', () => {
    respawnAll().catch((e) => console.error('[fighters] match:start', e));
  });

  // ------------------------------------------------------------------ saut (LFLUID) + salto du double saut

  ctx.bus.on('move:jump', ({ player }) => {
    const rig = rigs[player];
    if (!rig) return;
    const a = rig.animator;
    a.bump(juice.action.etirement);
    const second = rig.airborne;
    rig.airborne = true;
    rig.groundedFor = 0;
    rig.minVelY = 0;
    if (second) {
      // Double saut : salto avant en l'air, bras et jambes groupés.
      rig.body.flipT = 0;
      if (!a.isBusy()) a.play(a.pick('dodgeF', 'jumpStart'), { loop: false, fade: 0.06, speed: 1.4, onFinished: () => resumeLocomotion(rig, 0.12) });
      return;
    }
    if (a.has('jumpStart')) {
      a.play('jumpStart', { loop: false, fade: 0.08, speed: L.jumpStartSpeed, onFinished: () => resumeLocomotion(rig, 0.12) });
    } else {
      a.play('jump', { loop: false, fade: 0.08, onFinished: () => resumeLocomotion(rig, 0.2) });
    }
  });

  // ------------------------------------------------------------------ attaques (haut du corps)

  function onRelease(player: PlayerId, weapon: Weapon, hand: Vec3): void {
    const rig = rigs[player];
    ctx.bus.emit('anim:release', { player, weapon, handPos: hand });
    animMetricsImpl.addEvent({ t: Date.now(), player, kind: 'release', handPos: hand });
    // Le corps se détend d'un coup : petit étirement (lancer) ou écrasement (objet planté au sol).
    rig?.animator.bump(weapon.category === 'shield' ? juice.action.squash : 1.12);
  }

  function endAttack(rig: FighterRig): void {
    rig.body.upper = null;
    if (isBlocking(rig === rigs[0] ? 0 : 1)) startGuard(rig);
    else rig.animator.stopUpper(ANIM.fondu.retour);
  }

  /** Pose de charge : le clip d'attaque figé à la fin de l'élan (tremblement et torsion : couche procédurale). */
  function startChargePose(rig: FighterRig, weapon: Weapon): void {
    const a = rig.animator;
    rig.body.upper = 'charge';
    if (weapon.category === 'blaster') {
      a.playUpper(a.pick('aim1h', 'cast'), { loop: true, fade: 0.12 });
      return;
    }
    const clip = ATTACK_CLIP[weapon.category];
    const keys = a.keys(clip);
    if (keys && a.has(clip)) a.playUpper(clip, { holdAt: keys.windup, fade: 0.16 });
  }

  function startGuard(rig: FighterRig): void {
    const a = rig.animator;
    rig.body.upper = 'guard';
    // Garde levée tout de suite : fondu de 40 ms vers la pose tenue (< 50 ms exigés).
    a.playUpper(a.pick('guardHold', 'block'), { loop: true, fade: ANIM.fondu.garde });
  }

  ctx.bus.on('fire', ({ player, weapon }) => {
    const rig = rigs[player];
    if (!rig) return;
    const a = rig.animator;
    rig.body.upper = 'attack';
    if (weapon.category === 'blaster') {
      // Bras tendu vers l'adversaire pendant toute la rafale ; le recul arrive à chaque projectile.
      if (a.upperName !== 'aim1h') a.playUpper(a.pick('aim1h', 'cast'), { loop: true, fade: 0.06 });
      rig.body.burstUntil = performance.now() + 450 + ANIM.tir.tenueApres * 1000;
      return;
    }
    const clip = ATTACK_CLIP[weapon.category];
    const keys = a.keys(clip);
    const done = () => endAttack(rig);
    if (!keys || !a.has(clip)) {
      // Pack pas encore chargé : clip du perso, lâcher au pic habituel.
      const fallback = weapon.category === 'shield' ? 'block' : 'throw';
      const d = a.duration(fallback) || 1;
      a.playUpper(fallback, { fade: 0.06, mark: { at: d * 0.42, fn: (h) => onRelease(player, weapon, h) }, onFinished: done });
      return;
    }
    const mark = { at: keys.release, fn: (h: Vec3) => onRelease(player, weapon, h) };
    const ts = ANIM.lancer.vitesseDetente;
    if (a.upperName === clip && a.upperHolding) {
      a.resumeUpper(ts, mark, done); // la charge était tenue : le bras part comme un ressort
    } else {
      // Tir sans charge : on reprend juste avant la fin de l'élan (≥ 140 ms d'élan avant le lâcher).
      const from = Math.max(0, Math.min(keys.windup, keys.release - ANIM.lancer.elanMin * ts));
      a.playUpper(clip, { from, timeScale: ts, fade: 0.05, mark, onFinished: done });
    }
  });

  // Recul à chaque projectile du blaster (le tireur est celui qui possède l'arme).
  ctx.bus.on('projectile:spawn', ({ weapon }) => {
    if (weapon.category !== 'blaster') return;
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (!rig || !ctx.state.players[p].weapons.includes(weapon)) continue;
      rig.animator.kickRecoil(1);
      rig.body.burstUntil = performance.now() + ANIM.tir.tenueApres * 1000;
    }
  });

  ctx.bus.on('aim:update', ({ player, power }) => { lastPower[player] = power; });

  // ------------------------------------------------------------------ défense

  const busAny = ctx.bus as unknown as { on(name: string, fn: (e: { player: PlayerId; on: boolean }) => void): void };
  busAny.on('block', ({ player, on }) => {
    blockOn[player] = on;
    const rig = rigs[player];
    if (!rig || rig.body.outcome) return;
    if (on && rig.body.upper !== 'attack') startGuard(rig);
    else if (!on && rig.body.upper === 'guard') { rig.body.upper = null; rig.animator.stopUpper(0.12); }
  });

  ctx.bus.on('parry:result', ({ player, grade }) => {
    const rig = rigs[player];
    if (!rig || grade === 'miss') return;
    const a = rig.animator;
    rig.body.upper = 'react';
    const back = () => { rig.body.upper = null; if (isBlocking(player)) startGuard(rig); else a.stopUpper(0.15); };
    if (grade === 'perfect') {
      // Contre : coup d'épaule sec vers l'attaquant, corps qui se ramasse puis se détend.
      a.playUpper(a.pick('guardCounter', 'block'), { fade: 0.03, timeScale: 1.25, onFinished: back });
      a.bump(0.86);
    } else {
      a.playUpper(a.pick('guardHit', 'block'), { fade: 0.03, onFinished: back });
      const opp = rigs[opponentOf(player)];
      if (opp) a.kickWhip(tmpDir.subVectors(rig.container.position, opp.container.position).normalize(), ANIM.parade.recul);
    }
  });

  // ------------------------------------------------------------------ coups reçus, éjection

  ctx.bus.on('hit', ({ target, knockback, launch, damage }) => {
    const rig = rigs[target];
    if (!rig) return;
    const a = rig.animator;
    const v = launch ?? knockback;
    const kb = tmpDir.set(v[0], v[1], v[2]);
    const speed = kb.length();
    if (speed > 1e-4) kb.multiplyScalar(1 / speed);
    animMetricsImpl.addEvent({ t: Date.now(), player: target, kind: 'hit-react', durationMs: 0 });
    const whip = Math.min(ANIM.coup.fouetMax, ANIM.coup.fouetParPct * Math.max(4, damage));
    if (isBlocking(target) && speed < ANIM.coup.vrilleDes) {
      // Coup encaissé en garde : la garde plie, les jambes tiennent.
      rig.body.upper = 'react';
      a.playUpper(a.pick('guardHit', 'block'), { fade: 0.03, onFinished: () => { rig.body.upper = null; if (isBlocking(target)) startGuard(rig); else a.stopUpper(0.15); } });
      a.kickWhip(kb, whip * 0.5);
      return;
    }
    rig.body.upper = null;
    a.stopUpper(0.05);
    a.kickWhip(kb, whip);
    a.bump(juice.toucher.squash);
    if (speed > ANIM.coup.vrilleDes) {
      // Éjection : il part à reculons en vrille (salto arrière), plus vite si l'éjection est forte.
      rig.body.spinRate = -ANIM.coup.vrilleTours * Math.PI * 2 * Math.min(2.2, speed / 10);
      rig.body.flipT = -1;
      rig.facing = Math.atan2(-kb.x, -kb.z);
      a.play(a.pick('hitB', 'hit'), { loop: false, fade: ANIM.fondu.reaction, onFinished: () => a.play(a.pick('jumpAir', 'idle'), { fade: 0.15 }) });
      return;
    }
    // Coup directionnel : repoussé vers l'arrière = touché de face (tête qui part en arrière), sinon de dos.
    const fwdX = Math.sin(rig.facing), fwdZ = Math.cos(rig.facing);
    const fromFront = kb.x * fwdX + kb.z * fwdZ < 0;
    a.play(fromFront ? a.pick('hit') : a.pick('hitB', 'hit'), { loop: false, fade: ANIM.fondu.reaction, restart: true, onFinished: () => resumeLocomotion(rig) });
  });

  // ------------------------------------------------------------------ bord : accroché, remontée, déséquilibre

  ctx.bus.on('ledge:grab', ({ player }) => {
    const rig = rigs[player];
    if (!rig) return;
    rig.body.spinRate = 0;
    rig.body.upper = null;
    rig.animator.stopUpper(0.06);
    rig.animator.play(rig.animator.pick('jumpAir', 'idle'), { fade: 0.08 });
    rig.animator.bump(1.12);
  });

  ctx.bus.on('ledge:climb', ({ player }) => {
    const rig = rigs[player];
    if (!rig) return;
    rig.body.climbT = 0;
    rig.body.climbFromY = rig.container.position.y;
    rig.animator.play(rig.animator.pick('jumpStart', 'jumpAir'), { loop: false, fade: 0.06, speed: 1.6 });
  });

  ctx.bus.on('teeter', ({ player, on }) => {
    const rig = rigs[player];
    if (rig) rig.body.teeter = on;
  });

  // ------------------------------------------------------------------ vies, réapparition, fin

  ctx.bus.on('stock:lost', ({ player }) => {
    const rig = rigs[player];
    if (rig) resetBody(rig);
  });

  // Réapparition : on se pose net au nouveau point (sans glisser depuis la sortie), entrée « tombée du ciel ».
  ctx.bus.on('respawn', ({ player, pos }) => {
    const rig = rigs[player];
    if (!rig) return;
    resetBody(rig);
    rig.container.position.set(pos[0], pos[1], pos[2]);
    rig.prevTarget.set(pos[0], pos[1], pos[2]);
    rig.velXZ.set(0, 0);
    rig.velY = 0;
    rig.airborne = true; // il retombe sur la plateforme : la réception jouera
    rig.groundedFor = 0;
    rig.minVelY = 0;
    const a = rig.animator;
    a.play(a.pick('spawnAir', 'jumpAir'), { loop: false, fade: 0.08, onFinished: () => resumeLocomotion(rig) });
  });

  ctx.bus.on('ko', ({ player }) => {
    rigs[player]?.animator.play('death', { loop: false, fade: 0.1 });
  });

  ctx.bus.on('match:end', ({ winner }) => {
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (!rig) continue;
      const a = rig.animator;
      rig.body.spinRate = 0;
      rig.body.upper = null;
      a.stopUpper(0.1);
      rig.body.outcome = p === winner ? 'win' : 'lose';
      if (p === winner) { a.play(a.pick('cheering', 'cheer'), { loop: true, fade: 0.2 }); a.bump(1.15); }
      else a.play(a.pick('deathB', 'death'), { loop: false, fade: 0.15 });
    }
  });

  // ------------------------------------------------------------------ image

  ctx.loop.addSystem('la-fighters', (dt) => {
    const now = performance.now();
    for (const p of [0, 1] as const) {
      const rig = rigs[p];
      if (!rig) continue;
      const a = rig.animator;
      const b = rig.body;
      const ps = ctx.state.players[p];
      const rt = runtimeOf(p);
      const pos = ps.pos;
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
      const dead = ps.hp <= 0;
      const hanging = ps.onLedge;
      const tumbling = b.spinRate !== 0;

      // En l'air / posé : quitte le sol dès qu'il monte ou tombe vite, ne se repose qu'après un court
      // temps immobile verticalement (sinon le sommet du saut passe pour une réception).
      if (hanging) {
        rig.airborne = false;
      } else if (Math.abs(rig.velY) > L.airVelY) {
        if (!rig.airborne) rig.minVelY = 0;
        rig.airborne = true;
        rig.groundedFor = 0;
        rig.minVelY = Math.min(rig.minVelY, rig.velY);
      } else if (rig.airborne) {
        rig.groundedFor += dt;
        // Il tombait vite et s'arrête net : c'est le sol, pas le sommet du saut → réception immédiate.
        if (rig.groundedFor >= L.groundHold || rig.minVelY < -L.landFallFast) {
          rig.airborne = false;
          const fall = Math.min(1, -rig.minVelY / L.landFallRef);
          a.land(L.landSquashMin + (L.landSquashMax - L.landSquashMin) * fall);
          b.flipT = -1;
          if (!dead && !tumbling && !a.isBusy() && a.has('jumpLand')) {
            a.play('jumpLand', { loop: false, fade: 0.08, speed: L.landSpeed, onFinished: () => resumeLocomotion(rig) });
          }
        }
      }

      // Fin de la vrille : le vol est fini (runtime) ou, sans runtime, il a repris pied.
      if (tumbling) {
        const flying = rt ? !!rt.launch : rig.airborne;
        if (!flying && !hanging) {
          b.spinRate = 0;
          a.land(juice.toucher.squash);
          a.play(a.pick('jumpLand', 'idle'), { loop: false, fade: 0.06, speed: L.landSpeed, onFinished: () => resumeLocomotion(rig) });
        } else {
          b.spinAngle += b.spinRate * dt;
        }
      }
      if (b.spinRate === 0 && b.spinAngle !== 0) {
        // Se remet droit par le chemin le plus court (tour complet le plus proche).
        const target = Math.round(b.spinAngle / (Math.PI * 2)) * Math.PI * 2;
        b.spinAngle += (target - b.spinAngle) * expFollow(dt, hanging ? 0.03 : 0.07);
        if (Math.abs(target - b.spinAngle) < 0.01) b.spinAngle = 0;
      }
      let flip = 0;
      if (b.flipT >= 0) {
        b.flipT += dt;
        flip = easeInOutCubic(Math.min(1, b.flipT / FLIP_S)) * Math.PI * 2;
        if (b.flipT >= FLIP_S) b.flipT = -1;
      }
      rig.pivot.rotation.set(b.spinAngle + flip, 0, 0);

      // Visée verrouillée : charge, attaque, garde → face à l'adversaire, même en courant.
      const charge = chargeOf(p);
      const blocking = isBlocking(p);
      rig.locked = !b.outcome && !tumbling && !hanging && (charge > 0 || blocking || a.upperName !== null);

      rig.moving = speed > L.runThreshold && !rig.airborne && !hanging;
      a.setGroundSpeed(rig.airborne ? 0 : speed);
      const cp = rig.container.position;
      if (cp.distanceToSquared(tmpTarget) > 9) cp.copy(tmpTarget); // téléportation : pas de glissade à travers l'arène
      const kxz = expFollow(dt, L.followXZ);
      cp.x += (tmpTarget.x - cp.x) * kxz;
      cp.z += (tmpTarget.z - cp.z) * kxz;
      if (b.climbT >= 0) {
        // Remontée au bord : le corps se hisse en arc (dépasse un peu, puis se pose).
        b.climbT += dt;
        const u = Math.min(1, b.climbT / CLIMB_S);
        const overshoot = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
        cp.y = b.climbFromY + (tmpTarget.y - b.climbFromY) * overshoot;
        if (u >= 1) { b.climbT = -1; cp.y = tmpTarget.y; a.land(0.8); a.play(a.pick('jumpLand', 'idle'), { loop: false, fade: 0.06, speed: L.landSpeed, onFinished: () => resumeLocomotion(rig) }); }
      } else {
        cp.y += (tmpTarget.y - cp.y) * expFollow(dt, L.followY);
      }

      // Orientation.
      const busy = a.isBusy();
      const opp = ctx.state.players[opponentOf(p)].pos;
      let desired = rig.facing;
      let tau: number = L.turnIdle;
      if (hanging) {
        const inward = rt?.ledge?.inward;
        if (inward) desired = Math.atan2(inward[0], inward[2]);
        tau = 0.05;
      } else if (tumbling) {
        tau = 1e9; // cap figé pendant le vol (posé au coup)
      } else if (rig.locked || (!rig.moving && !busy)) {
        tmpOpponent.set(opp[0], pos[1], opp[2]);
        desired = Math.atan2(tmpOpponent.x - cp.x, tmpOpponent.z - cp.z);
        tau = rig.locked || busy ? L.turnAction : L.turnIdle;
      } else if (rig.moving) {
        desired = Math.atan2(rig.velXZ.x, rig.velXZ.y);
        tau = L.turnRun;
      }
      rig.facing = angleLerp(rig.facing, desired, expFollow(dt, tau));
      rig.container.rotation.y = rig.facing;

      // Clip de base.
      if (!busy && !dead && !b.outcome && !tumbling && b.climbT < 0) {
        const want = hanging ? a.pick('jumpAir', 'idle') : locomotionClip(rig);
        if (a.current !== want && a.has(want)) a.play(want, { fade: want === 'run' ? 0.12 : 0.18 });
        const rate = want === 'strafeL' || want === 'strafeR' || want === 'backpedal' ? directionalRate(want, speed) : null;
        if (rate !== null) a.setBaseRate(rate);
      }

      // Charge : pose tenue qui tremble ; relâchée sans tir → retour.
      const weapon = selectedWeapon(p);
      if (charge > 0 && weapon && b.upper === null && !tumbling && !hanging) startChargePose(rig, weapon);
      if (charge <= 0 && b.upper === 'charge') { b.upper = null; a.stopUpper(0.15); }
      if (weapon?.category === 'blaster' && b.upper === 'attack' && a.upperName === 'aim1h' && now > b.burstUntil) endAttack(rig);

      // Couche procédurale.
      const pr = a.proc;
      const oppRig = rigs[opponentOf(p)];
      const look = lookTargets[p];
      if (oppRig) look.copy(oppRig.container.position).add(tmpDir.set(0, 1.15, 0));
      else look.set(opp[0], opp[1] + 1.15, opp[2]);
      pr.lookAt = look;
      pr.lookWeight = tumbling || hanging || b.outcome || b.teeter ? 0 : rig.locked ? 0.9 : rig.moving ? 0 : 0.55;
      pr.charge = b.upper === 'charge' ? (weapon?.category === 'blaster' ? charge * 0.4 : charge) : 0;
      pr.hang = hanging;
      if (b.teeter && !hanging && !rig.moving) {
        const c = arenaCenter();
        pr.teeter = voidDirs[p].set(cp.x - c[0], 0, cp.z - c[2]).normalize();
      } else pr.teeter = null;

      a.update(dt, rig.squashWrapper);
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

  // ------------------------------------------------------------------ banc d'animation (npm run anim)

  /** Coup simulé (banc) : même chemin que l'événement `hit`, sans toucher au gameplay. */
  function fakeHit(player: PlayerId, fromFront: boolean, launchSpeed: number): void {
    const rig = rigs[player];
    if (!rig) return;
    const s = fromFront ? -1 : 1;
    const dir: Vec3 = [Math.sin(rig.facing) * s, 0.45, Math.cos(rig.facing) * s];
    const ps = ctx.state.players[player];
    const w = ps.weapons[0];
    if (!w) return;
    ctx.bus.emit('hit', {
      target: player, attacker: opponentOf(player), weapon: w, damage: 12, crit: false, pos: ps.pos,
      knockback: [dir[0] * launchSpeed, dir[1] * launchSpeed, dir[2] * launchSpeed],
      launch: [dir[0] * launchSpeed, dir[1] * launchSpeed, dir[2] * launchSpeed],
    });
  }

  ctx.hooks.animPlay = (player, action) => {
    const rig = rigs[player];
    if (!rig) return;
    const a = rig.animator;
    const w = selectedWeapon(player);
    switch (action as string) {
      case 'throw': if (w) startChargePose(rig, { ...w, category: w.category === 'blaster' || w.category === 'shield' ? 'grenade' : w.category }); break;
      case 'blaster': if (w) startChargePose(rig, { ...w, category: 'blaster' }); break;
      case 'shield': if (w) ctx.bus.emit('fire', { player, weapon: { ...w, category: 'shield' }, dir: [0, 0, 1], power: 1 }); break;
      case 'hitFront': fakeHit(player, true, 3); break;
      case 'hitBack': fakeHit(player, false, 3); break;
      case 'ko': case 'eject': fakeHit(player, true, 14); break;
      case 'teeter': rig.body.teeter = true; break;
      case 'parry': blockOn[player] = true; startGuard(rig); break;
      case 'victory': ctx.bus.emit('match:end', { winner: player }); break;
      case 'walk': case 'run': case 'idle': a.play(action, { fade: 0.1 }); break;
      default: if (a.has(action)) a.play(action, { loop: true, fade: 0.1 });
    }
  };

  // Accès de mise au point (banc LATK2, tools/anim) : jamais utilisé par le jeu.
  (window as unknown as { __fighters?: unknown }).__fighters = { rigs, fakeHit, blockOn };

  return { getRig: (p) => rigs[p] };
}
