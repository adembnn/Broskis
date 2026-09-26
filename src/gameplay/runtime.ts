// État interne du lot LG : tout ce qui n'appartient PAS au contrat central (core/state.ts) mais dont
// nos modules ont besoin (corps Rapier, minuteries, etc). Une seule partie active à la fois : singleton de module.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Weapon } from '../core/types';

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
