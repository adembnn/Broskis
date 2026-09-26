// Contrats partagés par tous les lots (voir plan/README.md). Modifier ici = prévenir dans plan/SUIVI.md.
import type * as THREE from 'three';
import type { Bus } from './bus';
import type { Loop } from './loop';
import type { Physics } from './physics';
import type { Rng } from './rng';

export type PlayerId = 0 | 1;
export type Vec3 = [number, number, number];

export type Category = 'blaster' | 'grenade' | 'throwable' | 'shield';
export const CATEGORIES: readonly Category[] = ['blaster', 'grenade', 'throwable', 'shield'];

export type Trait = 'bouncy' | 'sticky' | 'explosive' | 'heavy' | 'healing' | 'split' | 'slippery' | 'loud';
export const TRAITS: readonly Trait[] = ['bouncy', 'sticky', 'explosive', 'heavy', 'healing', 'split', 'slippery', 'loud'];

export type MapId = 'archipel' | 'galion' | 'cuisine';
export const MAPS: readonly MapId[] = ['archipel', 'galion', 'cuisine'];

export type Phase =
  | 'title' | 'fighter-select' | 'arsenal' | 'reveal' | 'map-select'
  | 'turn-intro' | 'move' | 'aim' | 'resolve' | 'snap-time' | 'ko' | 'end';

export type ModelId = 'barbarian' | 'knight' | 'mage' | 'rogue_hooded' | 'skeleton_mage' | 'skeleton_warrior' | 'custom';
export type Accessory = 'glasses' | 'hat' | 'beard' | 'headphones' | 'cap' | 'none';
export type ParryGrade = 'perfect' | 'good' | 'miss';

/** Budget : a + b + c = 10, chaque stat entre 1 et 6. Sens des stats par catégorie : STAT_NAMES. */
export interface WeaponStats { a: number; b: number; c: number }
export const STAT_NAMES: Record<Category, readonly [string, string, string]> = {
  blaster: ['power', 'shots', 'accuracy'],
  grenade: ['power', 'radius', 'bounce'],
  throwable: ['power', 'speed', 'knockback'],
  shield: ['guard', 'size', 'reflect'],
};

export interface WeaponLines { intro: string; hit: string; miss: string; parried: string }

export interface Weapon {
  id: string;
  /** Objet réel reconnu, ex. « coffee mug ». */
  object: string;
  /** Nom de l'arme affiché en jeu (anglais), ex. « The Caffeinator ». */
  name: string;
  category: Category;
  /** Phrase drôle qui justifie la catégorie (anglais). */
  why: string;
  stats: WeaponStats;
  trait: Trait;
  palette: [string, string];
  /** PNG détouré (data URL ou chemin public) une fois le sticker prêt. */
  stickerUrl?: string;
  lines: WeaponLines;
  source: 'preset' | 'scan' | 'cache';
  /** Tours de recharge restants (0 = prête). */
  cooldown: number;
}

export interface FighterLook { primary: string; secondary: string; hair?: string; accessory?: Accessory; faceUrl?: string }

export interface FighterDef {
  id: string;
  name: string;
  model: ModelId;
  look?: FighterLook;
  hpMax: number;
  power: number;
  agility: number;
  trait?: Trait;
  portraitUrl?: string;
  catchphrase?: string;
  /** GLB personnalisé (vedettes préparées, lot LP2). */
  glbUrl?: string;
}

export interface PlayerState {
  id: PlayerId;
  fighter: FighterDef | null;
  hp: number;
  pos: Vec3;
  moveLeft: number;
  jumpUsed: boolean;
  weapons: Weapon[];
  selected: number;
  alive: boolean;
  parryStreak: number;
  /** Règles v2 façon Smash (lot LSMASH) : dégâts en % (0 au départ, monte à chaque coup), vies restantes, accroché au bord. */
  pct: number;
  stocks: number;
  onLedge: boolean;
}

export interface CrateState { pos: Vec3; landsInTurns: number; landed: boolean }

export interface GameState {
  phase: Phase;
  turn: number;
  active: PlayerId;
  players: [PlayerState, PlayerState];
  mapId: MapId;
  seed: number;
  suddenDeath: boolean;
  timerLeft: number;
  crate: CrateState | null;
  winner: PlayerId | null;
  lastEvent: string | null;
  demo: boolean;
  vsAI: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'hardcore';
}

export interface Three {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Couche HTML au-dessus du canvas pour l'interface (lot LU). */
  uiRoot: HTMLElement;
  /** Fonction de rendu appelée en fin de frame ; le lot LA peut la remplacer (post-traitement). */
  render: () => void;
}

export interface StartMatchOptions {
  fighters?: [FighterDef, FighterDef];
  weapons?: [Weapon[], Weapon[]];
  map?: MapId;
  seed?: number;
  vsAI?: boolean;
  /** Nombre de vies (règles v2) : 2 par défaut, 1 en démo. */
  stocks?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'hardcore';
}

/** Pilotage du jeu par script (agents du harnais, régie de démo). Chaque lot remplace les fonctions qui le concernent. */
export interface GameHooks {
  startMatch(opts?: StartMatchOptions): void;
  move(dx: number, dz: number): void;
  jump(): void;
  pickWeapon(index: number): void;
  aim(yawDeg: number, pitchDeg: number): void;
  fire(power: number): void;
  parry(offsetMs?: number): void;
  grabCrate(): void;
  scan(objectKey: string): void;
  skipCamera(): void;
  forcerVictoire(player?: PlayerId): void;
  setSeed(n: number): void;
  action(text: string): void;
  animCamera?(player: PlayerId, shot: 'side' | 'front' | 'threeQuarter'): void;
  animPlay?(player: PlayerId, action: 'idle' | 'walk' | 'run' | 'jump' | 'throw' | 'blaster' | 'shield' | 'hitFront' | 'hitBack' | 'ko' | 'teeter' | 'parry'): void;
}

export interface AnimSample {
  t: number;
  player: 0 | 1;
  clip: string;
  weight: number;
  groundSpeed: number;
  animRate: number;
  footSlideCm: [number, number];
  footGapCm: [number, number];
  facingErrDeg?: number;
  lookErrDeg?: number;
  handPos?: [number, number, number];
  spineRotVar?: number;
  layers?: { footIK: boolean; lookAt: boolean; lean: number; squash: number };
}

export interface AnimEvent {
  t: number;
  player: 0 | 1;
  kind: 'transition' | 'release' | 'spawn' | 'hit-react' | 'land' | 'footstep' | 'teeter';
  from?: string;
  to?: string;
  durationMs?: number;
  handPos?: [number, number, number];
  spawnPos?: [number, number, number];
}

declare global {
  interface Window {
    animMetrics?: {
      samples: AnimSample[];
      events: AnimEvent[];
      reset(): void;
    };
  }
}

export interface Ctx {
  bus: Bus;
  state: GameState;
  three: Three;
  loop: Loop;
  physics: Physics;
  rng: Rng;
  demo: boolean;
  hooks: GameHooks;
}

/** Chaque dossier exporte `install` depuis son index.ts ; main.ts les appelle dans l'ordre. */
export type Install = (ctx: Ctx) => void | Promise<void>;
