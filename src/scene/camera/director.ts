// Machine d'états de la caméra : vue épaule du joueur actif, balayage en arc, suivi du projectile comme point
// d'accroche, plan d'impact, orbite au ralenti sur le KO. `this.pos`/`this.look` sont la SEULE source de vérité
// écrite par ce module ; camera/index.ts les recopie sur la vraie THREE.PerspectiveCamera puis applique shake +
// occlusion par-dessus (jamais l'inverse, sinon la secousse serait "recopiée" et s'accumulerait).
//
// Comportement de bascule (consigne d'Adem du 26/09, remplace la version précédente) :
//  - la bascule principale a lieu au LÂCHER d'un coup (`camera:cue{shot:'turn-swing', target: défenseur}`,
//    émis par le gameplay en même temps qu'un `slowmo`), pas au `turn:start` ;
//  - elle dure ~700 ms de TEMPS RÉEL (pas de temps de jeu, donc pas ralentie par le `slowmo` concurrent) ;
//  - elle garde le projectile dans le cadre comme point d'accroche (extrapolation balistique, en temps de JEU
//    pour rester synchro avec la vraie simulation, qui elle ralentit) ;
//  - au `turn:start`, si la caméra est déjà sur le joueur actif (cas normal après une défense), rien ne bouge ;
//    sinon (tour après un SHIELD, début de match), on bascule vers lui avec l'ancien arc (pas de projectile).
import * as THREE from 'three';
import { durees, juice } from '../../art/tokens.js';
import type { Category, Ctx, PlayerId, Vec3 } from '../../core/types';
import { LOCAL_TOKENS } from '../localTokens';
import { angleDelta, bump, easeInOutCubic, easeOutCubic, expFollow } from '../mathUtils';

type Mode = 'follow' | 'arc' | 'impact' | 'ko-orbit' | 'overview';
type RestingRole = 'default' | 'defending';

interface Pose { pos: THREE.Vector3; look: THREE.Vector3 }

interface CachedProjectile { from: THREE.Vector3; vel: THREE.Vector3; gravity: number; spawnTime: number }

const REDUCED_MOTION_KEY = 'broskis.reducedMotion';

function reducedMotion(): boolean {
  try {
    const v = localStorage.getItem(REDUCED_MOTION_KEY);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function other(p: PlayerId): PlayerId {
  return p === 0 ? 1 : 0;
}

/**
 * Perpendiculaire horizontale à `dir`, biaisée vers +Z puis, à égalité, vers +X : règle des 180°, garantit
 * P1 à gauche / P2 à droite sur les plans larges quels que soient les déplacements des joueurs.
 * NB : core/state.ts place les joueurs face à face sur l'axe X (`pos:[±5,0,0]`) ; le commentaire de
 * tokens.js `maps` suppose l'axe Z ("Joueurs face à face sur l'axe Z"). Le double biais ci-dessous reste
 * correct dans les deux cas, mais l'un des deux contrats devra être ajusté — signalé dans le rendu du lot.
 */
function audienceSide(dir: THREE.Vector3): THREE.Vector3 {
  const a = new THREE.Vector3(-dir.z, 0, dir.x);
  if (a.lengthSq() < 1e-8) a.set(1, 0, 0); else a.normalize();
  const b = a.clone().negate();
  if (Math.abs(a.z - b.z) > 1e-4) return a.z > b.z ? a : b;
  return a.x > b.x ? a : b;
}

function toPolar(v: THREE.Vector3): { az: number; radius: number; y: number } {
  return { az: Math.atan2(v.x, v.z), radius: Math.hypot(v.x, v.z), y: v.y };
}

export class CameraDirector {
  private readonly ctx: Ctx;
  private readonly camera: THREE.PerspectiveCamera;
  mode: Mode = 'follow';
  readonly pos: THREE.Vector3;
  readonly look: THREE.Vector3;
  fovPunch = 0;
  private lastActive: PlayerId | null = null;
  private restingRole: RestingRole = 'default';
  private aimHint: { player: PlayerId; dir: THREE.Vector3 } | null = null;
  private lastProjectile: CachedProjectile | null = null;
  private gen = 0;
  private skipFlag = false;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.camera = ctx.three.camera;
    this.camera.fov = LOCAL_TOKENS.camera.fov;
    this.camera.updateProjectionMatrix();
    const start = this.shoulderPose(0, 'default');
    this.pos = start.pos;
    this.look = start.look;
  }

  /** Vue épaule "propre" pour `player` (avant secousse/occlusion), en lisant l'état central.
   * `role: 'defending'` recule/élève un peu plus : laisse de la place à l'anneau de parade (lot LK). */
  shoulderPose(player: PlayerId, role: RestingRole = 'default'): Pose {
    const s = this.ctx.state.players[player].pos;
    const o = this.ctx.state.players[other(player)].pos;
    const self = new THREE.Vector3(s[0], s[1], s[2]);
    const opp = new THREE.Vector3(o[0], o[1], o[2]);
    let dir = opp.clone().sub(self);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(player === 0 ? 1 : -1, 0, 0); else dir.normalize();
    if (this.aimHint && this.aimHint.player === player) {
      const hinted = this.aimHint.dir.clone(); hinted.y = 0;
      if (hinted.lengthSq() > 1e-6) dir = hinted.normalize();
    }
    const side = audienceSide(dir);
    const extra = role === 'defending' ? LOCAL_TOKENS.camera.defenderPullBack : { distance: 0, height: 0 };
    const pos = self.clone()
      .addScaledVector(dir, -(LOCAL_TOKENS.camera.shoulderDistance + extra.distance))
      .addScaledVector(side, LOCAL_TOKENS.camera.shoulderSide);
    pos.y += LOCAL_TOKENS.camera.shoulderHeight + extra.height;
    const look = self.clone().addScaledVector(dir, LOCAL_TOKENS.camera.lookAhead);
    look.y += 1.1;
    return { pos, look };
  }

  setAimHint(player: PlayerId, dir: Vec3): void {
    this.aimHint = { player, dir: new THREE.Vector3(dir[0], dir[1], dir[2]) };
  }

  clearAimHint(player: PlayerId): void {
    if (this.aimHint?.player === player) this.aimHint = null;
  }

  /** Cache la trajectoire du projectile en vol : sert de point d'accroche à la bascule (voir triggerReleaseSwing). */
  noteProjectile(from: Vec3, vel: Vec3, category: Category): void {
    this.lastProjectile = {
      from: new THREE.Vector3(from[0], from[1], from[2]),
      vel: new THREE.Vector3(vel[0], vel[1], vel[2]),
      gravity: LOCAL_TOKENS.aimFallback.gravity[category] ?? 9,
      spawnTime: this.ctx.loop.time,
    };
  }

  private projectileNow(proj: CachedProjectile): THREE.Vector3 {
    const gt = Math.max(0, this.ctx.loop.time - proj.spawnTime);
    const p = proj.from.clone().addScaledVector(proj.vel, gt);
    p.y = proj.from.y + proj.vel.y * gt - 0.5 * proj.gravity * gt * gt;
    return p;
  }

  /** Un clic ou une touche saute la transition en cours (contrat : "un clic la saute"). Sans effet hors transition. */
  skip(): void {
    this.skipFlag = true;
  }

  /**
   * Minuteur en temps RÉEL (pas de temps de jeu : un `slowmo` concurrent ne doit pas allonger la bascule à
   * l'écran). `localStorage['broskis.reducedMotion']` : coupe franche (k=1 immédiat) au lieu d'une transition.
   */
  private runTransition(duration: number, onStep: (k: number, elapsed: number) => void, onDone?: () => void): void {
    const myGen = ++this.gen;
    this.skipFlag = false;
    if (duration <= 0 || reducedMotion()) {
      onStep(1, duration);
      onDone?.();
      return;
    }
    const startReal = this.ctx.loop.realTime;
    this.ctx.loop.tick(() => {
      if (myGen !== this.gen) return false; // supplanté par une transition plus récente : s'efface sans bruit
      const elapsed = this.skipFlag ? duration : this.ctx.loop.realTime - startReal;
      const k = Math.min(1, elapsed / duration);
      onStep(k, elapsed);
      if (k >= 1) { onDone?.(); return false; }
      return true;
    });
  }

  /** Balayage en arc générique entre deux poses (polaire autour du centre, easing, coup de FOV, envol au milieu). */
  private runArcBetween(from: Pose, to: Pose, duration: number, lookOverride: (() => THREE.Vector3) | null, onDone?: () => void): void {
    const A = toPolar(from.pos);
    const B = toPolar(to.pos);
    const azDelta = angleDelta(A.az, B.az);
    this.mode = 'arc';
    this.runTransition(duration, (kRaw) => {
      const k = easeInOutCubic(kRaw);
      const az = A.az + azDelta * k;
      const swoop = bump(kRaw);
      const radius = THREE.MathUtils.lerp(A.radius, B.radius, k) + LOCAL_TOKENS.camera.arcSwoopRadius * swoop;
      const y = THREE.MathUtils.lerp(A.y, B.y, k) + LOCAL_TOKENS.camera.arcSwoopHeight * swoop;
      this.pos.set(Math.sin(az) * radius, y, Math.cos(az) * radius);
      this.look.copy(lookOverride ? lookOverride() : from.look.clone().lerp(to.look, k));
      this.fovPunch = LOCAL_TOKENS.camera.arcFovPunch * swoop;
    }, () => { this.mode = 'follow'; this.fovPunch = 0; onDone?.(); });
  }

  reset(): void {
    this.lastActive = null;
    this.restingRole = 'default';
    this.aimHint = null;
    this.lastProjectile = null;
  }

  /** turn:start — SEULEMENT si la caméra n'est pas déjà sur le joueur actif (repli : tour après un SHIELD, début
   * de match). La bascule principale passe par triggerReleaseSwing (camera:cue au lâcher du coup). */
  triggerTurnSwing(active: PlayerId): void {
    this.aimHint = null;
    if (this.lastActive === null) {
      const p = this.shoulderPose(active, 'default');
      this.pos.copy(p.pos); this.look.copy(p.look);
      this.lastActive = active;
      this.restingRole = 'default';
      this.mode = 'follow';
      return;
    }
    if (this.lastActive === active) {
      // Déjà là (cas normal après une défense) : bandeau seulement (côté UI), pas de balayage. On repasse
      // quand même le cadrage en 'default' : la personne qui vient de défendre redevient l'attaquante de
      // CE tour, elle n'a plus besoin du recul supplémentaire réservé au défenseur (règle 4 du 26/09).
      this.restingRole = 'default';
      return;
    }
    const from = this.shoulderPose(this.lastActive, this.restingRole);
    const to = this.shoulderPose(active, 'default');
    this.lastActive = active;
    this.restingRole = 'default';
    // Pas de ré-émission de camera:cue ici : ce shot est désormais le protocole du gameplay pour la bascule
    // au lâcher (triggerReleaseSwing) — le renvoyer boucherait sur notre propre écouteur (camera/index.ts).
    this.runArcBetween(from, to, LOCAL_TOKENS.camera.arcDuration, null);
  }

  /** camera:cue{shot:'turn-swing', target: défenseur} au lâcher d'un coup : bascule vers le défenseur en
   * ~700 ms réels, en gardant le projectile dans le cadre (le coup arrive alors vers sa caméra). */
  triggerReleaseSwing(defender: PlayerId): void {
    this.aimHint = null;
    const attacker = other(defender);
    const from = this.shoulderPose(attacker, this.restingRole);
    const to = this.shoulderPose(defender, 'defending');
    this.lastActive = defender; // le futur turn:start(defender) ne redéclenchera pas de bascule (cf. ci-dessus)
    this.restingRole = 'defending';
    const proj = this.lastProjectile;
    // Filet de sécurité : le gameplay (lot LG, pas encore branché) doit émettre ce ralenti lui-même
    // (juice.bascule) en même temps que le cue ; on le rejoue ici pour que la caméra fonctionne seule
    // pendant le hackathon. bus.emit('slowmo', …) est sans risque à double emploi (Map de ralentis, min()).
    this.ctx.bus.emit('slowmo', { factor: juice.bascule.ralenti, ms: juice.bascule.ms });
    this.runArcBetween(
      from,
      to,
      durees.camera / 1000,
      proj ? () => this.projectileNow(proj) : null,
    );
  }

  /** hit — coup de FOV + poussée vers le point d'impact ; le hitstop/trauma sont gérés par camera/index.ts. */
  triggerImpact(worldPos: Vec3, crit: boolean): void {
    const target = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
    const startPos = this.pos.clone();
    const startLook = this.look.clone();
    const dirToTarget = target.clone().sub(startPos).normalize();
    const pushedPos = startPos.clone().addScaledVector(dirToTarget, LOCAL_TOKENS.camera.impactPushAmount);
    const punch = crit ? juice.critique.fov : LOCAL_TOKENS.camera.arcFovPunch * 0.7;
    this.mode = 'impact';
    this.ctx.bus.emit('camera:cue', { shot: 'impact' });
    this.runTransition(LOCAL_TOKENS.camera.impactPushDuration, (kRaw) => {
      const b = bump(kRaw);
      this.pos.lerpVectors(startPos, pushedPos, b);
      this.look.lerpVectors(startLook, target, b * 0.7);
      this.fovPunch = punch * b;
    }, () => { this.mode = 'follow'; this.fovPunch = 0; });
  }

  /** ko — orbite lente autour du joueur mis KO (contrat : "orbite au ralenti sur le KO"). */
  triggerKoOrbit(player: PlayerId): void {
    const p = this.ctx.state.players[player].pos;
    const center = new THREE.Vector3(p[0], p[1] + 1, p[2]);
    const startPolar = toPolar(this.pos.clone().sub(center));
    const startY = this.pos.y;
    this.mode = 'ko-orbit';
    this.ctx.bus.emit('camera:cue', { shot: 'ko-orbit', target: player });
    this.runTransition(juice.victoire.ralentiMs / 1000, (kRaw) => {
      const k = easeOutCubic(kRaw);
      const blendIn = Math.min(1, kRaw * 3);
      const az = startPolar.az + k * Math.PI * 2 * juice.victoire.orbite;
      const radius = THREE.MathUtils.lerp(startPolar.radius || LOCAL_TOKENS.camera.koOrbitRadius, LOCAL_TOKENS.camera.koOrbitRadius, blendIn);
      const y = THREE.MathUtils.lerp(startY, center.y + LOCAL_TOKENS.camera.koOrbitHeight, blendIn);
      this.pos.set(center.x + Math.sin(az) * radius, y, center.z + Math.cos(az) * radius);
      this.look.copy(center);
    }, () => { this.mode = 'follow'; });
  }

  /** camera:cue{shot:'overview'} — seul shot sans déclencheur brut dédié : plan large tenu jusqu'au prochain tour. */
  triggerOverview(): void {
    const r = LOCAL_TOKENS.arena.radius * 1.15;
    const from = { pos: this.pos.clone(), look: this.look.clone() };
    const to = { pos: new THREE.Vector3(0, LOCAL_TOKENS.camera.koOrbitHeight, r), look: new THREE.Vector3(0, 1, 0) };
    this.mode = 'overview';
    this.runTransition(0.9, (kRaw) => {
      const k = easeInOutCubic(kRaw);
      this.pos.lerpVectors(from.pos, to.pos, k);
      this.look.lerpVectors(from.look, to.look, k);
    });
  }

  /** Pour anim-eval (lot LAN) : caméra neutre de face, côté ou 3/4. */
  forceAnimCamera(player: PlayerId, shot: 'side' | 'front' | 'threeQuarter'): void {
    this.mode = 'follow'; // Statique
    this.lastActive = null;
    const p = this.ctx.state.players[player].pos;
    const center = new THREE.Vector3(p[0], p[1] + 1.2, p[2]);
    let az = 0;
    if (shot === 'front') az = 0;
    if (shot === 'side') az = Math.PI / 2;
    if (shot === 'threeQuarter') az = Math.PI / 4;
    
    // Le perso fait face à PI/2 (pour joueur 0) ou -PI/2 (joueur 1) en base
    const facing = player === 0 ? Math.PI / 2 : -Math.PI / 2;
    az += facing;

    const r = 3;
    this.pos.set(center.x + Math.sin(az) * r, center.y, center.z + Math.cos(az) * r);
    this.look.copy(center);
  }

  /** Appelé chaque image (camera/index.ts) : en mode 'follow', vise l'épaule de qui la caméra "tient" (lastActive) ;
   * sinon la transition en cours (`runTransition`) écrit déjà pos/look — on ne fait qu'amortir le FOV vers sa base. */
  update(dt: number): void {
    if (this.mode === 'follow' && this.lastActive !== null) {
      const target = this.shoulderPose(this.lastActive, this.restingRole);
      const k = expFollow(dt, durees.glisse / 1000);
      this.pos.lerp(target.pos, k);
      this.look.lerp(target.look, k);
    }
    this.fovPunch += (0 - this.fovPunch) * expFollow(dt, 0.22);
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
    this.camera.fov = LOCAL_TOKENS.camera.fov + this.fovPunch;
    this.camera.updateProjectionMatrix();
  }
}
