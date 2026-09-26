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

/** Temps réel (plan/PIVOT-TEMPS-REEL.md) : un match = `countdown` (READY? 3-2-1 GO!) → `fight` → `ko` → `end`.
 * Les phases de tour (`turn-intro`, `move`, `aim`, `resolve`, `snap-time`) ne sont plus utilisées en match. */
export type Phase =
  | 'title' | 'fighter-select' | 'arsenal' | 'reveal' | 'map-select'
  | 'countdown' | 'fight'
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

/** Physique RÉELLE de l'objet scanné (demande d'Adem, 15h50 : « une chaise n'est pas une canette »). Gemini l'estime
 *  à partir de la photo, le code la borne et en déduit le comportement (dégâts, recul, vitesse, portée, recharge,
 *  rebond, visuel). L'IA interprète, le code arbitre. */
export type Material = 'metal' | 'wood' | 'plastic' | 'glass' | 'ceramic' | 'fabric' | 'paper' | 'rubber' | 'food' | 'stone';
export type ObjectShape = 'long' | 'flat' | 'round' | 'box' | 'irregular';
export interface WeaponPhysics {
  /** Masse réelle estimée (kg), bornée par le code entre 0,02 et 25. */
  massKg: number;
  /** Dimensions réelles estimées (m) : hauteur, largeur, profondeur. */
  sizeM: [number, number, number];
  material: Material;
  /** Forme dominante : pilote la rotation en vol (long = tourne sur lui-même, flat = frisbee, round = roule). */
  shape: ObjectShape;
  /** 0 = mou, 1 = très rebondissant. */
  bounciness: number;
  /** Se brise à l'impact (verre, céramique, œuf…). */
  fragile: boolean;
  /** Contient un liquide qui gicle à l'impact (canette, bouteille, tasse…). */
  liquid: boolean;
}

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
  /** Physique réelle de l'objet (scan Gemini, bornée par le code). Absente sur les vieilles armes : valeurs par défaut de la catégorie. */
  physics?: WeaponPhysics;
}

/** `faceUrl` : tête de face ; `backUrl` : la même tête vue de dos (lot LFACE, planche découpée par src/ia/fighter). */
export interface FighterLook { primary: string; secondary: string; hair?: string; accessory?: Accessory; faceUrl?: string; backUrl?: string }

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
  /** Temps réel (lot RTCORE) : recharge restante de chaque arme (s, 0 = prête), charge du tir maintenu (0..1),
   * blocage maintenu, orientation (rad, autour de y ; 0 = vers +z). */
  cooldowns: number[];
  charge: number;
  blocking: boolean;
  yaw: number;
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
  /** Temps réel : secondes avant la mort subite (3:00 au départ). */
  timerLeft: number;
  /** Écran scindé (2 humains) ; false contre l'IA (plein écran pour l'humain). */
  split: boolean;
  crate: CrateState | null;
  winner: PlayerId | null;
  lastEvent: string | null;
  demo: boolean;
  vsAI: boolean;
  difficulty: 'easy' | 'medium' | 'hard' | 'hardcore';
}

/** 'split' : P1 à gauche, P2 à droite · 'solo' : une seule vue plein écran (vs IA, menus). */
export type ViewMode = 'solo' | 'split';

/** Une vue de l'écran (lot RTVIEW) : un rectangle du canvas et la caméra de son joueur. */
export interface View {
  player: PlayerId;
  camera: THREE.PerspectiveCamera;
  /** Rectangle en pixels CSS, origine en haut à gauche du canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** false : vue non dessinée (en solo, seule la vue du joueur suivi l'est). */
  visible: boolean;
}

export interface Three {
  scene: THREE.Scene;
  /** Caméra de P1 (compatibilité) ; en écran scindé, chaque vue a la sienne : `cameras`. */
  camera: THREE.PerspectiveCamera;
  /** Une caméra par joueur (lot RTVIEW) : [P1, P2]. Placées chaque image par src/scene/camera. */
  cameras: [THREE.PerspectiveCamera, THREE.PerspectiveCamera];
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Couche HTML au-dessus du canvas pour l'interface (lot LU). */
  uiRoot: HTMLElement;
  /** Fonction de rendu appelée en fin de frame ; le lot LA peut la remplacer (post-traitement). Dessine toutes les vues. */
  render: () => void;
  /** Mode d'affichage courant (lot RTVIEW). Changer avec setViewMode. */
  viewMode: ViewMode;
  /** Joueur suivi par la vue unique en mode solo. */
  soloPlayer: PlayerId;
  setViewMode(mode: ViewMode, soloPlayer?: PlayerId): void;
  /** Vue d'un joueur : où placer son HUD et ses effets, avec quelle caméra projeter. */
  viewOf(player: PlayerId): View;
  /** Vues dessinées cette image, de gauche à droite (1 en solo, 2 en scindé). */
  views(): View[];
  /** Appelé juste avant de dessiner chaque vue (occlusion par vue, effets réservés à une vue…). */
  onBeforeView(fn: (view: View) => void): void;
  /** Direction avant horizontale de la caméra du joueur (y = 0, normée) : repère du déplacement relatif.
   * Droite = [-f[2], 0, f[0]]. */
  forwardOf(player: PlayerId): Vec3;
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
  /** Écran scindé (lot RTVIEW) : vrai par défaut à 2 humains, faux contre l'IA. */
  split?: boolean;
}

/** Actions de jeu d'un joueur (mêmes noms que src/core/input.ts). */
export type InputAction = 'up' | 'down' | 'left' | 'right' | 'jump' | 'weapon1' | 'weapon2' | 'weapon3' | 'fire' | 'parry';

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
  /** Pont de test headless (lot LSCAN-OBJ) : photo (URL/chemin) -> arme, en passant par le VRAI pipeline
   * réseau (scan-object + sticker), pas par la clé locale de `scan`. Utile aux agents qui veulent vérifier
   * le parcours complet photo -> carte d'arme sans piloter la webcam. */
  scanObjectFromUrl?(url: string, opts?: { category?: Category; player?: PlayerId }): Promise<Weapon>;
  skipCamera(): void;
  debugColliders?(on: boolean): void;
  forcerVictoire(player?: PlayerId): void;
  setSeed(n: number): void;
  action(text: string): void;
  /** Temps réel : simule une touche (enfoncée / relâchée) d'un joueur, comme le clavier ou la manette. */
  input?(player: PlayerId, action: InputAction, down: boolean): void;
  animCamera?(player: PlayerId, shot: 'side' | 'front' | 'threeQuarter'): void;
  animPlay?(player: PlayerId, action: 'idle' | 'walk' | 'run' | 'jump' | 'throw' | 'blaster' | 'shield' | 'hitFront' | 'hitBack' | 'ko' | 'teeter' | 'parry'): void;
  /** Lot LSCAN-PERSO : pont de test headless vers le pipeline photo -> combattant (src/ia/fighter). Charge
   *  l'image à `url` (data URL ou chemin servi, ex. /tmp-test/face.png), la fait scanner par Gemini, et pose
   *  le résultat dans state.players[player].fighter — prêt pour un hooks.startMatch() qui suit. */
  scanFighterFromUrl?(url: string, player: PlayerId): void;
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
