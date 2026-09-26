// Caméra troisième personne VERROUILLÉE d'un joueur (lot RTVIEW, plan/PIVOT-TEMPS-REEL.md) : derrière et au-dessus
// de lui, sur l'axe joueur -> adversaire, décalée à droite (par-dessus l'épaule) ; elle vise un point entre les 2,
// plus près de l'adversaire. Règle d'Adem : la vue reste TOUJOURS sur son joueur, du GO! au GAME! (aucune
// bascule, aucun plan partagé) ; les effets (secousse, zoom KO, suivi d'éjection) se jouent ici sans le quitter.
// Tout est suivi en temps RÉEL : un ralenti ou un gel d'impact ne fige pas la caméra.
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { Ctx, PlayerId, Vec3 } from '../../core/types';
import { angleDelta, expFollow } from '../mathUtils';
import { createCameraShake, type CameraShake } from './shake';
import { RTVIEW } from './tokens';

const _want = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _look = new THREE.Vector3();
const _opp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class CameraRig {
  readonly player: PlayerId;
  readonly camera: THREE.PerspectiveCamera;
  readonly shake: CameraShake;
  private readonly ctx: Ctx;
  /** Angle horizontal de l'axe suivi : avant = (sin yaw, 0, cos yaw). */
  yaw: number;
  private readonly anchor = new THREE.Vector3(); // pieds du joueur, lissés
  private readonly look = new THREE.Vector3();
  private reach = 1;        // part du recul autorisée par le décor (collision), lissée
  private reachWant = 1;
  private fovPunch = 0;     // deg : + = coup vers l'extérieur, - = zoom
  private koFocus = 0;      // 0..1 : le point visé glisse vers son joueur (zoom KO)
  private launchT = 0;      // s restantes de suivi d'éjection
  private launchW = 0;      // poids lissé du suivi d'éjection
  private snapNext = true;
  private forced: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  constructor(ctx: Ctx, player: PlayerId) {
    this.ctx = ctx;
    this.player = player;
    this.camera = ctx.three.cameras[player];
    this.shake = createCameraShake();
    this.yaw = player === 0 ? Math.PI / 2 : -Math.PI / 2; // core/state.ts : face à face sur l'axe X
  }

  /** Avant horizontal de la caméra (repère du déplacement relatif du joueur). */
  forward(): Vec3 {
    return [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
  }

  /** Recale tout de suite (début de match, réapparition) au lieu de glisser depuis l'ancienne place. */
  snap(): void { this.snapNext = true; }

  /** Pose fixe pour le banc d'animation (hook animCamera, lot LAN) ; oubliée au prochain match. */
  force(shot: 'side' | 'front' | 'threeQuarter'): void {
    const p = this.ctx.state.players[this.player].pos;
    const center = new THREE.Vector3(p[0], p[1] + 1.2, p[2]);
    const facing = this.player === 0 ? Math.PI / 2 : -Math.PI / 2; // le perso regarde l'adversaire en base
    const az = facing + (shot === 'side' ? Math.PI / 2 : shot === 'threeQuarter' ? Math.PI / 4 : 0);
    this.forced = { pos: new THREE.Vector3(center.x + Math.sin(az) * 3, center.y, center.z + Math.cos(az) * 3), look: center };
  }

  unforce(): void { this.forced = null; }

  /** Coup reçu : petit coup de FOV (critique : juice.critique.fov). */
  impact(crit: boolean): void {
    this.fovPunch = Math.max(this.fovPunch, crit ? juice.critique.fov : RTVIEW.impact.fov);
  }

  /** Zoom KO (effets Smash) : zoom sec sur SON joueur, qui revient tout seul. */
  koZoom(): void {
    this.fovPunch = RTVIEW.koZoom.fov;
    this.koFocus = RTVIEW.koZoom.focus;
  }

  /** Éjection : la caméra recule, monte et suit la trajectoire de son joueur. */
  startLaunch(): void { this.launchT = RTVIEW.ejection.duree; }
  endLaunch(): void { this.launchT = 0; }

  private axisYaw(): number | null {
    const s = this.ctx.state.players[this.player].pos;
    const o = this.ctx.state.players[this.player === 0 ? 1 : 0].pos;
    const dx = o[0] - s[0];
    const dz = o[2] - s[2];
    return Math.hypot(dx, dz) > RTVIEW.axeMin ? Math.atan2(dx, dz) : null;
  }

  /** Position voulue de la caméra (avant collision), à partir de l'ancre et de l'angle lissés. */
  private wanted(out: THREE.Vector3): THREE.Vector3 {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const back = RTVIEW.distance + RTVIEW.ejection.recul * this.launchW;
    out.set(this.anchor.x - fx * back - fz * RTVIEW.lateral, 0, this.anchor.z - fz * back + fx * RTVIEW.lateral);
    out.y = THREE.MathUtils.clamp(this.anchor.y + RTVIEW.hauteur + RTVIEW.ejection.hauteur * this.launchW, RTVIEW.sol.cameraMin, RTVIEW.sol.cameraMax);
    return out;
  }

  /** Collision caméra ↔ décor (15 Hz) : un obstacle entre le torse du joueur et la caméra la fait rentrer. */
  probe(decor: THREE.Object3D[]): void {
    _chest.set(this.anchor.x, this.anchor.y + RTVIEW.cibleHauteur, this.anchor.z);
    _dir.copy(this.wanted(_want)).sub(_chest);
    const len = _dir.length();
    this.reachWant = 1;
    if (len < 0.5) return;
    _dir.divideScalar(len);
    _ray.set(_chest, _dir);
    _ray.near = 0.3;
    _ray.far = len;
    for (const hit of _ray.intersectObjects(decor, true)) {
      const m = hit.object as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material & { transparent?: boolean }).transparent) continue;
      this.reachWant = Math.max(RTVIEW.collision.distanceMin / RTVIEW.distance, (hit.distance - RTVIEW.collision.marge) / len);
      break;
    }
  }

  update(real: number, baseFov: number): void {
    const cam = this.camera;
    if (this.forced) {
      cam.position.copy(this.forced.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.forced.look);
      cam.fov = baseFov;
      cam.updateProjectionMatrix();
      return;
    }
    const s = this.ctx.state.players[this.player].pos;
    const o = this.ctx.state.players[this.player === 0 ? 1 : 0].pos;
    const selfY = Math.max(s[1], RTVIEW.sol.viseeMin);
    const ty = this.axisYaw();

    this.launchT = Math.max(0, this.launchT - real);
    this.launchW += ((this.launchT > 0 ? 1 : 0) - this.launchW) * expFollow(real, 0.15);

    // Visée : entre les 2, plus près de l'adversaire ; glisse vers son joueur pendant le zoom KO et l'éjection.
    _opp.set(o[0], Math.max(o[1], RTVIEW.sol.viseeMin), o[2]);
    _chest.set(s[0], selfY, s[2]);
    _look.copy(_chest).lerp(_opp, RTVIEW.visee);
    _look.y += RTVIEW.viseeHauteur;
    const focus = Math.max(this.koFocus, RTVIEW.ejection.focus * this.launchW);
    _look.lerp(_chest.setY(selfY + RTVIEW.cibleHauteur), focus);
    _look.y = Math.max(_look.y, RTVIEW.sol.viseeMin);

    if (this.snapNext) {
      this.snapNext = false;
      if (ty != null) this.yaw = ty;
      this.anchor.set(s[0], selfY, s[2]);
      this.look.copy(_look);
      this.reach = this.reachWant = 1;
    } else {
      const k = expFollow(real, RTVIEW.lissage);
      if (ty != null) this.yaw += angleDelta(this.yaw, ty) * k;
      const kxz = this.launchW > 0.5 ? expFollow(real, RTVIEW.lissage * 0.5) : k; // éjection : suit sans décrocher
      this.anchor.x += (s[0] - this.anchor.x) * kxz;
      this.anchor.z += (s[2] - this.anchor.z) * kxz;
      this.anchor.y += (selfY - this.anchor.y) * expFollow(real, this.launchW > 0.5 ? RTVIEW.lissage : RTVIEW.lissageY);
      this.look.lerp(_look, kxz);
      const r = this.reachWant < this.reach ? RTVIEW.collision.rentre : RTVIEW.collision.ressort;
      this.reach += (this.reachWant - this.reach) * expFollow(real, r);
    }

    // Place la caméra : recul raccourci par le décor (reach), jamais sous le vide profond.
    this.wanted(_want);
    _chest.set(this.anchor.x, this.anchor.y + RTVIEW.cibleHauteur, this.anchor.z);
    cam.position.copy(_chest).lerp(_want, this.reach);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);

    const back = expFollow(real, this.fovPunch < 0 ? RTVIEW.koZoom.retour : RTVIEW.impact.retour);
    this.fovPunch += (0 - this.fovPunch) * back;
    this.koFocus += (0 - this.koFocus) * expFollow(real, RTVIEW.koZoom.retour);
    cam.fov = baseFov + this.fovPunch;
    cam.updateProjectionMatrix();
    this.shake.apply(cam, real); // après le placement : la secousse ne s'accumule jamais
  }
}
