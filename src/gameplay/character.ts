// Contrôleur de personnage Rapier (capsule TOUJOURS cinématique) : création des corps, déplacement avec
// glissement sur les obstacles, arrêt au bord (règles v2 : on vacille, puis on passe si on insiste), saut/gravité.
// Un seul sol de vérité : NOUS écrivons `state.players[i].pos` et le corps suit (setNextKinematicTranslation).
// Le recul (règles v2) est un vol cinématique intégré par launch.ts, qui passe aussi par `moveKinematic`.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { groundYBelow, isFallingDebris, isGroundCollider } from './arena';
import { isGroundReady } from './fallback-ground';
import { getRuntime } from './runtime';
import {
  CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS, DROP_THROUGH_S, EDGE_RAYCAST_AHEAD, EDGE_RAYCAST_DEPTH, GRAVITY, GROUND_EDGE_DOWN,
  GROUND_EDGE_R, GROUND_PROBE_UP, GROUND_SNAP_DOWN, MOVE_SUBSTEP_M, ONEWAY_SNAP_BELOW, ONEWAY_SNAP_MAX_VY,
} from './tuning';

const CONTROLLER_OFFSET = 0.04;

/** Lance un rayon vers le bas depuis `point` ; renvoie la distance jusqu'au premier obstacle, ou null. */
export function raycastDown(ctx: Ctx, point: Vec3, maxDist: number, exclude?: RAPIER.Collider): number | null {
  const { RAPIER: R, world } = ctx.physics;
  const ray = new R.Ray({ x: point[0], y: point[1], z: point[2] }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, maxDist, true, undefined, undefined, exclude);
  return hit ? hit.timeOfImpact : null;
}

function bodyUserData(player: PlayerId) {
  return { kind: 'player' as const, player };
}

export const HEIGHT_OFFSET = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS;
/** Centre du corps (repère Rapier) à partir des pieds (repère `state.pos`). */
function centerFromFeet(pos: Vec3) {
  return { x: pos[0], y: pos[1] + HEIGHT_OFFSET, z: pos[2] };
}

/** Crée (une fois) puis repositionne le corps + le contrôleur d'un joueur d'après `state.players[i].pos`. */
export function ensurePlayerBody(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  const { RAPIER: R, world } = ctx.physics;
  const pos = ctx.state.players[player].pos;
  if (!rt.body) {
    const center = centerFromFeet(pos);
    const desc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z);
    desc.setUserData(bodyUserData(player));
    const body = world.createRigidBody(desc);
    const colliderDesc = R.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS).setFriction(0.7);
    const collider = world.createCollider(colliderDesc, body);
    const controller = world.createCharacterController(CONTROLLER_OFFSET);
    controller.setMaxSlopeClimbAngle((60 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    controller.enableAutostep(0.35, 0.2, true);
    controller.enableSnapToGround(0.3);
    controller.setSlideEnabled(true);
    rt.body = body;
    rt.collider = collider;
    rt.controller = controller;
  } else {
    rt.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    rt.body.setTranslation(centerFromFeet(pos), true);
    rt.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rt.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    rt.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }
  rt.vy = 0;
  rt.grounded = true;
}

export function ensureAllPlayerBodies(ctx: Ctx): void {
  ensurePlayerBody(ctx, 0);
  ensurePlayerBody(ctx, 1);
}

/** Téléportation immédiate (réapparition, rattrapage au bord) : état + corps. */
export function teleport(ctx: Ctx, player: PlayerId, pos: Vec3): void {
  const rt = getRuntime().players[player];
  ctx.state.players[player].pos = [pos[0], pos[1], pos[2]];
  rt.body?.setTranslation(centerFromFeet(pos), true);
  rt.vy = 0;
}

/** Pose le perso à `pos` (pieds) pour la prochaine étape physique, sans collisions (vol d'éjection, launch.ts). */
export function placeKinematic(ctx: Ctx, player: PlayerId, pos: Vec3): void {
  const rt = getRuntime().players[player];
  ctx.state.players[player].pos = [pos[0], pos[1], pos[2]];
  rt.body?.setNextKinematicTranslation(centerFromFeet(pos));
}

/** Le moteur de map pousse parfois `state.pos` lui-même (apparition, éponge, gîte, catapulte) : le corps suit. */
export function syncBodyToState(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  if (!rt.body) return;
  const t = rt.body.translation();
  const c = centerFromFeet(ctx.state.players[player].pos);
  if (Math.abs(t.x - c.x) + Math.abs(t.y - c.y) + Math.abs(t.z - c.z) > 0.02) rt.body.setNextKinematicTranslation(c);
}

/** Hauteur du dessus d'un collider (plateforme traversable) : `userData.topY` si la map le donne. */
function colliderTopY(c: RAPIER.Collider): number {
  const data = c.parent()?.userData as { topY?: number } | undefined;
  if (typeof data?.topY === 'number') return data.topY;
  const he = c.halfExtents();
  const half = he ? he.y : c.halfHeight?.() ?? 0;
  return c.translation().y + half;
}

/** Filtre du contrôleur : ignore l'adversaire en vol d'éjection et les plateformes traversables (`userData.oneWay`,
 * lot LMAP2) tant qu'on monte ou qu'on est sous leur dessus : on les traverse par-dessous, on s'y pose par-dessus. */
function controllerFilter(ctx: Ctx, player: PlayerId, rising: boolean): (c: RAPIER.Collider) => boolean {
  const feetY = ctx.state.players[player].pos[1];
  return (c) => {
    const data = c.parent()?.userData as { kind?: string; oneWay?: boolean; player?: PlayerId } | undefined;
    if (data?.kind === 'player') {
      const other = getRuntime().players[data.player === 0 ? 0 : 1];
      return !other.launch && !getRuntime().players[player].launch && !other.dead;
    }
    if (!data?.oneWay) return !isFallingDebris(c);
    if (rising || ctx.loop.time < getRuntime().players[player].dropUntil) return false; // on monte, ou on descend à travers
    return feetY >= colliderTopY(c) - 0.15;
  };
}

/** Déplacement cinématique avec collisions (glisse sur les murs) ; renvoie le déplacement réel et le contact au sol. */
export function moveKinematic(ctx: Ctx, player: PlayerId, delta: Vec3, rising: boolean): { moved: Vec3; grounded: boolean } {
  const rt = getRuntime().players[player];
  const cur = ctx.state.players[player].pos;
  if (!rt.body || !rt.controller || !rt.collider) return { moved: [0, 0, 0], grounded: rt.grounded };
  rt.controller.computeColliderMovement(rt.collider, { x: delta[0], y: delta[1], z: delta[2] }, undefined, undefined,
    controllerFilter(ctx, player, rising));
  const m = rt.controller.computedMovement();
  const grounded = rt.controller.computedGrounded();
  // Base = state.pos (pas rt.body.translation(), qui ne bouge qu'au world.step() suivant) : ainsi plusieurs
  // mouvements (horizontal, vertical, éjection) peuvent s'accumuler dans la même frame.
  const base = centerFromFeet(cur);
  const next = { x: base.x + m.x, y: base.y + m.y, z: base.z + m.z };
  rt.body.setNextKinematicTranslation(next);
  ctx.state.players[player].pos = [next.x, next.y - HEIGHT_OFFSET, next.z];
  return { moved: [m.x, m.y, m.z], grounded };
}

/** Vrai s'il n'y a pas de sol (hors joueurs) sous `dest` : le pas mènerait dans le vide. */
export function isVoidAt(ctx: Ctx, dest: Vec3): boolean {
  return groundYBelow(ctx, [dest[0], dest[1] + 0.5, dest[2]], 0.5 + EDGE_RAYCAST_DEPTH) == null;
}

export interface MoveResult { movedDistance: number; pos: Vec3; blockedByEdge: boolean }

/** Déplacement horizontal borné par le budget côté appelant (movement.ts). Découpé en petits pas : au sol, on
 * s'arrête au premier pas qui mènerait dans le vide (sauf `allowVoid` : on insiste, on tombe). En l'air : contrôle libre. */
export function applyMove(ctx: Ctx, player: PlayerId, dx: number, dz: number, allowVoid: boolean): MoveResult {
  const rt = getRuntime().players[player];
  const start = ctx.state.players[player].pos;
  if (!rt.body || !rt.controller || !rt.collider || rt.launch || rt.dead) return { movedDistance: 0, pos: start, blockedByEdge: false };
  const total = Math.hypot(dx, dz);
  if (total <= 0) return { movedDistance: 0, pos: start, blockedByEdge: false };
  const steps = Math.max(1, Math.ceil(total / MOVE_SUBSTEP_M));
  const sx = dx / steps, sz = dz / steps;
  const ux = dx / total, uz = dz / total;
  let moved = 0;
  let blockedByEdge = false;
  for (let i = 0; i < steps; i++) {
    const cur = ctx.state.players[player].pos;
    if (rt.grounded && !allowVoid) {
      const ahead: Vec3 = [cur[0] + sx + ux * EDGE_RAYCAST_AHEAD, cur[1], cur[2] + sz + uz * EDGE_RAYCAST_AHEAD];
      if (isVoidAt(ctx, ahead)) { blockedByEdge = true; break; }
    }
    const r = moveKinematic(ctx, player, [sx, 0, sz], false);
    rt.grounded = r.grounded || (rt.grounded && rt.vy <= 0 && !isVoidAt(ctx, ctx.state.players[player].pos));
    const step = Math.hypot(r.moved[0], r.moved[2]);
    moved += step;
    if (step < 1e-4) break; // bloqué par un mur
  }
  return { movedDistance: moved, pos: ctx.state.players[player].pos, blockedByEdge };
}

/** Amorce un saut (vitesse verticale initiale) ; la gravité est intégrée par `stepVerticalMotion`. */
export function startJump(player: PlayerId, jumpVelocity: number): void {
  const rt = getRuntime().players[player];
  rt.vy = jumpVelocity;
  rt.grounded = false;
}

/** Système à appeler chaque frame (saut/gravité), pour le joueur actif comme pour l'autre (chute possible).
 * Ne fait rien pendant une éjection (launch.ts), accroché au bord, mort, ou en vol stationnaire de réapparition. */
export function stepVerticalMotion(ctx: Ctx, player: PlayerId, dt: number): void {
  const rt = getRuntime().players[player];
  if (!rt.body || !rt.controller || !rt.collider || rt.launch || rt.dead || rt.ledge) return;
  if (!isGroundReady() || ctx.loop.time < rt.hoverUntil) { rt.vy = 0; return; }
  const dropping = ctx.loop.time < rt.dropUntil;
  if (rt.grounded && rt.vy <= 0) {
    // RTFIX : on reste posé seulement si un sol est SOUS les pieds (il monte : pont qui gîte, on est soulevé ; il
    // descend un peu : on suit). Avant : « du sol à moins de 1,35 m » suffisait, on marchait dans le vide en
    // descendant d'une caisse et on s'enfonçait dans le pont du galion.
    if (!dropping && followGround(ctx, player)) { rt.vy = 0; return; }
    rt.grounded = false;
  }
  // Intégration exacte à gravité constante (moyenne des vitesses) : l'apex vaut v²/2g quelle que soit la cadence.
  const prevY = ctx.state.players[player].pos[1];
  const v0 = rt.vy;
  rt.vy -= GRAVITY * dt;
  const dy = ((v0 + rt.vy) / 2) * dt;
  const r = moveKinematic(ctx, player, [0, dy, 0], rt.vy > 0);
  rt.grounded = r.grounded;
  if (rt.grounded && rt.vy < 0) rt.vy = 0;
  if (rt.vy > 0 && r.moved[1] < dy * 0.5) rt.vy = 0; // tête contre un plafond
  // RTFIX, rayon balayé : le contrôleur part de la position du dernier pas physique ; à basse cadence, il peut
  // laisser passer le sol sous la NOUVELLE position. Sol franchi pendant ce pas de chute = posé dessus.
  if (!rt.grounded && rt.vy <= 0 && !dropping && landSwept(ctx, player, prevY)) { rt.grounded = true; rt.vy = 0; }
  if (!rt.grounded && !dropping && snapOntoOneWay(ctx, player, prevY)) rt.vy = 0;
}

// ---------- Lot RTFIX : sol sous les pieds (suivi, rayon balayé) ----------

/** Sol solide (hors plateformes traversables, lues par leur boîte) sous (x, z), du point `fromY` sur `len` m.
 * null si rien, ou si le rayon part DANS un solide (perso collé à un mur : on ne l'escalade pas). */
function solidGroundY(ctx: Ctx, x: number, fromY: number, z: number, len: number): number | null {
  const { RAPIER: R, world } = ctx.physics;
  const ray = new R.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, len, true, undefined, undefined, undefined, undefined,
    (c) => isGroundCollider(c) && !(c.parent()?.userData as { oneWay?: boolean } | undefined)?.oneWay);
  if (!hit || hit.timeOfImpact < 1e-4) return null;
  return fromY - hit.timeOfImpact;
}

/** Dessus d'une plateforme traversable sous (x, z), entre `lo` et `hi` (pieds au plus 15 cm sous le dessus :
 * jamais soulevé sur une plateforme par-dessous), avec `margin` autour de l'empreinte. */
function oneWayTopY(ctx: Ctx, x: number, z: number, lo: number, hi: number, margin: number): number | null {
  let best: number | null = null;
  for (const b of oneWayBoxes(ctx)) {
    if (b.topY < lo || b.topY > hi) continue;
    if (Math.abs(x - b.cx) > b.hx + margin || Math.abs(z - b.cz) > b.hz + margin) continue;
    if (best == null || b.topY > best) best = b.topY;
  }
  return best;
}

/** Perso posé : cherche le sol au centre, de GROUND_PROBE_UP au-dessus des pieds à GROUND_SNAP_DOWN dessous, et y
 * pose les pieds ; sinon, appui sur un rebord (4 rayons dans l'emprise de la capsule) sans bouger. Faux = plus
 * d'appui : le perso tombe. */
function followGround(ctx: Ctx, player: PlayerId): boolean {
  const [x, y, z] = ctx.state.players[player].pos;
  let g = solidGroundY(ctx, x, y + GROUND_PROBE_UP, z, GROUND_PROBE_UP + GROUND_SNAP_DOWN);
  const ow = oneWayTopY(ctx, x, z, y - GROUND_SNAP_DOWN, y + 0.15, 0);
  if (ow != null && (g == null || ow > g)) g = ow;
  if (g != null) {
    if (Math.abs(g - y) > 0.002) placeKinematic(ctx, player, [x, g, z]);
    return true;
  }
  const r = GROUND_EDGE_R;
  for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    if (solidGroundY(ctx, x + ox, y + 0.1, z + oz, 0.1 + GROUND_EDGE_DOWN) != null) return true;
  }
  return oneWayTopY(ctx, x, z, y - GROUND_EDGE_DOWN, y + 0.15, r) != null;
}

/** Chute : sol solide franchi entre les pieds de l'image précédente (`prevY`) et les pieds actuels. */
function landSwept(ctx: Ctx, player: PlayerId, prevY: number): boolean {
  const [x, y, z] = ctx.state.players[player].pos;
  if (prevY <= y) return false;
  const from = prevY + 0.05;
  const g = solidGroundY(ctx, x, from, z, from - y + 0.02);
  if (g == null || g < y - 0.02) return false;
  placeKinematic(ctx, player, [x, g, z]);
  return true;
}

/** Debout sur une plateforme traversable ? (pour « bas + saut » = descendre à travers, façon Smash). */
export function standingOnOneWay(ctx: Ctx, player: PlayerId): boolean {
  const [x, y, z] = ctx.state.players[player].pos;
  return oneWayBoxes(ctx).some((b) => Math.abs(y - b.topY) < 0.2 && Math.abs(x - b.cx) <= b.hx + 0.2 && Math.abs(z - b.cz) <= b.hz + 0.2);
}

/** Descend à travers la plateforme traversable sous ses pieds. */
export function dropThrough(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime().players[player];
  rt.dropUntil = ctx.loop.time + DROP_THROUGH_S;
  rt.grounded = false;
  rt.vy = -2;
}

// ---------- Lot LJUMP : atterrissage sur les plateformes traversables (le coyote time est dans movement.ts) ----------

interface OneWayBox { topY: number; cx: number; cz: number; hx: number; hz: number }

/** Plateformes traversables (userData.oneWay posé par les maps). Un collider désactivé (personne dessus) est
 * invisible aux rayons : on lit donc sa boîte directement. Relue une fois par image (RTFIX : appelée plusieurs
 * fois par perso et par image, sur des maps à 130 colliders). */
let boxesAt = -1;
let boxesCount = -1;
let boxes: OneWayBox[] = [];
export function oneWayBoxes(ctx: Ctx): OneWayBox[] {
  const n = ctx.physics.world.colliders.len();
  if (boxesAt === ctx.loop.realTime && boxesCount === n) return boxes;
  const out: OneWayBox[] = [];
  ctx.physics.world.forEachCollider((c) => {
    if (!(c.parent()?.userData as { oneWay?: boolean } | undefined)?.oneWay) return;
    const he = c.halfExtents();
    if (!he) return;
    const t = c.translation();
    out.push({ topY: colliderTopY(c), cx: t.x, cz: t.z, hx: he.x, hz: he.z });
  });
  boxesAt = ctx.loop.realTime;
  boxesCount = n;
  boxes = out;
  return out;
}

/** Au sommet du saut ou en descente, pieds jusqu'à ONEWAY_SNAP_BELOW sous le dessus d'une plateforme traversable
 * et corps dans son emprise : posé dessus (façon Smash, on ne « rate » pas une plateforme de quelques cm).
 * RTFIX : aussi si le dessus a été franchi pendant ce pas (`prevY` au-dessus) : chute rapide à basse cadence. */
function snapOntoOneWay(ctx: Ctx, player: PlayerId, prevY = -Infinity): boolean {
  const rt = getRuntime().players[player];
  if (rt.vy > ONEWAY_SNAP_MAX_VY) return false;
  const [x, y, z] = ctx.state.players[player].pos;
  for (const b of oneWayBoxes(ctx)) {
    if (y >= b.topY || (y < b.topY - ONEWAY_SNAP_BELOW && prevY < b.topY - 0.02)) continue;
    if (Math.abs(x - b.cx) > b.hx || Math.abs(z - b.cz) > b.hz) continue;
    teleport(ctx, player, [x, b.topY + 0.04, z]);
    rt.grounded = true;
    return true;
  }
  return false;
}
