// Moteur de règles ABSTRAIT pour le simulateur d'équilibrage (tools/balance/sim.ts), règles v2 façon Smash :
// arène = disque plat de rayon R, persos = points 2D, mêmes formules que le jeu (formulas.ts : %, vitesse
// d'éjection, intégration du vol), rattrapage au bord et zones d'explosion identiques. Pur : ni ctx ni Rapier.
import type { Rng } from '../core/rng';
import type { ParryGrade, PlayerId, Weapon } from '../core/types';
import { damagePct, launchSpeed, NO_MODS, stepFlightVelocity, horizontalSpeed, type FlightBody, type ShotMods } from './formulas.ts';
import * as T from './tuning.ts';
import { MOVE_BUDGET } from '../core/state.ts';

export interface SimPlayer {
  id: PlayerId;
  pct: number;
  stocks: number;
  hpMax: number;
  power: number;
  weapons: Weapon[];
  cooldowns: number[];
  x: number;
  z: number;
  parryStreak: number;
  bro: number;
  superReady: boolean;
  invulnUntilTurn: number;
  onLedge: boolean;
}

export interface SimState {
  turn: number;
  active: PlayerId;
  players: [SimPlayer, SimPlayer];
  winner: PlayerId | null;
  suddenDeath: boolean;
  radius: number;
  /** % de la victime au moment de chaque éjection, et tour où elle arrive. */
  kos: { pct: number; turn: number; sd: boolean; super: boolean }[];
  supersFired: number;
  firstSuperTurn: number | null;
  ledgeGrabs: number;
  hitsLanded: number;
  pctDealt: number;
}

export interface ParryInput { timingMs?: number; hasInput?: boolean }
export type SimAction = {
  move: 'stay' | 'center' | 'flank' | 'random';
  weaponIdx: number;
  charge: number;
  /** 0..1 : qualité de visée (1 = visée calée parfaite). */
  aim: number;
  nice: boolean;
  parry: () => ParryInput;
};

export function createSimState(p0: Omit<SimPlayer, 'x' | 'z' | 'id'>, p1: Omit<SimPlayer, 'x' | 'z' | 'id'>, radius = 9, spawnGap = 9.5): SimState {
  return {
    turn: 1, active: 0, winner: null, suddenDeath: false, radius,
    players: [{ ...p0, id: 0, x: -spawnGap / 2, z: 0 }, { ...p1, id: 1, x: spawnGap / 2, z: 0 }],
    kos: [], supersFired: 0, firstSuperTurn: null, ledgeGrabs: 0, hitsLanded: 0, pctDealt: 0,
  };
}

function parryGrade(input: ParryInput, turn: number): ParryGrade {
  if (!input.hasInput || input.timingMs === undefined) return 'miss';
  const win = T.getParryWindow(turn);
  const a = Math.abs(input.timingMs);
  if (a <= win.perfectMs) return 'perfect';
  if (a <= win.goodMs) return 'good';
  return 'miss';
}

function gainBro(p: SimPlayer, amount: number): void {
  if (p.superReady) return;
  p.bro = Math.min(100, p.bro + amount);
  if (p.bro >= 100) p.superReady = true;
}

type Outcome = { kind: 'land'; x: number; z: number } | { kind: 'ledge'; x: number; z: number } | { kind: 'ko' };

/** Même intégration que le jeu (launch.ts) sur un disque plat de rayon R, hauteur 0. */
export function simulateFlight(x: number, z: number, vel: [number, number, number], R: number): Outcome {
  const b: FlightBody = { pos: [x, 0, z], vel: [...vel], grounded: false };
  const dt = 1 / 60;
  for (let t = 0; t < 5; t += dt) {
    stepFlightVelocity(b, dt);
    const nx = b.pos[0] + b.vel[0] * dt, ny = b.pos[1] + b.vel[1] * dt, nz = b.pos[2] + b.vel[2] * dt;
    const r = Math.hypot(nx, nz);
    const overGround = r <= R;
    if (overGround && ny <= 0 && b.pos[1] >= -0.05 && b.vel[1] <= 0) { b.pos = [nx, 0, nz]; b.grounded = true; b.vel = [b.vel[0], 0, b.vel[2]]; }
    else { b.pos = [nx, ny, nz]; if (!overGround) b.grounded = false; }
    if (b.pos[1] < T.RINGOUT_Y || b.pos[1] > T.BLAST_TOP || r > R + T.BLAST_SIDE_MARGIN) return { kind: 'ko' };
    if (b.grounded && horizontalSpeed(b.vel) < T.LAUNCH_END_SPEED) return { kind: 'land', x: b.pos[0], z: b.pos[2] };
    if (!b.grounded && b.vel[1] < 0 && b.pos[1] < -T.LEDGE_MIN_BELOW && b.pos[1] > -T.LEDGE_MAX_BELOW
      && r - R <= T.LEDGE_GRAB_DIST + T.CHARACTER_RADIUS) {
      const k = (R - 0.7) / (r || 1);
      return { kind: 'ledge', x: b.pos[0] * k, z: b.pos[2] * k };
    }
  }
  return { kind: 'ko' };
}

function loseStock(s: SimState, victim: SimPlayer, superShot: boolean): void {
  s.kos.push({ pct: victim.pct, turn: s.turn, sd: s.suddenDeath, super: superShot });
  victim.stocks -= 1;
  if (victim.stocks <= 0) { s.winner = victim.id === 0 ? 1 : 0; return; }
  victim.pct = s.suddenDeath ? T.SUDDEN_DEATH_PCT : 0;
  victim.x = 0; victim.z = 0; victim.onLedge = false;
  victim.invulnUntilTurn = s.active === victim.id ? s.turn + 2 : s.turn + 1;
}

/** Un coup (un tir de rafale, une grenade, un objet) qui a touché : %, recul, vol, issue. */
function landHit(s: SimState, rng: Rng, att: SimPlayer, def: SimPlayer, w: Weapon, mods: ShotMods, fromX: number, fromZ: number): void {
  if (def.invulnUntilTurn >= s.turn) return;
  const crit = rng() < T.CRIT_CHANCE_V2;
  const m = { ...mods, crit };
  const dmg = damagePct(w, att.power, m, T.CRIT_MULT_V2);
  def.pct += dmg;
  s.hitsLanded += 1;
  s.pctDealt += dmg;
  gainBro(def, dmg * T.BRO_GAIN.perPctTaken);
  gainBro(att, dmg * T.BRO_GAIN.perPctDealt);
  const speed = launchSpeed(w, def.pct, m, def.hpMax);
  let dx = def.x - fromX, dz = def.z - fromZ;
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const a = (T.LAUNCH_ANGLE_DEG * Math.PI) / 180;
  const out = simulateFlight(def.x, def.z, [dx * Math.cos(a) * speed, Math.sin(a) * speed, dz * Math.cos(a) * speed], s.radius);
  if (out.kind === 'ko') loseStock(s, def, mods.superLaunch > 1);
  else { def.x = out.x; def.z = out.z; if (out.kind === 'ledge') { def.onLedge = true; s.ledgeGrabs += 1; } }
}

function hitChance(w: Weapon, dist: number, aim: number): number {
  if (w.category === 'blaster') return Math.max(0.2, (0.6 + 0.06 * w.stats.c - Math.max(0, dist - 8) * 0.02) * (0.75 + 0.25 * aim));
  if (w.category === 'grenade') {
    const radius = 1.5 + ((w.stats.b - 1) / 5) * 3;
    const err = (0.6 + 0.07 * dist) * (1.6 - aim);
    return Math.min(0.97, radius / (radius + err));
  }
  return Math.max(0.3, (0.9 - Math.max(0, dist - 6) * 0.02) * (0.75 + 0.25 * aim));
}

function moveActive(s: SimState, p: SimPlayer, o: SimPlayer, how: SimAction['move'], rng: Rng): void {
  let tx = p.x, tz = p.z;
  if (how === 'center') { tx = 0; tz = 0; }
  else if (how === 'flank') {
    // Se placer entre l'adversaire et le centre, à ~5 m de lui : le coup le poussera vers son bord.
    const ol = Math.hypot(o.x, o.z) || 1;
    tx = o.x - (o.x / ol) * 5; tz = o.z - (o.z / ol) * 5;
  } else if (how === 'random') { tx = p.x + (rng() - 0.5) * 8; tz = p.z + (rng() - 0.5) * 8; }
  let dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  const budget = MOVE_BUDGET - (p.onLedge ? T.LEDGE_CLIMB_COST : 0);
  if (d > budget) { dx *= budget / d; dz *= budget / d; }
  p.x += dx; p.z += dz; p.onLedge = false;
  const r = Math.hypot(p.x, p.z);
  if (r > s.radius - 0.6) { const k = (s.radius - 0.6) / r; p.x *= k; p.z *= k; }
}

/** Début du tour (comme phases.ts) : recharges du joueur actif, mort subite. À appeler AVANT de décider. */
export function startTurn(s: SimState): void {
  const att = s.players[s.active];
  if (s.turn >= T.SUDDEN_DEATH_TURN && !s.suddenDeath) {
    s.suddenDeath = true;
    for (const p of s.players) p.pct = Math.max(p.pct, T.SUDDEN_DEATH_PCT);
  }
  for (let i = 0; i < att.cooldowns.length; i++) if (att.cooldowns[i] > 0) att.cooldowns[i] -= 1;
}

/** Joue le reste du tour : déplacement, tir (rafale comprise), parade du défenseur. */
export function playTurn(s: SimState, act: SimAction, rng: Rng): void {
  const att = s.players[s.active];
  const def = s.players[s.active === 0 ? 1 : 0];
  moveActive(s, att, def, act.move, rng);
  let wi = act.weaponIdx;
  if (att.cooldowns[wi] > 0) wi = att.cooldowns.findIndex((c) => c <= 0);
  if (wi >= 0) {
    const w = att.weapons[wi];
    att.cooldowns[wi] = T.WEAPON_COOLDOWN_TURNS + 1;
    const superShot = w.category !== 'shield' && att.superReady;
    if (superShot) { att.superReady = false; att.bro = 0; s.supersFired += 1; s.firstSuperTurn ??= s.turn; }
    if (act.nice) gainBro(att, T.BRO_GAIN.nice);
    const base: ShotMods = {
      ...NO_MODS, charge: act.charge, nice: act.nice,
      superDamage: superShot ? T.BRO_SMASH.damageMult : 1, superLaunch: superShot ? T.BRO_SMASH.launchMult : 1,
    };
    if (w.category !== 'shield') {
      const shots = w.category === 'blaster' ? Math.round(T.BLASTER_SHOTS_MIN + ((w.stats.b - 1) / 5) * (T.BLASTER_SHOTS_MAX - T.BLASTER_SHOTS_MIN)) : 1;
      for (let i = 0; i < shots && s.winner == null; i++) {
        const dist = Math.hypot(att.x - def.x, att.z - def.z);
        if (rng() > hitChance(w, dist, act.aim)) continue;
        const grade = parryGrade(act.parry(), s.turn);
        if (grade === 'perfect') def.parryStreak += 1; else if (grade === 'miss') def.parryStreak = 0;
        if (grade === 'perfect') gainBro(def, T.BRO_GAIN.perfect);
        if (grade === 'good') gainBro(def, T.BRO_GAIN.good);
        if (grade === 'perfect') {
          if (w.category === 'throwable') landHit(s, rng, def, att, w, { ...base, superDamage: 1, superLaunch: 1 }, def.x, def.z);
          continue;
        }
        const mods = { ...base, burst: shots, mult: grade === 'good' ? 0.5 : 1 };
        landHit(s, rng, att, def, w, mods, w.category === 'grenade' ? def.x + (def.x - att.x) * -0.15 : att.x, w.category === 'grenade' ? def.z + (def.z - att.z) * -0.15 : att.z);
      }
    }
  }
  if (s.winner != null) return;
  s.active = s.active === 0 ? 1 : 0;
  s.turn += 1;
}
