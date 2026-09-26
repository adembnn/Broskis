// Toutes les valeurs de GAMEPLAY réglables (dégâts, portées, fenêtres, tempos).
// Aucune valeur VISUELLE ici (couleurs, durées d'effet écran) : ça va dans src/art/tokens.js.
// Palettes d'armes ci-dessous = données d'arme (comme le stub src/ia), pas de la direction artistique.
import type { Category, FighterDef, Trait, Weapon } from '../core/types';

// ---------- Tour ----------
export const TURN_BANNER_S = 1;
export const TURN_FALLBACK_TIMER_S = 15;
export const SUDDEN_DEATH_TURN = 7;
export const WEAPON_COOLDOWN_TURNS = 1;
/** Pause dramatique (temps de jeu) entre le KO et le calcul du vainqueur : laisse le lot LA jouer l'éjection. */
export const KO_PAUSE_S = 1.8;

// ---------- Déplacement (le budget lui-même est MOVE_BUDGET/JUMP_COST dans core/state.ts) ----------
export const MOVE_SPEED = 4; // m/s au clavier
export const JUMP_VELOCITY = 5.6; // m/s, vitesse verticale initiale du saut
export const GRAVITY = 20; // m/s², un peu plus nerveux que la gravité par défaut du monde Rapier
export const EDGE_RAYCAST_AHEAD = 0.35; // m devant les pieds, dans la direction du pas
export const EDGE_RAYCAST_DEPTH = 1.35; // m sous les pieds : au-delà, c'est le vide
export const CHARACTER_RADIUS = 0.4;
export const CHARACTER_HALF_HEIGHT = 0.5; // capsule : hauteur droite hors les deux demi-sphères
export const RINGOUT_Y = -5;
export const CRATE_PICKUP_RADIUS = 1.4;

// ---------- Visée / charge ----------
export const AIM_CHARGE_MS = 1200;
export const JUMP_KEY = 'ShiftLeft'; // Espace/Entrée réservés à la parade (voir parry.ts)
/** Hauteur du point de tir/visée au-dessus des pieds (mains/torse). */
export const SHOT_ORIGIN_HEIGHT = 1.1;
/** Petit délai avant qu'un renvoi (parade parfaite, throwable/shield) ne touche l'attaquant d'origine. */
export const REFLECT_RETURN_MS = 450;

// ---------- Table par catégorie ----------
export interface CategoryTuning {
  /** Vitesse de base du projectile (m/s), avant recharge/puissance. */
  speed: number;
  /** 0 = trajectoire droite, 1 = balistique complète (grenade). */
  gravityScale: number;
  maxRange: number;
}

// Vitesses volontairement lentes et lisibles (cadrage Adem du 26/09, voir plus bas « Bascule caméra ») :
// le temps de vol doit laisser le temps à la caméra de basculer PUIS à la parade de se jouer.
export const CATEGORY_TUNING: Record<Category, CategoryTuning> = {
  blaster: { speed: 10, gravityScale: 0, maxRange: 40 }, // ~7 à 12 m/s une fois la charge appliquée
  grenade: { speed: 12, gravityScale: 1, maxRange: 22 },
  throwable: { speed: 9, gravityScale: 0, maxRange: 18 }, // direct (voir consigne initiale), juste ralenti
  shield: { speed: 0, gravityScale: 0, maxRange: 0 },
};
/** Gravité de l'arc de la grenade (m/s²) : réduite par rapport au monde (physics.ts) pour une cloche haute et lente. */
export const GRENADE_ARC_GRAVITY = 7;
/** Portance initiale de la grenade, en fraction de sa vitesse de lancement (cloche plus ou moins haute). */
export const GRENADE_LIFT_RATIO = 0.7;

// Rafale du blaster : nombre de tirs (stat b, 1..6 → 3..5) et intervalle entre tirs.
export const BLASTER_SHOTS_MIN = 3;
export const BLASTER_SHOTS_MAX = 5;
export const BLASTER_SHOT_INTERVAL_MS = 110;
export const BLASTER_SPREAD_DEG_MAX = 6; // accuracy (stat c) = 1
export const BLASTER_SPREAD_DEG_MIN = 0.5; // accuracy (stat c) = 6

// Grenade : rebonds (stat c) et rayon (stat b).
export const GRENADE_BOUNCES_MIN = 1;
export const GRENADE_BOUNCES_MAX = 4;
export const GRENADE_RADIUS_MIN = 1.5;
export const GRENADE_RADIUS_MAX = 4.5;
export const GRENADE_BOUNCE_RESTITUTION = 0.55;
export const GRENADE_FUSE_AFTER_STOP_MS = 250;

// Shield : taille (stat b) et garde (stat a).
export const SHIELD_PLACE_DISTANCE = 1.8;
export const SHIELD_WIDTH_MIN = 1.2;
export const SHIELD_WIDTH_MAX = 3.2;
export const SHIELD_HEIGHT_MIN = 1.2;
export const SHIELD_HEIGHT_MAX = 2.4;
export const SHIELD_THICKNESS = 0.25;

// ---------- Dégâts / recul (façon % de Smash : le recul grandit quand les PV baissent) ----------
export const DAMAGE_PER_POWER = 7.5;
export const FIGHTER_POWER_DAMAGE_FACTOR = 0.06; // bonus de dégâts par point de `power` du perso
export const CRIT_CHANCE = 0.12;
export const CRIT_MULT = 1.5;
export const KNOCKBACK_BASE = 4;
export const KNOCKBACK_HP_SCALING = 3; // à 0 PV, le recul est multiplié par (1 + ce facteur)
export const KNOCKBACK_DAMAGE_FACTOR = 0.08;
export const KNOCKBACK_UP_RATIO = 0.35; // part verticale du recul
export const KO_EXTRA_KNOCKBACK_MULT = 1.7; // éjection spectaculaire à 0 PV
export const RECOVERY_SETTLE_S = 1.4; // durée corps dynamique avant resynchro kinématique
export const EJECT_KNOCKBACK_THRESHOLD = 11; // au-delà : aim:update.ejects = true (prédiction)

// ---------- Traits (version de base, à affiner) ----------
export const TRAIT_TUNING = {
  bouncy: { extraBounces: 2 },
  sticky: { fuseMs: 500 },
  explosive: { bonusRadius: 2.5, falloff: 0.5 },
  heavy: { knockbackMult: 1.6, speedMult: 0.7 },
  healing: { lifestealRatio: 0.35 },
  split: { fragments: 2, fragmentDamageMult: 0.4, spreadDeg: 18 },
  slippery: { slideMs: 2500, driftMult: 0.6 },
  loud: { slowmoFactor: 0.6, slowmoMs: 220 },
} satisfies Record<Trait, Record<string, number>>;

// ---------- Caisse Snap ----------
export const CRATE_INTERVAL_TURNS: readonly [number, number] = [2, 3];
export const CRATE_ARENA_HALF_SIZE = 8;
export const SNAP_TIME_S = 10;

// ---------- Bascule caméra au tir — cadrage Adem du 26/09 ----------
// Au lâcher d'un projectile qui menace le défenseur (blaster/grenade/throwable, pas shield) : la caméra
// bascule vers la vue épaule du défenseur pendant CAMERA_SWING_MS (ralenti ×0,25 QUE pendant la bascule),
// puis le projectile continue à vitesse constante. `projectile:incoming` ne part qu'une fois la bascule
// finie ; on s'assure qu'il reste alors au moins MIN_REMAINING_FLIGHT_MS de vol pour que la parade soit jouable.
export const CAMERA_SWING_MS = 700;
export const FIRE_SWING_SLOWMO = { factor: 0.25, ms: CAMERA_SWING_MS };
export const MIN_REMAINING_FLIGHT_MS = 1200;

// ---------- Parade (isolée dans parry.ts) — cadrage validé par Adem le 26/09 ----------
// 1) pas de ralenti à l'approche (voir « Bascule caméra » ci-dessus, qui a son propre ralenti) ;
//    le ralenti de la PARADE est une récompense sur le renvoi après un PERFECT.
// 2) J1 = Space, J2 = Enter (event.code), gameHooks.parry(offsetMs) toujours utilisable par script.
// 3) tout en millisecondes réelles (performance.now()/event.timeStamp), jamais en images.
// 4) fenêtres en table par tour, facile à étendre (paliers de difficulté = lot dédié plus tard).
export const PARRY_OFFSET_MS = 50;
export const PARRY_REWARD_SLOWMO = { factor: 0.25, ms: 300 };
export const PARRY_KEY_CODE: Record<0 | 1, string> = { 0: 'Space', 1: 'Enter' };

export interface ParryWindow {
  fromTurn: number;
  perfectMs: number;
  goodMs: number;
  visibleMs: number;
  blasterMaxShots: number;
  blasterMinIntervalMs: number;
  feints: number;
}
/** Trié par `fromTurn` croissant. On prend la dernière entrée dont `fromTurn <= turn`. */
export const PARRY_WINDOWS: readonly ParryWindow[] = [
  { fromTurn: 1, perfectMs: 90, goodMs: 200, visibleMs: 1200, blasterMaxShots: 3, blasterMinIntervalMs: 500, feints: 0 },
  { fromTurn: 2, perfectMs: 80, goodMs: 180, visibleMs: 1000, blasterMaxShots: 3, blasterMinIntervalMs: 450, feints: 0 },
  { fromTurn: 3, perfectMs: 70, goodMs: 160, visibleMs: 850, blasterMaxShots: 4, blasterMinIntervalMs: 400, feints: 1 },
  { fromTurn: 4, perfectMs: 60, goodMs: 140, visibleMs: 700, blasterMaxShots: 4, blasterMinIntervalMs: 350, feints: 1 },
  { fromTurn: 5, perfectMs: 50, goodMs: 120, visibleMs: 600, blasterMaxShots: 5, blasterMinIntervalMs: 300, feints: 2 },
];
export function getParryWindow(turn: number): ParryWindow {
  let win = PARRY_WINDOWS[0];
  for (const w of PARRY_WINDOWS) if (w.fromTurn <= turn) win = w; else break;
  return win;
}

// ---------- Persos et armes par défaut (si startMatch() reçoit rien) ----------
export function defaultFighters(): [FighterDef, FighterDef] {
  return [
    { id: 'default-p0', name: 'Knight', model: 'knight', hpMax: 100, power: 5, agility: 5, catchphrase: 'For glory!' },
    { id: 'default-p1', name: 'Rogue', model: 'rogue_hooded', hpMax: 100, power: 4, agility: 6, catchphrase: 'Catch me if you can.' },
  ];
}

function presetArsenal(): Weapon[] {
  return [
    {
      id: 'preset-blaster', object: 'toy blaster', name: 'Backup Blaster', category: 'blaster',
      why: 'Every arsenal needs a classic.', stats: { a: 4, b: 3, c: 3 }, trait: 'loud',
      palette: ['#e0662b', '#2d231d'],
      lines: { intro: 'Old faithful.', hit: 'Bap bap bap!', miss: 'Clean miss.', parried: 'Deflected!' },
      source: 'preset', cooldown: 0,
    },
    {
      id: 'preset-grenade', object: 'party popper', name: 'Party Popper', category: 'grenade',
      why: 'Confetti now, bruises later.', stats: { a: 4, b: 4, c: 2 }, trait: 'bouncy',
      palette: ['#f2c14e', '#2d231d'],
      lines: { intro: 'Surprise!', hit: 'POP!', miss: 'Fizzled out.', parried: 'Sent packing!' },
      source: 'preset', cooldown: 0,
    },
    {
      id: 'preset-shield', object: 'trash can lid', name: 'Trusty Lid', category: 'shield',
      why: 'A perfectly good wall.', stats: { a: 4, b: 3, c: 3 }, trait: 'heavy',
      palette: ['#7c8b8f', '#2d231d'],
      lines: { intro: 'Cover me!', hit: 'Clang!', miss: 'Wide open.', parried: 'Bounced off!' },
      source: 'preset', cooldown: 0,
    },
  ];
}
/** Copie profonde à chaque appel : les deux joueurs ne doivent jamais partager le même objet Weapon. */
export function defaultArsenal(): Weapon[] {
  return presetArsenal().map((w) => ({
    ...w,
    stats: { ...w.stats },
    lines: { ...w.lines },
    palette: [...w.palette] as [string, string],
  }));
}
