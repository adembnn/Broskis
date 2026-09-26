// État interne du gameplay : tout ce qui n'appartient PAS au contrat central (core/state.ts) mais dont nos
// modules ont besoin (corps Rapier, vol d'éjection, blocage, minuteries du match). Une seule partie active à
// la fois : singleton de module.
import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';

export interface PlayerRuntime {
  body: RAPIER.RigidBody | null;
  collider: RAPIER.Collider | null;
  controller: RAPIER.KinematicCharacterController | null;
  /** Vitesse verticale courante (saut/gravité), m/s. */
  vy: number;
  grounded: boolean;
  /** Fin (ms réel) d'un effet « slippery » subi ; 0 = aucun. */
  slipperyUntilMs: number;
  /** Direction de tir courante (normalisée), recalculée vers l'adversaire (visée verrouillée). */
  aimDir: [number, number, number];
  /** Tir maintenu en cours de charge, et son début (ms réel). */
  charging: boolean;
  chargeStartMs: number;
  /** Éjection en cours (vol cinématique intégré par launch.ts), null sinon. */
  launch: { vel: Vec3; grounded: boolean; attacker: PlayerId; t: number; acc: number } | null;
  /** Sauts faits depuis le dernier appui au sol (2 au plus : saut + double saut). */
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
  /** Invulnérable jusqu'à ce temps de jeu (réapparition). */
  invulnUntil: number;
  /** Jauge BRO (0..100) et BRO SMASH armé pour le prochain tir. */
  bro: number;
  superReady: boolean;
  /** Blocage : début et dernière fin (ms réel, horloge des événements clavier) pour la parade parfaite. */
  blockStartMs: number;
  blockEndMs: number;
  /** Vitesse estimée (m/s), pour l'avance de visée de l'adversaire. */
  vel: Vec3;
  prevPos: Vec3;
  /** Vitesse horizontale pilotée (m/s) : instantanée au sol, gardée en l'air (élan). */
  hvel: [number, number];
  /** Dernier instant (temps de jeu) où le perso touchait le sol : « coyote time ». */
  lastGroundedAt: number;
  /** Au sol à l'image précédente (détection d'une sortie du plateau en marchant). */
  wasGrounded: boolean;
}

export type CancelFn = () => void;

export interface GameplayRuntime {
  players: [PlayerRuntime, PlayerRuntime];
  /** Numéro du match (incrémenté à chaque startMatch) : une minuterie d'un ancien match ne fait plus rien. */
  matchSeq: number;
  /** Temps de combat écoulé (temps de jeu, depuis le GO!). */
  fightTime: number;
  /** Mort subite déjà appliquée (tout le monde à 150 %) : une seule fois par match. */
  sdApplied: boolean;
  /** Murs de bouclier posés (retirés au bout de RT.shieldLifeS, et à la revanche). */
  shieldBodies: { body: RAPIER.RigidBody; until: number }[];
  /** Caisse Snap : prochaine annonce (temps de combat). */
  nextCrateAt: number;
  /** Arme bonus en cours de préparation (scan en cache) pour la caisse posée. */
  crateWeapon: Weapon | null;
}

function makePlayerRuntime(): PlayerRuntime {
  return {
    body: null,
    collider: null,
    controller: null,
    vy: 0,
    grounded: true,
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
    invulnUntil: 0,
    bro: 0,
    superReady: false,
    blockStartMs: 0,
    blockEndMs: -1e9,
    vel: [0, 0, 0],
    prevPos: [0, 0, 0],
    hvel: [0, 0],
    lastGroundedAt: 0,
    wasGrounded: true,
  };
}

function makeRuntime(): GameplayRuntime {
  return {
    players: [makePlayerRuntime(), makePlayerRuntime()],
    matchSeq: 0,
    fightTime: 0,
    sdApplied: false,
    shieldBodies: [],
    nextCrateAt: 0,
    crateWeapon: null,
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
    for (const p of [0, 1] as const) {
      runtime.players[p].body = previous.players[p].body;
      runtime.players[p].collider = previous.players[p].collider;
      runtime.players[p].controller = previous.players[p].controller;
    }
    for (const s of previous.shieldBodies) {
      if (s.body.isValid()) ctx.physics.world.removeRigidBody(s.body);
    }
  }
  return runtime;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}
