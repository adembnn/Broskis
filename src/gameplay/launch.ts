// Éjection (règles v2) : vol cinématique déterministe (gravité + ralentissement, glissade à l'atterrissage),
// rattrapage au bord, zones d'explosion. La même intégration sert à PRÉDIRE l'issue d'un coup (`willKo`,
// `aim:update.ejects`) : la prédiction interroge le sol par rayons, le vol réel passe par le contrôleur Rapier.
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { blastZoneHit, findLedge, getArena, groundYBelow, type BlastSide } from './arena';
import { isVoidAt, moveKinematic, teleport } from './character';
import { horizontalSpeed, stepFlightVelocity } from './formulas';
import { getRuntime } from './runtime';
import {
  LAUNCH_END_SPEED, LEDGE_GRAB_DIST, LEDGE_HANG_DROP, LEDGE_MAX_BELOW, LEDGE_MIN_BELOW, RINGOUT_Y, CHARACTER_RADIUS,
} from './tuning';

/** Appelé quand une vie est perdue (stocks.ts s'y branche : évite une dépendance circulaire). */
let onBlast: ((ctx: Ctx, player: PlayerId, side: BlastSide, exitPos: Vec3) => void) | null = null;
export function setBlastHandler(fn: typeof onBlast): void { onBlast = fn; }

const STEP = 1 / 60;

/** Démarre (ou relance, façon combo) une éjection. */
export function startLaunch(ctx: Ctx, player: PlayerId, vel: Vec3, attacker: PlayerId): void {
  const rt = getRuntime().players[player];
  if (rt.dead) return;
  rt.ledge = null;
  ctx.state.players[player].onLedge = false;
  rt.hoverUntil = 0;
  rt.vy = 0;
  rt.grounded = false;
  rt.charging = false;
  setTeeter(ctx, player, false);
  rt.launch = { vel: [vel[0], vel[1], vel[2]], grounded: false, attacker, t: 0 };
}

export function setTeeter(ctx: Ctx, player: PlayerId, on: boolean): void {
  const rt = getRuntime().players[player];
  if (rt.teetering === on) return;
  rt.teetering = on;
  if (!on) rt.edgePushS = 0;
  ctx.bus.emit('teeter', { player, on });
}

/** Accroche le perso au bord (`ledge:grab`) : pieds sous le plateau, collé au bord, vers l'intérieur. */
export function grabLedge(ctx: Ctx, player: PlayerId, ledge: { edge: Vec3; inward: Vec3 }): void {
  const rt = getRuntime().players[player];
  rt.launch = null;
  rt.vy = 0;
  rt.grounded = false;
  rt.ledge = { edge: ledge.edge, inward: ledge.inward };
  ctx.state.players[player].onLedge = true;
  const hang: Vec3 = [
    ledge.edge[0] - ledge.inward[0] * (CHARACTER_RADIUS + 0.35),
    ledge.edge[1] - LEDGE_HANG_DROP,
    ledge.edge[2] - ledge.inward[2] * (CHARACTER_RADIUS + 0.35),
  ];
  teleport(ctx, player, hang);
  ctx.bus.emit('ledge:grab', { player, pos: [ledge.edge[0], ledge.edge[1], ledge.edge[2]] });
}

/** Rattrapage possible depuis `pos` (en chute, sous le plateau, près d'un bord) ? */
export function ledgeCandidate(ctx: Ctx, pos: Vec3, falling: boolean): { edge: Vec3; inward: Vec3 } | null {
  if (!falling || pos[1] <= RINGOUT_Y) return null;
  const arena = getArena(ctx);
  if (pos[1] > arena.top - LEDGE_MIN_BELOW || pos[1] < arena.top - LEDGE_MAX_BELOW) return null;
  if (groundYBelow(ctx, [pos[0], pos[1] + 0.2, pos[2]], pos[1] - RINGOUT_Y + 1) != null) return null; // du sol dessous : pas dans le vide
  const found = findLedge(ctx, pos, LEDGE_GRAB_DIST + CHARACTER_RADIUS);
  if (!found) return null;
  if (found.edge[1] - pos[1] < LEDGE_MIN_BELOW) return null;
  return { edge: found.edge, inward: found.inward };
}

/** Système : fait voler les persos éjectés, détecte atterrissage, rattrapage et sortie. */
export function stepLaunches(ctx: Ctx, dt: number): void {
  if (dt <= 0) return;
  for (const p of [0, 1] as const) {
    const rt = getRuntime().players[p];
    const l = rt.launch;
    if (!l || rt.dead) continue;
    // Sous-pas fixes : trajectoire identique quel que soit le nombre d'images par seconde (et à la prédiction).
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6 && rt.launch) {
      const h = Math.min(STEP, remaining);
      remaining -= h;
      stepOne(ctx, p, h);
    }
  }
}

function stepOne(ctx: Ctx, p: PlayerId, h: number): void {
  const rt = getRuntime().players[p];
  const l = rt.launch!;
  l.t += h;
  const body = { pos: ctx.state.players[p].pos, vel: l.vel, grounded: l.grounded };
  stepFlightVelocity(body, h);
  l.vel = body.vel;
  const want: Vec3 = [l.vel[0] * h, l.vel[1] * h, l.vel[2] * h];
  const r = moveKinematic(ctx, p, want, l.vel[1] > 0);
  // Mur ou obstacle : on perd la vitesse horizontale bloquée (« bonk »).
  const wantH = Math.hypot(want[0], want[2]);
  if (wantH > 1e-4 && Math.hypot(r.moved[0], r.moved[2]) < wantH * 0.4) { l.vel = [l.vel[0] * 0.3, l.vel[1], l.vel[2] * 0.3]; }
  if (l.vel[1] > 0 && r.moved[1] < want[1] * 0.3) l.vel = [l.vel[0], 0, l.vel[2]];
  const pos = ctx.state.players[p].pos;

  const side = blastZoneHit(getArena(ctx), pos, RINGOUT_Y);
  if (side) { rt.launch = null; onBlast?.(ctx, p, side, [pos[0], Math.max(pos[1], RINGOUT_Y + 0.1), pos[2]]); return; }

  if (r.grounded && l.vel[1] <= 0) {
    l.grounded = true;
    l.vel = [l.vel[0], 0, l.vel[2]];
  } else if (l.grounded && isVoidAt(ctx, pos)) {
    l.grounded = false; // glisse hors du plateau
  }
  if (l.grounded && horizontalSpeed(l.vel) < LAUNCH_END_SPEED) {
    const dir = Math.hypot(l.vel[0], l.vel[2]) > 1e-3 ? l.vel : [pos[0] - getArena(ctx).center[0], 0, pos[2] - getArena(ctx).center[2]];
    const len = Math.hypot(dir[0], dir[2]) || 1;
    rt.launch = null;
    rt.grounded = true;
    rt.vy = 0;
    // Posé au ras du vide : il vacille (animation + avertissement « EDGE! »).
    if (isVoidAt(ctx, [pos[0] + (dir[0] / len) * 0.5, pos[1], pos[2] + (dir[2] / len) * 0.5])) setTeeter(ctx, p, true);
    return;
  }
  if (!l.grounded) {
    const ledge = ledgeCandidate(ctx, pos, l.vel[1] < 0);
    if (ledge) grabLedge(ctx, p, ledge);
  }
}

/** Chutes hors éjection (on a marché dans le vide, le sol a disparu) : rattrapage au bord ou vie perdue. */
export function stepFalls(ctx: Ctx): void {
  for (const p of [0, 1] as const) {
    const rt = getRuntime().players[p];
    if (rt.launch || rt.dead || rt.ledge) continue;
    const pos = ctx.state.players[p].pos;
    if (pos[1] < RINGOUT_Y) { onBlast?.(ctx, p, 'bottom', [pos[0], RINGOUT_Y + 0.1, pos[2]]); continue; }
    if (!rt.grounded && rt.vy < 0) {
      const ledge = ledgeCandidate(ctx, pos, true);
      if (ledge) grabLedge(ctx, p, ledge);
    }
  }
}

export type LaunchOutcome = { kind: 'land'; pos: Vec3 } | { kind: 'ledge'; pos: Vec3 } | { kind: 'ko'; side: BlastSide; pos: Vec3 };

/** Prédit l'issue d'une éjection depuis `from` (même intégration, sol interrogé par rayons, sans obstacles). */
export function predictLaunch(ctx: Ctx, from: Vec3, vel: Vec3, maxS = 4): LaunchOutcome {
  const arena = getArena(ctx);
  const b = { pos: [from[0], from[1], from[2]] as Vec3, vel: [vel[0], vel[1], vel[2]] as Vec3, grounded: false };
  for (let t = 0; t < maxS; t += STEP) {
    stepFlightVelocity(b, STEP);
    const next: Vec3 = [b.pos[0] + b.vel[0] * STEP, b.pos[1] + b.vel[1] * STEP, b.pos[2] + b.vel[2] * STEP];
    if (b.vel[1] <= 0) {
      const g = groundYBelow(ctx, [next[0], b.pos[1] + 0.3, next[2]], b.pos[1] + 0.3 - next[1] + 0.05);
      if (g != null) { next[1] = g; b.grounded = true; b.vel = [b.vel[0], 0, b.vel[2]]; }
      else if (b.grounded) b.grounded = false;
    }
    b.pos = next;
    const side = blastZoneHit(arena, b.pos, RINGOUT_Y);
    if (side) return { kind: 'ko', side, pos: b.pos };
    if (b.grounded && horizontalSpeed(b.vel) < LAUNCH_END_SPEED) return { kind: 'land', pos: b.pos };
    if (!b.grounded && b.vel[1] < 0 && ledgeCandidate(ctx, b.pos, true)) return { kind: 'ledge', pos: b.pos };
  }
  return { kind: 'land', pos: b.pos };
}
