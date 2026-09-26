// Bot temps réel (lot RTBOT) : réflexe LOCAL à 20 Hz qui pilote un joueur UNIQUEMENT par les entrées
// (`gameHooks.input`, comme un clavier). Machine à états : récupération (bord, chute) > défense (bloquer,
// parer, esquiver les tirs vus après son temps de réaction) > attaque (arme adaptée à la distance, charge)
// > placement (portée idéale, pas chassés, côté centre de l'adversaire, loin du bord). La posture vient de
// Gemini (strategist.ts, toutes les 8 s) : elle règle les priorités, jamais le moment d'un geste.
import type { Ctx, InputAction, PlayerId, Vec3 } from '../../core/types';
import { createRng, type Rng } from '../../core/rng';
import { getArena } from '../arena';
import { inFight } from '../phases';
import { getRuntime, otherPlayer } from '../runtime';
import { isInvulnerable } from '../stocks';
import { RT } from '../tuning';
import { IDEAL_RANGE, STANCE_MODS, botLevel, type BotLevel, type Stance } from './levels';
import { VirtualPad, edgeDistance, flatDist, freeRun, lineOfFire, norm2, overVoid, predictImpact, splashOf, type SeenShot } from './sense';

const THINK_S = 0.05; // 20 Hz
const WEAPON_KEYS: readonly InputAction[] = ['weapon1', 'weapon2', 'weapon3'];

type Plan = 'ignore' | 'block' | 'perfect' | 'dodge' | 'hop';

interface Threat extends SeenShot {
  /** Temps de jeu où le bot « voit » le tir (tir + temps de réaction). */
  seenAt: number;
  plan: Plan | null;
  /** Blocage : appui `lead` s avant l'impact prévu. */
  lead: number;
  impactAt: number;
  at: Vec3;
}

export interface BotStats {
  shots: number;
  blocks: number;
  perfects: number;
  dodges: number;
  threatsSeen: number;
  hitsDealt: number;
  hitsTaken: number;
}

export class RealtimeBot {
  private readonly ctx: Ctx;
  readonly me: PlayerId;
  readonly foe: PlayerId;
  level: BotLevel;
  stance: Stance;
  /** Arme conseillée par Gemini (index), null = libre. */
  preferred: number | null = null;
  stats: BotStats = { shots: 0, blocks: 0, perfects: 0, dodges: 0, threatsSeen: 0, hitsDealt: 0, hitsTaken: 0 };

  private readonly pad: VirtualPad;
  private rng: Rng = createRng(1);
  private active = false;
  private threats = new Map<string, Threat>();
  private nextThink = 0;
  private moveDir: [number, number] = [0, 0];
  private strafe = 1;
  private strafeFlipAt = 0;
  private idleUntil = 0;
  private nextIdleCheck = 0;
  private charging = false;
  private chargeUntil = 0;
  private nextFireAt = 0;
  private blockHoldUntil = 0;
  private dodgeDir: [number, number] | null = null;
  private dodgeUntil = 0;
  private hopAt: number[] = [];
  private taps = new Set<InputAction>();
  private ledgeSince = -1;
  private fallRoll = -1;
  private stuckT = 0;
  private stuckFrom: Vec3 = [0, 0, 0];
  private edgeMe = 6;
  private edgeFoe = 6;
  private edgeCheckAt = 0;
  /** Depuis quand la ligne de tir est bouchée (couvert) : on contourne. */
  private noLosSince = -1;

  constructor(ctx: Ctx, me: PlayerId = 1) {
    this.ctx = ctx;
    this.me = me;
    this.foe = otherPlayer(me);
    this.pad = new VirtualPad(ctx, me);
    this.level = botLevel(ctx.state.difficulty);
    this.stance = this.level.stance;
    ctx.bus.on('match:start', () => this.reset());
    ctx.bus.on('projectile:spawn', ({ id, weapon, gravity, owner }) => {
      if (!this.enabled() || owner !== this.foe) return;
      const now = ctx.loop.time;
      this.threats.set(id, {
        id, owner, category: weapon.category, gravity: gravity ?? 0, splash: splashOf(weapon), firedAt: now,
        seenAt: now + this.level.reactionMs / 1000, plan: null, lead: 0, impactAt: Infinity, at: [0, 0, 0],
      });
    });
    ctx.bus.on('projectile:end', ({ id }) => { this.threats.delete(id); });
    ctx.bus.on('parry:result', ({ player, grade }) => {
      if (player !== this.me || !this.enabled()) return;
      if (grade === 'perfect') this.stats.perfects += 1;
      else if (grade === 'good') this.stats.blocks += 1;
    });
    ctx.bus.on('hit', ({ attacker, target }) => {
      if (!this.enabled()) return;
      if (attacker === this.me && target === this.foe) this.stats.hitsDealt += 1;
      if (target === this.me) this.stats.hitsTaken += 1;
    });
  }

  enabled(): boolean {
    return this.ctx.state.vsAI;
  }

  /** Posture et arme conseillées (stratège Gemini). */
  setPlan(stance: Stance, preferred: number | null): void {
    this.stance = stance;
    this.preferred = preferred;
  }

  private reset(): void {
    this.level = botLevel(this.ctx.state.difficulty);
    this.stance = this.level.stance;
    this.preferred = null;
    this.rng = createRng((this.ctx.state.seed ^ 0x5eed) >>> 0);
    this.stats = { shots: 0, blocks: 0, perfects: 0, dodges: 0, threatsSeen: 0, hitsDealt: 0, hitsTaken: 0 };
    this.threats.clear();
    this.pad.forget(); // startMatch vide déjà les entrées
    this.active = false;
    this.nextThink = 0;
    this.charging = false;
    this.nextFireAt = 0;
    this.blockHoldUntil = 0;
    this.dodgeUntil = 0;
    this.hopAt = [];
    this.taps.clear();
    this.ledgeSince = -1;
    this.fallRoll = -1;
    this.idleUntil = 0;
  }

  /** Appelé à chaque image, juste AVANT la lecture des entrées du gameplay. */
  step(): void {
    const ctx = this.ctx;
    if (!this.enabled() || !inFight(ctx)) {
      if (this.active) { this.pad.releaseAll(); this.active = false; this.charging = false; }
      return;
    }
    if (!this.active) {
      this.active = true;
      this.nextFireAt = ctx.loop.time + 0.6 + this.level.hesitationS; // pas de tir à la milliseconde du GO!
    }
    const now = ctx.loop.time;
    this.updateThreats(now);
    if (now >= this.nextThink) {
      this.nextThink = now + THINK_S;
      this.think(now);
    }
    this.actuate(now);
    this.pad.flush();
  }

  // ---------- Défense ----------

  private updateThreats(now: number): void {
    const myPos = this.ctx.state.players[this.me].pos;
    for (const t of this.threats.values()) {
      const imp = predictImpact(t, myPos);
      if (!imp) { if (t.plan !== 'block' && t.plan !== 'perfect') t.impactAt = Infinity; continue; }
      t.impactAt = now + imp.eta;
      t.at = imp.at;
      if (t.plan === null && now >= t.seenAt) this.planDefense(t, now);
    }
  }

  private planDefense(t: Threat, now: number): void {
    const L = this.level;
    const M = STANCE_MODS[this.stance];
    const r = this.rng;
    this.stats.threatsSeen += 1;
    // Tir vu : on change de sens de pas chassé (l'avance de visée de l'adversaire suppose qu'on continue).
    if (r() < L.defendRate) { this.strafe = -this.strafe; this.strafeFlipAt = now + 0.8 + r() * 0.8; }
    const eta = t.impactAt - now;
    const me = this.ctx.state.players[this.me];
    // Survie : plus notre % est haut, plus on défend (un coup de trop nous éjecte).
    const care = 1 + 0.4 * Math.max(0, Math.min(1, (me.pct - 60) / 80));
    if (eta <= 0.02 || r() >= Math.min(0.97, L.defendRate * M.defendMult * care)) { t.plan = 'ignore'; return; }
    const grounded = getRuntime().players[this.me].grounded;
    if (t.gravity > 0) {
      // Grenade : sortir du rayon si on a le temps, sinon bloquer (dégâts ÷ 3).
      const away = norm2(me.pos[0] - t.at[0], me.pos[2] - t.at[2]);
      const need = t.splash + 0.8 - Math.hypot(me.pos[0] - t.at[0], me.pos[2] - t.at[2]);
      const room = freeRun(this.ctx, me.pos, away[0], away[1], 4);
      if (grounded && need / RT.moveSpeed < eta - 0.05 && room >= Math.min(need, 3) && r() < 0.75) {
        this.dodge(away, t.impactAt + 0.1);
        t.plan = 'dodge';
      } else {
        t.plan = 'block';
        t.lead = 0.25 + r() * 0.2;
      }
      return;
    }
    if (r() < L.blockShare) {
      if (r() < Math.min(0.95, L.perfectTry * M.perfectMult)) {
        // Parade parfaite visée : appui ~75 ms avant l'impact, avec la dispersion de la difficulté (trop tard = touché).
        t.plan = 'perfect';
        t.lead = 0.075 + this.gauss() * (L.parrySigmaMs / 1000);
      } else {
        t.plan = 'block';
        t.lead = 0.22 + r() * 0.25;
      }
      return;
    }
    // Esquive : pas chassé perpendiculaire au tir, du côté où il reste du sol ; sinon double saut.
    const p = this.ctx.state.players[this.foe].pos;
    const axis = norm2(me.pos[0] - p[0], me.pos[2] - p[2]);
    const side: [number, number] = r() < 0.5 ? [-axis[1], axis[0]] : [axis[1], -axis[0]];
    const other: [number, number] = [-side[0], -side[1]];
    if (freeRun(this.ctx, me.pos, side[0], side[1], 2) >= 1.8) { this.dodge(side, t.impactAt + 0.12); t.plan = 'dodge'; }
    else if (freeRun(this.ctx, me.pos, other[0], other[1], 2) >= 1.8) { this.dodge(other, t.impactAt + 0.12); t.plan = 'dodge'; }
    else if (grounded) {
      t.plan = 'hop';
      this.hopAt = [Math.max(now, t.impactAt - 0.38), Math.max(now + 0.12, t.impactAt - 0.2)];
    } else t.plan = 'ignore';
  }

  private dodge(dir: [number, number], until: number): void {
    this.dodgeDir = dir;
    this.dodgeUntil = until;
    this.stats.dodges += 1;
  }

  private gauss(): number {
    let u = 0, v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Un blocage est-il prévu dans les `withinS` secondes ? (on ne commence pas une charge juste avant) */
  private blockSoon(now: number, withinS: number): boolean {
    for (const t of this.threats.values()) {
      if ((t.plan === 'block' || t.plan === 'perfect') && t.impactAt - t.lead < now + withinS && t.impactAt > now - 0.1) return true;
    }
    return false;
  }

  // ---------- Décision (20 Hz) ----------

  private think(now: number): void {
    const ctx = this.ctx;
    const st = ctx.state;
    const me = st.players[this.me];
    const foe = st.players[this.foe];
    const rtMe = getRuntime().players[this.me];
    const rtFoe = getRuntime().players[this.foe];
    const L = this.level;
    const M = STANCE_MODS[this.stance];
    const r = this.rng;
    this.moveDir = [0, 0];
    if (rtMe.dead || rtMe.launch) { this.charging = false; return; } // éjecté : on subit

    const center = getArena(ctx).center;
    const toCenter = norm2(center[0] - me.pos[0], center[2] - me.pos[2]);

    // 1) Accroché au bord : on remonte après un temps de réaction (saut = remontée).
    if (me.onLedge) {
      if (this.ledgeSince < 0) this.ledgeSince = now + L.reactionMs / 1000 + r() * 0.2;
      if (now >= this.ledgeSince) this.taps.add('jump');
      return;
    }
    this.ledgeSince = -1;

    // 2) Chute hors du plateau : vers le centre, double saut au bon moment.
    if (!rtMe.grounded && overVoid(ctx, me.pos)) {
      if (this.fallRoll < 0) this.fallRoll = r();
      this.moveDir = toCenter;
      this.charging = false;
      const arena = getArena(ctx);
      if (this.fallRoll < L.recovery && rtMe.jumpsUsed < RT.maxJumps && rtMe.vy <= 0.5 && me.pos[1] < arena.top + 0.4) this.taps.add('jump');
      return;
    }
    if (rtMe.grounded) this.fallRoll = -1;

    // Bords (sondés 4 fois par seconde : rayons Rapier).
    if (now >= this.edgeCheckAt) {
      this.edgeCheckAt = now + 0.25;
      this.edgeMe = edgeDistance(ctx, me.pos, 6);
      this.edgeFoe = edgeDistance(ctx, foe.pos, 6);
    }

    const d = flatDist(me.pos, foe.pos);
    const foeHittable = !rtFoe.dead && !isInvulnerable(ctx, this.foe);
    const los = lineOfFire(ctx, me.pos, foe.pos);
    if (los) this.noLosSince = -1;
    else if (this.noLosSince < 0) this.noLosSince = now;
    const blind = this.noLosSince >= 0 && now - this.noLosSince > 0.6; // couvert entre nous : on le contourne

    // 3) Arme : adaptée à la distance (et au conseil de Gemini), jamais changée en pleine charge.
    const pick = this.chooseWeapon(d, los, rtFoe.charging);
    if (!this.charging && pick !== me.selected) this.taps.add(WEAPON_KEYS[pick]);
    const weapon = me.weapons[me.selected];
    const ready = weapon && (me.cooldowns[me.selected] ?? 0) <= 0;

    // 4) Tir : arme prête, ligne libre, bonne distance, pas de blocage imminent.
    if (!this.charging && weapon && ready && pick === me.selected && now >= this.nextFireAt && foeHittable && !this.blockSoon(now, 0.45)) {
      const cat = weapon.category;
      const [lo, hi] = this.rangeFor(cat);
      const punish = !!rtFoe.launch || foe.onLedge;
      let go = cat === 'shield'
        ? this.shieldWish(rtFoe.charging) > 0.5
        : d >= 1.5 && d <= hi + 5 && (los || (cat === 'grenade' && d >= 4 && lineOfFire(ctx, [me.pos[0], me.pos[1] + 2.5, me.pos[2]], [foe.pos[0], foe.pos[1] + 2, foe.pos[2]])));
      // Précision : on attend une cible lisible (pas en garde, pas en plein pas chassé) si on sait attendre.
      if (go && !punish && cat !== 'shield') {
        // Loin, une cible en pas chassé esquive (l'avance de visée est partielle) : on tire quand elle est lisible.
        const v = rtFoe.vel;
        const ax = norm2(foe.pos[0] - me.pos[0], foe.pos[2] - me.pos[2]);
        const lateral = Math.abs(-v[0] * ax[1] + v[2] * ax[0]);
        const messy = foe.blocking || (lateral > 4.5 && d > lo + 1) || d > hi + 3;
        if (messy && r() < L.precision) { go = false; this.nextFireAt = now + 0.12 + r() * 0.2; }
      }
      if (go) {
        let charge = cat === 'shield' ? 0 : Math.max(0, Math.min(1, (d - 5) / 10)) * (0.5 + 0.5 * L.aggression);
        if (cat === 'blaster') charge *= 0.6;
        if (foe.pct >= 70 && cat !== 'shield') charge = Math.max(charge, 0.45 + 0.4 * L.aggression); // coup qui peut l'éjecter
        if (punish) charge = Math.min(charge, 0.2);
        charge = Math.max(0, Math.min(1, charge + (r() - 0.5) * 0.2));
        const holdS = charge < 0.05 ? 0.06 : RT.chargeMinS + charge * (RT.chargeFullS - RT.chargeMinS);
        this.charging = true;
        this.chargeUntil = now + holdS;
        this.nextFireAt = now + holdS + L.hesitationS * M.hesitationMult * (0.5 + r());
      }
    }

    // 5) Placement.
    this.idle(now);
    if (now < this.idleUntil) return;
    if (now >= this.strafeFlipAt) {
      if (r() < 0.75) this.strafe = -this.strafe;
      this.strafeFlipAt = now + 1 + r() * 1.5;
    }
    if (blind && now - this.noLosSince > 2.2) { this.strafe = -this.strafe; this.noLosSince = now - 0.6; } // l'autre côté du couvert
    const cat = weapon?.category ?? 'blaster';
    const [lo, hi] = this.rangeFor(cat === 'shield' ? 'blaster' : cat);
    const R = (lo + hi) / 2;
    const fromFoe = norm2(me.pos[0] - foe.pos[0], me.pos[2] - foe.pos[2]);
    const foeToCenter = norm2(center[0] - foe.pos[0], center[2] - foe.pos[2]);
    let target: Vec3;
    const crate = st.crate;
    const foeOff = foe.onLedge || (!rtFoe.grounded && overVoid(ctx, foe.pos));
    if (crate && flatDist(me.pos, crate.pos) + 1 < flatDist(foe.pos, crate.pos) && flatDist(me.pos, crate.pos) < 16) {
      target = crate.pos; // caisse Snap plus proche de nous que de lui : on la prend
    } else if (this.stance === 'edgeguard' && foeOff) {
      target = [foe.pos[0] + foeToCenter[0] * 4.5, me.pos[1], foe.pos[2] + foeToCenter[1] * 4.5];
    } else {
      // Côté centre de l'adversaire : nos coups l'envoient vers le bord (d'autant plus que la posture le veut).
      const w = Math.min(1, M.edgePressure * (this.edgeFoe < 4 ? 1.2 : 0.7));
      const u = norm2(fromFoe[0] * (1 - w) + foeToCenter[0] * w, fromFoe[1] * (1 - w) + foeToCenter[1] * w);
      target = [foe.pos[0] + u[0] * R, me.pos[1], foe.pos[2] + u[1] * R];
    }
    // Contrôle du centre : le point visé reste loin du bord (plus loin encore quand notre % monte), quitte à
    // se rapprocher de l'adversaire : ses coups nous poussent alors vers l'intérieur, pas dans le vide.
    const arena = getArena(ctx);
    const safeR = Math.max(3, arena.radius - (L.edgeMargin + 2 + me.pct / 60));
    const cdx = target[0] - center[0], cdz = target[2] - center[2];
    const cd = Math.hypot(cdx, cdz);
    if (cd > safeR) target = [center[0] + (cdx / cd) * safeR, target[1], center[2] + (cdz / cd) * safeR];
    const tx = target[0] - me.pos[0], tz = target[2] - me.pos[2];
    const tl = Math.hypot(tx, tz);
    const perp: [number, number] = [-fromFoe[1] * this.strafe, fromFoe[0] * this.strafe];
    let mx: number, mz: number;
    if (blind) { mx = perp[0] + (tl > 1.2 ? tx / tl : 0) * 0.4; mz = perp[1] + (tl > 1.2 ? tz / tl : 0) * 0.4; }
    // Pas chassés dominants (une course droite vers l'adversaire se fait toucher : l'avance de visée tombe juste).
    else if (tl > 1.2) { mx = (tx / tl) * 0.7 + perp[0] * L.strafe; mz = (tz / tl) * 0.7 + perp[1] * L.strafe; }
    else { const k = 0.5 + 0.45 * L.strafe; mx = perp[0] * k + tx * 0.4; mz = perp[1] * k + tz * 0.4; }
    // Survie : plus son % monte, plus il revient vers le centre.
    const pull = Math.max(0, Math.min(0.6, (me.pct - 50) / 120)) + M.centerPull * 0.4 + (this.edgeMe < 2 ? 0.5 : 0);
    mx += toCenter[0] * pull; mz += toCenter[1] * pull;
    this.moveDir = this.safeDir(norm2(mx, mz), toCenter, me.pos, L.edgeMargin + Math.min(1.5, me.pct / 100));
    if (rtMe.teetering) this.moveDir = toCenter;

    // 6) Coincé contre un obstacle (plateforme, caisse) : on saute par-dessus.
    if (rtMe.grounded && Math.hypot(this.moveDir[0], this.moveDir[1]) > 0.5) {
      if (now - this.stuckT > 0.5) {
        if (flatDist(this.stuckFrom, me.pos) < 0.25 && !this.charging) {
          // Jamais par-dessus un bastingage : on ne saute que s'il y a du sol derrière l'obstacle.
          const [dx, dz] = this.moveDir;
          const behind = (k: number): Vec3 => [me.pos[0] + dx * k, me.pos[1], me.pos[2] + dz * k];
          if (!overVoid(ctx, behind(1.5)) && !overVoid(ctx, behind(2.5))) this.taps.add('jump');
          this.strafe = -this.strafe;
        }
        this.stuckT = now;
        this.stuckFrom = [...me.pos] as Vec3;
      }
    } else { this.stuckT = now; this.stuckFrom = [...me.pos] as Vec3; }
  }

  /** Pauses « humaines » (Facile surtout) : s'arrête un instant, sans raison. */
  private idle(now: number): void {
    if (now < this.nextIdleCheck) return;
    this.nextIdleCheck = now + 1;
    if (this.rng() < this.level.idlePerTenS / 10 / 0.7) this.idleUntil = now + 0.4 + this.rng() * 0.6;
  }

  private rangeFor(cat: keyof typeof IDEAL_RANGE): [number, number] {
    const s = STANCE_MODS[this.stance].rangeShift;
    const [lo, hi] = IDEAL_RANGE[cat];
    return [Math.max(2.5, lo + s), Math.max(4, hi + s)];
  }

  /** Envie de poser le bouclier (0..1) : l'adversaire charge un tir et on n'a pas déjà un mur debout. */
  private shieldWish(foeCharging: boolean): number {
    const mine = getRuntime().shieldBodies.some((s) => (s.body.userData as { player?: PlayerId } | undefined)?.player === this.me);
    if (mine) return 0;
    const me = this.ctx.state.players[this.me];
    return (foeCharging ? STANCE_MODS[this.stance].shieldUse : 0) + (me.pct > 90 ? 0.15 : 0);
  }

  private chooseWeapon(d: number, los: boolean, foeCharging: boolean): number {
    const me = this.ctx.state.players[this.me];
    let best = me.selected;
    let bestScore = -Infinity;
    me.weapons.forEach((w, i) => {
      const cd = me.cooldowns[i] ?? 0;
      let s = -cd * 0.8;
      if (w.category === 'shield') s += this.shieldWish(foeCharging) - 0.4;
      else {
        const [lo, hi] = this.rangeFor(w.category);
        const out = d < lo ? lo - d : d > hi ? d - hi : 0;
        s += 1 - out / 6;
        if (!los) s += w.category === 'grenade' ? 0.6 : -0.5;
        if (this.stance === 'aggressive' && w.category === 'throwable') s += 0.15;
      }
      if (i === this.preferred && cd <= 0) s += 0.5;
      if (i === me.selected) s += 0.1;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  /** Direction sûre : si le vide est à moins de `margin` devant, on tourne vers le centre (±45°, ±90°, ±135°). */
  private safeDir(dir: [number, number], toCenter: [number, number], pos: Vec3, margin: number): [number, number] {
    if (Math.hypot(dir[0], dir[1]) < 1e-3) return dir;
    if (freeRun(this.ctx, pos, dir[0], dir[1], margin + 0.6) >= margin) return dir;
    let best: [number, number] = toCenter;
    let bestScore = -Infinity;
    for (const deg of [45, -45, 90, -90, 135, -135]) {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      const cand: [number, number] = [dir[0] * c - dir[1] * s, dir[0] * s + dir[1] * c];
      if (freeRun(this.ctx, pos, cand[0], cand[1], margin + 0.6) < margin) continue;
      const score = cand[0] * dir[0] + cand[1] * dir[1] + 0.5 * (cand[0] * toCenter[0] + cand[1] * toCenter[1]);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best;
  }

  // ---------- Actions (chaque image) ----------

  private actuate(now: number): void {
    const pad = this.pad;
    let block = false;
    for (const t of this.threats.values()) {
      if (t.plan !== 'block' && t.plan !== 'perfect') continue;
      if (!Number.isFinite(t.impactAt)) continue;
      if (now >= t.impactAt - t.lead && now <= t.impactAt + 0.15) block = true;
    }
    if (block) this.blockHoldUntil = Math.max(this.blockHoldUntil, now + 0.1);
    if (now < this.blockHoldUntil) {
      pad.hold('parry');
      this.charging = false; // bloquer annule la charge (combat.ts)
    } else if (this.charging) {
      if (now < this.chargeUntil) pad.hold('fire');
      else { this.charging = false; this.stats.shots += 1; } // relâché : le tir part
    }
    if (this.hopAt.length && now >= this.hopAt[0]) { this.hopAt.shift(); this.taps.add('jump'); }
    const dir = now < this.dodgeUntil && this.dodgeDir ? this.dodgeDir : this.moveDir;
    pad.steer(dir[0], dir[1]);
    for (const a of this.taps) pad.hold(a);
    this.taps.clear();
  }

  /** Résumé pour le stratège et les tests. */
  debug(): Record<string, unknown> {
    return {
      level: this.level.level, stance: this.stance, preferred: this.preferred, stats: { ...this.stats },
      edgeMe: +this.edgeMe.toFixed(1), edgeFoe: +this.edgeFoe.toFixed(1), threats: this.threats.size,
    };
  }

  edges(): { me: number; foe: number } {
    return { me: this.edgeMe, foe: this.edgeFoe };
  }
}
