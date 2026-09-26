// Visée et tir, règles v2 « on comprend en 10 s » : en entrant en visée, la visée se CALE sur l'adversaire ;
// la souris ajuste (au-delà de quelques pixels, avec un aimant près de l'adversaire) ; clic maintenu OU `F`
// maintenu = charge, relâcher = tir. 1/2/3 choisissent l'arme (refusé si elle recharge) — ou l'emplacement Snap
// pendant `snap-time` (voir crate.ts). `aim:update` prévoit trajectoire, impact, recul, éjection.
// Hooks `aim(yaw,pitch)`/`fire(power)` pour les agents de test et l'adversaire IA.
import * as THREE from 'three';
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { chooseSnapSlot } from './crate';
import { previewDamage, previewLaunchSpeed } from './damage';
import { launchVector } from './formulas';
import { predictLaunch } from './launch';
import { noteGesture, setPhase } from './phases';
import { aimOrigin, performFire } from './projectiles';
import { getRuntime, otherPlayer, type PlayerRuntime } from './runtime';
import {
  AIM_CHARGE_MS, AIM_LOCK_BREAK_PX, AIM_MAGNET_M, AIM_OVERHOLD_MS, FIRE_KEY, SHOT_ORIGIN_HEIGHT,
} from './tuning';
import { predictTrajectory } from './trajectory';
import { normalize, normalizeXZ, sub } from './vec3';

const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SHOT_ORIGIN_HEIGHT);
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const DIGIT_KEYS = new Map<string, number>([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Numpad1', 0], ['Numpad2', 1], ['Numpad3', 2]]);
const NICE_PULSE_MS = 400;
const NICE_WINDOW_MS = 100;
let pulsesEmitted = 0;
let lastMouse: [number, number] | null = null;
let lastEjectCheck = { at: 0, key: '', ejects: false };

function currentCharge(rt: PlayerRuntime): number {
  if (!rt.charging) return 0;
  return Math.min(1, (performance.now() - rt.chargeStartMs) / AIM_CHARGE_MS);
}

/** Point visé quand la visée est calée : les pieds de l'adversaire (la grenade y retombe, les tirs droits
 * visent sa poitrine, voir `dirToPoint`). */
function lockedPoint(ctx: Ctx, player: PlayerId): Vec3 {
  const t = ctx.state.players[otherPlayer(player)].pos;
  return [t[0], t[1], t[2]];
}

/** Direction de tir vers un point au sol : horizontale si on vise quelqu'un à la même hauteur (poitrine). */
function dirToPoint(ctx: Ctx, player: PlayerId, point: Vec3): Vec3 {
  const origin = aimOrigin(ctx, player);
  return normalize(sub([point[0], point[1] + 1.0, point[2]], origin));
}

/** Cale la visée sur l'adversaire (début de la phase de visée). */
export function lockAimOnOpponent(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  rt.aimLocked = true;
  rt.aimLockMouse = lastMouse;
  rt.aimPoint = lockedPoint(ctx, player);
  rt.aimDir = dirToPoint(ctx, player, rt.aimPoint);
}

function refreshLockedAim(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  if (!rt.aimLocked) return;
  rt.aimPoint = lockedPoint(ctx, player);
  rt.aimDir = dirToPoint(ctx, player, rt.aimPoint);
}

/** Prévisualisation : trajectoire, impact, recul prévu (vecteur d'éjection), éjection probable. */
function updateAimPreview(ctx: Ctx, player: PlayerId): void {
  const state = ctx.state.players[player];
  const weapon = state.weapons[state.selected];
  if (!weapon) return;
  const rt = getRuntime().players[player];
  refreshLockedAim(ctx, player);
  const power = rt.charging ? currentCharge(rt) : 0.5;
  const origin = aimOrigin(ctx, player);
  const dir = rt.aimDir;
  const traj = predictTrajectory(ctx, player, weapon, origin, dir, power, rt.aimPoint);
  const target = otherPlayer(player);
  let knockback: Vec3 = [0, 0, 0];
  let ejects = false;
  const tp = ctx.state.players[target].pos;
  const splashReach = traj.splashRadius > 0 && Math.hypot(tp[0] - traj.impact[0], tp[2] - traj.impact[2]) <= traj.splashRadius + 0.4;
  const hits = weapon.category === 'grenade' ? splashReach : traj.hitPlayer === target;
  if (hits) {
    const superMods = rt.superReady ? { superDamage: 1.5, superLaunch: 1.8 } : {};
    const mods = { charge: power, burst: 1, ...superMods };
    const damage = previewDamage(ctx, player, weapon, mods);
    const speed = previewLaunchSpeed(ctx, target, weapon, damage, mods);
    const from = traj.splashRadius > 0 ? traj.impact : origin;
    knockback = launchVector(normalizeXZ(sub(tp, from)), speed);
    // Prédiction complète du vol (rayons) : limitée à ~10 par seconde, ou quand la vitesse change nettement.
    const key = `${Math.round(speed * 4)}:${Math.round(tp[0] * 4)}:${Math.round(tp[2] * 4)}`;
    const now = performance.now();
    if (key !== lastEjectCheck.key || now - lastEjectCheck.at > 400) {
      lastEjectCheck = { at: now, key, ejects: predictLaunch(ctx, tp, knockback).kind === 'ko' };
    }
    ejects = lastEjectCheck.ejects;
  }
  ctx.bus.emit('aim:update', { player, dir, power, path: traj.path, impact: traj.impact, knockback, ejects });
}

function setAimFromAngles(ctx: Ctx, player: PlayerId, yawDeg: number, pitchDeg: number): void {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const dir: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const rt = getRuntime().players[player];
  rt.aimDir = normalize(dir);
  rt.aimLocked = false;
  rt.aimPoint = null; // visée par angles (script, IA) : la grenade utilise la charge pour sa portée
  updateAimPreview(ctx, player);
}

/** Entrée en phase de visée : la visée se cale sur l'adversaire. */
function enterAim(ctx: Ctx, player: PlayerId): void {
  if (ctx.state.phase === 'move') setPhase(ctx, 'aim');
  lockAimOnOpponent(ctx, player);
}

function pickWeapon(ctx: Ctx, index: number): void {
  if (index < 0 || index > 2 || !Number.isInteger(index)) return; // valable pour les 2 usages ci-dessous
  if (ctx.state.phase === 'snap-time') { chooseSnapSlot(ctx, index); return; }
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  const player = ctx.state.active;
  const state = ctx.state.players[player];
  const weapon = state.weapons[index];
  if (!weapon || weapon.cooldown > 0) return; // arme en recharge : refusée (l'interface la montre grisée)
  if (getRuntime().players[player].charging) return;
  state.selected = index;
  ctx.bus.emit('weapon:pick', { player, index });
  noteGesture(ctx);
  enterAim(ctx, player);
  updateAimPreview(ctx, player);
}

function aimFromMouse(ctx: Ctx, e: MouseEvent): void {
  lastMouse = [e.clientX, e.clientY];
  if (ctx.state.phase !== 'aim') return;
  const player = ctx.state.active;
  const rt = getRuntime().players[player];
  if (rt.aimLocked) {
    const m0 = rt.aimLockMouse;
    if (!m0) { rt.aimLockMouse = [e.clientX, e.clientY]; return; }
    if (Math.hypot(e.clientX - m0[0], e.clientY - m0[1]) < AIM_LOCK_BREAK_PX) return;
    rt.aimLocked = false; // la souris prend la main
  }
  const rect = ctx.three.canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, ctx.three.camera);
  const origin = aimOrigin(ctx, player);
  aimPlane.constant = -origin[1];
  if (!raycaster.ray.intersectPlane(aimPlane, hitPoint)) return;
  const feetY = ctx.state.players[player].pos[1];
  let point: Vec3 = [hitPoint.x, feetY, hitPoint.z];
  // Aimant : près de l'adversaire, on vise l'adversaire.
  const t = ctx.state.players[otherPlayer(player)].pos;
  if (Math.hypot(point[0] - t[0], point[2] - t[2]) < AIM_MAGNET_M) point = [t[0], t[1], t[2]];
  rt.aimPoint = point;
  rt.aimDir = dirToPoint(ctx, player, point);
  noteGesture(ctx);
  updateAimPreview(ctx, player);
}

/** Début de charge (clic gauche ou F). Depuis la phase de déplacement : passe en visée calée sur l'adversaire. */
function startCharge(ctx: Ctx): void {
  const player = ctx.state.active;
  if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
  const state = ctx.state.players[player];
  const rt = getRuntime().players[player];
  if (rt.charging || rt.dead || rt.launch || rt.ledge) return;
  const weapon = state.weapons[state.selected];
  if (!weapon || weapon.cooldown > 0) return;
  if (ctx.state.phase === 'move') enterAim(ctx, player);
  rt.charging = true;
  rt.chargeStartMs = performance.now();
  pulsesEmitted = 0;
  noteGesture(ctx);
  updateAimPreview(ctx, player);
}

/** Relâchement : tir, avec « NICE! » si on lâche à ±100 ms d'une pulsation (toutes les 400 ms). */
function releaseCharge(ctx: Ctx): void {
  const player = ctx.state.active;
  const rt = getRuntime().players[player];
  if (!rt.charging) return;
  const power = currentCharge(rt);
  const elapsed = performance.now() - rt.chargeStartMs;
  rt.charging = false;
  const nearestPulse = Math.round(elapsed / NICE_PULSE_MS) * NICE_PULSE_MS;
  const nice = nearestPulse > 0 && Math.abs(elapsed - nearestPulse) <= NICE_WINDOW_MS;
  if (nice) ctx.bus.emit('attack:nice', { player });
  refreshLockedAim(ctx, player);
  performFire(ctx, player, power, { nice });
}

export function install(ctx: Ctx): void {
  ctx.three.canvas.addEventListener('mousemove', (e) => aimFromMouse(ctx, e));
  ctx.three.canvas.addEventListener('mousedown', (e) => { if (e.button === 0) startCharge(ctx); });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) releaseCharge(ctx); });
  window.addEventListener('keydown', (e) => {
    if (e.code === FIRE_KEY) {
      if (!e.repeat && (ctx.state.phase === 'move' || ctx.state.phase === 'aim')) { e.preventDefault(); startCharge(ctx); }
      return;
    }
    const idx = DIGIT_KEYS.get(e.code);
    if (idx === undefined) return;
    e.preventDefault();
    pickWeapon(ctx, idx);
  });
  window.addEventListener('keyup', (e) => { if (e.code === FIRE_KEY) releaseCharge(ctx); });
  window.addEventListener('blur', () => { if (getRuntime().players[ctx.state.active].charging) releaseCharge(ctx); });

  ctx.loop.addSystem('gameplay-aim-charge', () => {
    if (ctx.state.phase !== 'aim') return;
    const player = ctx.state.active;
    const rt = getRuntime().players[player];
    if (rt.charging) {
      const elapsed = performance.now() - rt.chargeStartMs;
      const pulses = Math.floor(elapsed / NICE_PULSE_MS);
      if (pulses > pulsesEmitted) { pulsesEmitted = pulses; ctx.bus.emit('feint', { player }); } // pulsation (repère NICE, LK2)
      if (elapsed > AIM_CHARGE_MS + AIM_OVERHOLD_MS) { releaseCharge(ctx); return; } // jamais de blocage
    }
    updateAimPreview(ctx, player);
  }, 60);

  ctx.hooks.pickWeapon = (index) => pickWeapon(ctx, index);
  ctx.hooks.aim = (yawDeg, pitchDeg) => {
    const player = ctx.state.active;
    if (ctx.state.phase !== 'move' && ctx.state.phase !== 'aim') return;
    if (ctx.state.phase === 'move') setPhase(ctx, 'aim');
    setAimFromAngles(ctx, player, yawDeg, pitchDeg);
    noteGesture(ctx);
  };
  ctx.hooks.fire = (power) => {
    const player = ctx.state.active;
    if (ctx.state.phase === 'move') enterAim(ctx, player); // tir direct par script : visée calée d'abord
    performFire(ctx, player, power);
  };
}
