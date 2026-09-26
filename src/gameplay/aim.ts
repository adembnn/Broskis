// Visée et tir : souris (rayon caméra → plan à hauteur de tir) ou hooks `aim(yaw,pitch)`/`fire(power)`
// pour les agents de test. 1/2/3 choisissent l'arme (ou l'emplacement Snap pendant `snap-time`, voir crate.ts).
// Le clic maintenu charge 0→1 en AIM_CHARGE_MS ; `aim:update` prévoit trajectoire, impact, recul, éjection.
import * as THREE from 'three';
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { chooseSnapSlot } from './crate';
import { computeDamage, computeKnockbackMagnitude } from './damage';
import { armFirstGestureTimer, setPhase } from './phases';
import { aimOrigin, performFire } from './projectiles';
import { getRuntime, otherPlayer, type PlayerRuntime } from './runtime';
import { AIM_CHARGE_MS, EJECT_KNOCKBACK_THRESHOLD, KNOCKBACK_UP_RATIO, SHOT_ORIGIN_HEIGHT, getParryWindow } from './tuning';
import { predictTrajectory } from './trajectory';
import { normalize, normalizeXZ, sub } from './vec3';

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SHOT_ORIGIN_HEIGHT);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const DIGIT_KEYS = new Map<string, number>([['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]);
const feintsEmitted = new Map<PlayerId, number>();

function currentCharge(rt: PlayerRuntime): number {
  if (!rt.charging) return 0;
  return Math.min(1, (performance.now() - rt.chargeStartMs) / AIM_CHARGE_MS);
}

function updateAimPreview(ctx: Ctx, player: PlayerId): void {
  const state = ctx.state.players[player];
  const weapon = state.weapons[state.selected];
  if (!weapon) return;
  const rt = getRuntime().players[player];
  const power = currentCharge(rt);
  const origin = aimOrigin(ctx, player);
  const dir = rt.aimDir;
  const traj = predictTrajectory(ctx, player, weapon, origin, dir, power);
  const target = otherPlayer(player);
  let knockback: Vec3 = [0, 0, 0];
  let ejects = false;
  if (traj.hitPlayer === target || traj.splashRadius > 0) {
    const { damage } = computeDamage(ctx, player, weapon);
    const magnitude = computeKnockbackMagnitude(ctx, target, weapon, damage);
    const dirXZ = normalizeXZ(sub(ctx.state.players[target].pos, origin));
    knockback = [dirXZ[0] * magnitude, magnitude * KNOCKBACK_UP_RATIO, dirXZ[2] * magnitude];
    ejects = magnitude > EJECT_KNOCKBACK_THRESHOLD;
  }
  ctx.bus.emit('aim:update', { player, dir, power, path: traj.path, impact: traj.impact, knockback, ejects });
}

function setAimFromAngles(ctx: Ctx, player: PlayerId, yawDeg: number, pitchDeg: number): void {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const dir: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  getRuntime().players[player].aimDir = normalize(dir);
  updateAimPreview(ctx, player);
}

function pickWeapon(ctx: Ctx, index: number): void {
  if (index < 0 || index > 2 || !Number.isInteger(index)) return; // valable pour les 2 usages ci-dessous
  if (ctx.state.phase === 'snap-time') { chooseSnapSlot(ctx, index); return; }
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  const player = ctx.state.active;
  ctx.state.players[player].selected = index;
  ctx.bus.emit('weapon:pick', { player, index });
  armFirstGestureTimer(ctx);
  if (ctx.state.phase === 'move') setPhase(ctx, 'aim');
  updateAimPreview(ctx, player);
}

function aimFromMouse(ctx: Ctx, e: MouseEvent): void {
  const player = ctx.state.active;
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  const rect = ctx.three.canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, ctx.three.camera);
  if (!raycaster.ray.intersectPlane(aimPlane, hitPoint)) return;
  const origin = aimOrigin(ctx, player);
  getRuntime().players[player].aimDir = normalize(sub([hitPoint.x, hitPoint.y, hitPoint.z], origin));
  updateAimPreview(ctx, player);
}

function onMouseDown(ctx: Ctx, e: MouseEvent): void {
  if (e.button !== 0) return;
  const player = ctx.state.active;
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  const state = ctx.state.players[player];
  const weapon = state.weapons[state.selected];
  if (!weapon || weapon.cooldown > 0) return;
  const rt = getRuntime().players[player];
  rt.charging = true;
  rt.chargeStartMs = performance.now();
  feintsEmitted.set(player, 0);
  armFirstGestureTimer(ctx);
  if (ctx.state.phase === 'move') setPhase(ctx, 'aim');
}

function handleFireNice(ctx: Ctx, player: PlayerId, power: number, elapsed: number): void {
  const nearestPulse = Math.round(elapsed / 400) * 400;
  const dist = Math.abs(elapsed - nearestPulse);
  
  if (nearestPulse > 0 && dist <= 100) {
    ctx.bus.emit('attack:nice', { player });
    
    const weapon = ctx.state.players[player].weapons[ctx.state.players[player].selected];
    if (weapon) {
      const originalA = weapon.stats.a;
      weapon.stats.a = originalA * 1.25;
      
      const restore = () => {
        weapon.stats.a = originalA;
        ctx.bus.off('turn:end', restore);
        ctx.bus.off('match:end', restore);
      };
      ctx.bus.on('turn:end', restore);
      ctx.bus.on('match:end', restore);
    }
  }
  
  performFire(ctx, player, power);
}

function onMouseUp(ctx: Ctx, e: MouseEvent): void {
  if (e.button !== 0) return;
  const player = ctx.state.active;
  const rt = getRuntime().players[player];
  if (!rt.charging) return;
  const power = currentCharge(rt);
  const elapsed = performance.now() - rt.chargeStartMs;
  rt.charging = false;
  handleFireNice(ctx, player, power, elapsed);
}

export function install(ctx: Ctx): void {
  ctx.three.canvas.addEventListener('mousemove', (e) => aimFromMouse(ctx, e));
  ctx.three.canvas.addEventListener('mousedown', (e) => onMouseDown(ctx, e));
  window.addEventListener('mouseup', (e) => onMouseUp(ctx, e));
  window.addEventListener('keydown', (e) => {
    const idx = DIGIT_KEYS.get(e.code);
    if (idx === undefined) return;
    e.preventDefault();
    pickWeapon(ctx, idx);
  });
  ctx.loop.addSystem('gameplay-aim-charge', () => {
    const player = ctx.state.active;
    const rt = getRuntime().players[player];
    if (rt.charging) {
      const elapsed = performance.now() - rt.chargeStartMs;
      const feintCount = Math.floor(elapsed / 400);
      const emitted = feintsEmitted.get(player) || 0;
      
      if (feintCount > emitted) {
        const win = getParryWindow(ctx.state.turn);
        if (feintCount > win.feints) {
          rt.charging = false;
          handleFireNice(ctx, player, currentCharge(rt), elapsed);
          return;
        } else {
          ctx.bus.emit('feint', { player });
          feintsEmitted.set(player, feintCount);
        }
      }
      updateAimPreview(ctx, player);
    }
  }, 60);

  ctx.hooks.pickWeapon = (index) => pickWeapon(ctx, index);
  ctx.hooks.aim = (yawDeg, pitchDeg) => {
    const player = ctx.state.active;
    if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
    setAimFromAngles(ctx, player, yawDeg, pitchDeg);
    armFirstGestureTimer(ctx);
  };
  ctx.hooks.fire = (power) => performFire(ctx, ctx.state.active, power);
}
