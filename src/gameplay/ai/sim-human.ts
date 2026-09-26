// Humain simulé pour les tests du bot (tools/test-rtbot.mjs) : un script SIMPLE, joueur « moyen », qui pilote P1
// par les mêmes entrées qu'un clavier. Réaction ~0,3 s, bloque un tir sur deux sans viser la parade parfaite,
// tire dès qu'une arme est prête, se place à 7-11 m en pas chassés, évite le bord, remonte s'il tombe.
// Jamais actif en jeu : seulement via `window.__bot.simHuman(true)`.
import type { Ctx, InputAction, PlayerId } from '../../core/types';
import { createRng, type Rng } from '../../core/rng';
import { getArena } from '../arena';
import { inFight } from '../phases';
import { getRuntime, otherPlayer } from '../runtime';
import { RT } from '../tuning';
import { VirtualPad, flatDist, freeRun, lineOfFire, norm2, overVoid } from './sense';

const THINK_S = 0.1;
const KEYS: readonly InputAction[] = ['weapon1', 'weapon2', 'weapon3'];

export interface SimHumanProfile {
  reactionS: number;
  blockChance: number;
  fireDelayS: [number, number];
}

export const AVERAGE_HUMAN: SimHumanProfile = { reactionS: 0.3, blockChance: 0.5, fireDelayS: [0.3, 0.9] };

export class SimHuman {
  private readonly ctx: Ctx;
  readonly me: PlayerId;
  readonly profile: SimHumanProfile;
  private readonly pad: VirtualPad;
  private readonly foe: PlayerId;
  private rng: Rng;
  private nextThink = 0;
  private moveDir: [number, number] = [0, 0];
  private strafe = 1;
  private flipAt = 0;
  private charging = false;
  private chargeUntil = 0;
  private nextFireAt = 0;
  private blockFrom = Infinity;
  private blockUntil = 0;
  private taps = new Set<InputAction>();
  private ledgeAt = -1;
  private active = false;

  constructor(ctx: Ctx, me: PlayerId = 0, profile: SimHumanProfile = AVERAGE_HUMAN, seed = 7) {
    this.ctx = ctx;
    this.me = me;
    this.profile = profile;
    this.foe = otherPlayer(me);
    this.pad = new VirtualPad(ctx, me);
    this.rng = createRng(seed);
    ctx.bus.on('match:start', () => { this.pad.forget(); this.active = false; this.charging = false; this.blockUntil = 0; this.blockFrom = Infinity; });
    // Un tir du bot : après sa réaction, il bloque (une fois sur deux), à un moment approximatif.
    ctx.bus.on('projectile:spawn', ({ owner }) => {
      if (owner !== this.foe || !this.on || !this.active || this.rng() >= this.profile.blockChance) return;
      const now = ctx.loop.time;
      const from = now + this.profile.reactionS + this.rng() * 0.3;
      if (from < this.blockFrom || now > this.blockUntil) this.blockFrom = from;
      this.blockUntil = Math.max(this.blockUntil, from + 0.5);
    });
  }

  private on = false;

  /** (Re)lance l'humain simulé avec une graine (un match = une graine, reproductible). */
  start(seed: number): void {
    this.rng = createRng(seed);
    this.on = true;
  }

  stop(): void {
    this.on = false;
    this.pad.releaseAll();
    this.active = false;
  }

  step(): void {
    const ctx = this.ctx;
    if (!this.on) return;
    if (!inFight(ctx)) {
      if (this.active) { this.pad.releaseAll(); this.active = false; }
      return;
    }
    const now = ctx.loop.time;
    if (!this.active) { this.active = true; this.nextFireAt = now + 0.8; }
    if (now >= this.nextThink) { this.nextThink = now + THINK_S; this.think(now); }
    const blocking = now >= this.blockFrom && now <= this.blockUntil;
    if (blocking) { this.pad.hold('parry'); this.charging = false; }
    else if (this.charging) {
      if (now < this.chargeUntil) this.pad.hold('fire');
      else this.charging = false;
    }
    this.pad.steer(this.moveDir[0], this.moveDir[1]);
    for (const a of this.taps) this.pad.hold(a);
    this.taps.clear();
    this.pad.flush();
  }

  private think(now: number): void {
    const ctx = this.ctx;
    const me = ctx.state.players[this.me];
    const foe = ctx.state.players[this.foe];
    const rt = getRuntime().players[this.me];
    const r = this.rng;
    this.moveDir = [0, 0];
    if (rt.dead || rt.launch) { this.charging = false; return; }
    const center = getArena(ctx).center;
    const toCenter = norm2(center[0] - me.pos[0], center[2] - me.pos[2]);
    if (me.onLedge) {
      if (this.ledgeAt < 0) this.ledgeAt = now + 0.3;
      if (now >= this.ledgeAt) this.taps.add('jump');
      return;
    }
    this.ledgeAt = -1;
    if (!rt.grounded && overVoid(ctx, me.pos)) {
      this.moveDir = toCenter;
      if (rt.jumpsUsed < RT.maxJumps && rt.vy <= 0 && me.pos[1] < getArena(ctx).top + 0.3) this.taps.add('jump');
      return;
    }
    const d = flatDist(me.pos, foe.pos);
    // Arme : grenade de loin ou sans ligne de tir, sinon la première prête (pas de bouclier).
    const los = lineOfFire(ctx, me.pos, foe.pos);
    let pick = -1;
    me.weapons.forEach((w, i) => {
      if (w.category === 'shield' || (me.cooldowns[i] ?? 0) > 0) return;
      if (pick < 0 || (w.category === 'grenade' && (d > 11 || !los))) pick = i;
    });
    if (pick >= 0 && pick !== me.selected && !this.charging) this.taps.add(KEYS[pick]);
    else if (pick >= 0 && !this.charging && now >= this.nextFireAt && now > this.blockUntil && (los || me.weapons[pick].category === 'grenade')) {
      const hold = r() < 0.5 ? 0.08 : 0.3 + r() * 0.5;
      this.charging = true;
      this.chargeUntil = now + hold;
      const [a, b] = this.profile.fireDelayS;
      this.nextFireAt = now + hold + a + r() * (b - a);
    }
    // Placement : 7-11 m, pas chassés, jamais vers le vide.
    if (now >= this.flipAt) { this.strafe = r() < 0.5 ? 1 : -1; this.flipAt = now + 1.2 + r() * 1.8; }
    const ax = norm2(foe.pos[0] - me.pos[0], foe.pos[2] - me.pos[2]);
    const radial = d > 11 ? 1 : d < 7 ? -1 : 0;
    let mx = ax[0] * radial - ax[1] * this.strafe * 0.8;
    let mz = ax[1] * radial + ax[0] * this.strafe * 0.8;
    const crate = ctx.state.crate;
    if (crate && flatDist(me.pos, crate.pos) + 1 < flatDist(foe.pos, crate.pos)) { mx = crate.pos[0] - me.pos[0]; mz = crate.pos[2] - me.pos[2]; }
    let dir = norm2(mx, mz);
    if (freeRun(ctx, me.pos, dir[0], dir[1], 2.1) < 1.5) { dir = toCenter; this.strafe = -this.strafe; }
    if (rt.teetering) dir = toCenter;
    this.moveDir = dir;
  }
}

