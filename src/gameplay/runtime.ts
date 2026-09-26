// État interne du lot LG : tout ce qui n'appartient PAS au contrat central (core/state.ts) mais dont
// nos modules ont besoin (corps Rapier, minuteries, etc). Une seule partie active à la fois : singleton de module.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';

export interface PlayerRuntime {
  body: RAPIER.RigidBody | null;
  collider: RAPIER.Collider | null;
  controller: RAPIER.KinematicCharacterController | null;
  /** Vitesse verticale courante (saut/gravité), m/s. */
  vy: number;
  grounded: boolean;
  /** Tour d'acquisition de chaque arme (pour « la plus ancienne » lors d'un remplacement Snap). */
  weaponAcquiredTurn: [number, number, number];
  /** Fin (ms réel) d'un effet « slippery » subi ; 0 = aucun. */
  slipperyUntilMs: number;
  /** Direction de visée courante (normalisée), maintenue même hors charge. */
  aimDir: [number, number, number];
  /** Puissance de charge courante (0..1), pendant que le clic est maintenu. */
  charging: boolean;
  chargeStartMs: number;
  // ---------- Règles v2 (lot LSMASH) ----------
  /** Éjection en cours (vol cinématique intégré par launch.ts), null sinon. */
  launch: { vel: Vec3; grounded: boolean; attacker: PlayerId; t: number } | null;
  /** Sauts faits ce tour (0, 1 ou 2) : le 1er coûte JUMP_COST, le 2e est gratuit et seulement en l'air. */
  jumpsUsed: number;
  /** Au bord du vide (animation d'équilibre), et depuis combien de temps on pousse vers le vide. */
  teetering: boolean;
  edgePushS: number;
  /** Accroché au bord : point du bord (y = dessus du plateau) et direction vers l'intérieur. */
  ledge: { edge: Vec3; inward: Vec3 } | null;
  /** Vie perdue, en attente de réapparition (corps garé, ni coups ni contrôles). */
  dead: boolean;
  /** Réapparu : flotte (sans gravité) jusqu'à ce temps de jeu, puis tombe sur le plateau. */
  hoverUntil: number;
  /** Invulnérable jusqu'à la fin de ce tour (inclus) ; 0 = pas d'invulnérabilité. */
  invulnUntilTurn: number;
  /** Jauge BRO (0..100) et BRO SMASH armé pour le prochain tir. */
  bro: number;
  superReady: boolean;
  /** Visée auto calée sur l'adversaire ; position souris (px) au moment du calage. */
  aimLocked: boolean;
  aimLockMouse: [number, number] | null;
  /** Point visé (monde) : sert à la grenade (cloche jusqu'à ce point). */
  aimPoint: Vec3 | null;
}

export type CancelFn = () => void;

export interface GameplayRuntime {
  players: [PlayerRuntime, PlayerRuntime];
  /** Le tour en cours a-t-il déjà reçu un premier geste (arme le chrono de secours de 15 s) ? */
  gestureArmed: boolean;
  cancelFallbackTimer: CancelFn | null;
  /** Prochain tour où la caisse Snap sera annoncée (`crate:warn`). */
  nextCrateWarnTurn: number;
  /** Emplacement (0/1/2) choisi pour recevoir la prochaine arme scannée, pendant `snap-time`. */
  snapReplaceIndex: number | null;
  /** Résultat de `scan:result` en attente d'un emplacement choisi (ou de la fin des 10 s). */
  pendingScannedWeapon: Weapon | null;
  /** Vrai une fois la session `snap-time` résolue (remplacement fait, ou retour au tour) : anti double-résolution. */
  snapSettled: boolean;
  cancelSnap: CancelFn | null;
  /** Phase à laquelle on reprendra après `snap-time` (celle où la caisse a été ramassée). */
  resumePhaseAfterSnap: 'move' | 'aim';
  /** Murs de bouclier posés cette partie (voir projectiles.ts) : nettoyés à la revanche. */
  shieldBodies: RAPIER.RigidBody[];
  /** Numéro du match (incrémenté à chaque startMatch) : une minuterie d'un ancien match ne fait plus rien. */
  matchSeq: number;
  /** Temps réel (ms) du dernier geste du joueur actif et du début de sa phase de jeu (tir automatique). */
  lastGestureMs: number;
  turnPlayStartMs: number;
  /** Tour déjà terminé par un tir automatique (anti double tir). */
  autoFiredTurn: number;
  /** Mort subite déjà appliquée (tout le monde à 150 %) : une seule fois par match. */
  sdApplied: boolean;
}

function makePlayerRuntime(): PlayerRuntime {
  return {
    body: null,
    collider: null,
    controller: null,
    vy: 0,
    grounded: true,
    weaponAcquiredTurn: [0, 0, 0],
    slipperyUntilMs: 0,
    aimDir: [0, 0, 1],
    charging: false,
    chargeStartMs: 0,
    launch: null,
    jumpsUsed: 0,
    teetering: false,
    edgePushS: 0,
    ledge: null,
    dead: false,
    hoverUntil: 0,
    invulnUntilTurn: 0,
    bro: 0,
    superReady: false,
    aimLocked: false,
    aimLockMouse: null,
    aimPoint: null,
  };
}

function makeRuntime(): GameplayRuntime {
  return {
    players: [makePlayerRuntime(), makePlayerRuntime()],
    gestureArmed: false,
    cancelFallbackTimer: null,
    nextCrateWarnTurn: 0,
    snapReplaceIndex: null,
    pendingScannedWeapon: null,
    snapSettled: true,
    cancelSnap: null,
    resumePhaseAfterSnap: 'move',
    shieldBodies: [],
    matchSeq: 0,
    lastGestureMs: 0,
    turnPlayStartMs: 0,
    autoFiredTurn: -1,
    sdApplied: false,
  };
}

// Une seule partie de Broskis par page : un singleton de module suffit et évite de faire
// voyager un objet mutable supplémentaire à travers toutes les signatures `install(ctx)`.
let runtime: GameplayRuntime | null = null;

export function getRuntime(): GameplayRuntime {
  if (!runtime) runtime = makeRuntime();
  return runtime;
}

/** Repart de zéro à chaque `startMatch` (y compris une revanche) : garde les corps Rapier des joueurs
 * (juste repositionnés par character.ts) mais retire les murs de bouclier d'une partie précédente. */
export function resetRuntime(ctx: Ctx): GameplayRuntime {
  const previous = runtime;
  runtime = makeRuntime();
  runtime.matchSeq = (previous?.matchSeq ?? 0) + 1;
  if (previous) {
    runtime.players[0].body = previous.players[0].body;
    runtime.players[0].collider = previous.players[0].collider;
    runtime.players[0].controller = previous.players[0].controller;
    runtime.players[1].body = previous.players[1].body;
    runtime.players[1].collider = previous.players[1].collider;
    runtime.players[1].controller = previous.players[1].controller;
    for (const body of previous.shieldBodies) {
      if (body.isValid()) ctx.physics.world.removeRigidBody(body);
    }
  }
  return runtime;
}

export function addShieldBody(body: RAPIER.RigidBody): void {
  getRuntime().shieldBodies.push(body);
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}
