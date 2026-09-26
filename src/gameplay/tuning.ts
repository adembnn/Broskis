// Toutes les valeurs de GAMEPLAY réglables (dégâts, portées, fenêtres, tempos).
// Aucune valeur VISUELLE ici (couleurs, durées d'effet écran) : ça va dans src/art/tokens.js.
// Palettes d'armes ci-dessous = données d'arme (comme le stub src/ia), pas de la direction artistique.
import type { Category, FighterDef, Trait, Weapon } from '../core/types';

// ---------- Temps réel (plan/PIVOT-TEMPS-REEL.md, lot RTCORE) : ces valeurs priment sur celles « Tour » ----------
export const RT = {
  countdownS: 3,
  suddenDeathS: 180,
  moveSpeed: 6.5,
  /** Fraction de la vitesse au sol disponible en l'air (contrôle aérien). */
  airControl: 0.85,
  maxJumps: 2,
  /** Au bord : on vacille ; en poussant ce temps-là, on passe dans le vide (0,5 s : le temps de lire « EDGE! »
   * en plein combat ; à 0,3 s, des joueurs qui tournent autour de l'adversaire tombaient tout seuls). */
  teeterPushS: 0.5,
  blockMoveMult: 0.4,
  chargeMoveMult: 0.85,
  /** Tir maintenu : charge de 0 à 1 entre chargeMinS et chargeFullS ; relâché tout seul après autoReleaseS. */
  chargeMinS: 0.3,
  chargeFullS: 1,
  autoReleaseS: 2.2,
  cooldownS: { blaster: 1.2, grenade: 3, throwable: 4, shield: 8 } as Record<Category, number>,
  shieldLifeS: 5,
  blasterShots: 3,
  blasterIntervalS: 0.09,
  /** Vitesse des projectiles (m/s) ; + chargeSpeedBonus × charge. */
  speed: { blaster: 24, throwable: 18, grenade: 0, shield: 0 } as Record<Category, number>,
  chargeSpeedBonus: 0.3,
  /** Rayon des projectiles pour le contact avec la capsule d'un perso (m). */
  radius: { blaster: 0.22, throwable: 0.38, grenade: 0.3, shield: 0 } as Record<Category, number>,
  grenadeGravity: 14,
  /** Portée de base d'une grenade (m) ; × physique (objet lourd = plus court) × charge. */
  grenadeBaseRange: 22,
  /** Relèvement max d'un lancer tendu d'objet lourd (degrés) : au-delà de sa portée, il retombe court. */
  throwMaxElevationDeg: 25,
  /** Objet fragile : éclats (rayon m, fraction des dégâts) ; objet liquide : sol glissant (rayon m, durée ms). */
  shards: { radius: 1.3, damage: 0.35, grenadeRadiusMult: 0.75 },
  puddle: { radius: 1.8, ms: 3000, accel: 1.6 },
  /** Durée de vol de la grenade : min + distance × perM, plafonnée. */
  grenadeFlight: { min: 0.55, perM: 0.035, max: 1.1 },
  projectileMaxLifeS: 3.5,
  /** Blocage maintenu : dégâts ÷ 3, recul ÷ 2 ; parade parfaite si le blocage a commencé < perfectMs avant l'impact. */
  block: { damageMult: 1 / 3, launchMult: 0.5, perfectMs: 150, remashMs: 300 },
  parrySlowmo: { factor: 0.3, ms: 300 },
  reflectSpeedMult: 1.15,
  /** `projectile:incoming` émis ce temps avant l'impact prévu (anneau de repère). */
  incomingLeadMs: 400,
  respawnInvulnS: 2,
  crateEveryS: 35,
  crateWarnS: 3,
  hazardEveryS: [20, 30] as [number, number],
  hazardWarnS: 3,
} as const;

// ---------- Tour ----------
export const TURN_BANNER_S = 1;
/** Règles v2 : 15 s sans rien faire → tir automatique de l'arme 1 à 60 % (le tour ne se bloque jamais). */
export const TURN_FALLBACK_TIMER_S = 15;
/** Plafond absolu d'un tour (même en bougeant la souris sans fin) : tir automatique au-delà. */
export const TURN_HARD_CAP_S = 30;
export const AUTOFIRE_POWER = 0.6;
export const SUDDEN_DEATH_TURN = 7;
export const WEAPON_COOLDOWN_TURNS = 1;
/** « READY? » puis « GO! » 1,2 s plus tard (contrôles bloqués entre les deux). */
export const READY_GO_S = 1.2;
/** « GO! » attend le sol de la map (chargement asynchrone), au plus ce temps-là. */
export const GO_MAX_WAIT_MS = 12000;
/** Bandeau du tour 1, raccourci : le « GO! » sert déjà de signal de départ. */
export const FIRST_TURN_BANNER_S = 0.3;
/** « GAME! » : ralenti de 1 s (temps réel) avant `match:end`. */
export const GAME_SLOWMO = { factor: 0.3, ms: 1000 };
/** Attente maximale (temps réel) d'un perso encore en vol avant de passer le tour. */
export const SETTLE_TIMEOUT_MS = 7000;

// ---------- Déplacement (le budget lui-même est MOVE_BUDGET/JUMP_COST dans core/state.ts) ----------
export const MOVE_SPEED = 4; // m/s au clavier
// Lot LJUMP (plan/lots/LJUMP-saut.md). Avant : 5,6 / 6,4 m/s -> saut 0,78 m, double saut ≈ 1,8 m, plateformes
// (2,0 à 2,4 m) inatteignables. Hauteur d'un saut = v² / (2 × GRAVITY), intégration exacte (character.ts).
export const JUMP_VELOCITY = 6.6; // m/s -> apex 1,09 m : franchit une marche de 1 m (dalle tombée, rebord, caisse)
/** 2e saut (en l'air) : plus fort, c'est le saut de rattrapage. Au sommet du 1er : +1,50 m -> apex ≈ 2,59 m, dessus
 * d'une plateforme de 2,0 m (MAX_LEDGE_HEIGHT de LMAP3) avec 0,6 m de marge ; ≈ 2,37 m s'il part 0,15 s en retard. */
export const AIR_JUMP_VELOCITY = 7.75;
export const MAX_JUMPS_PER_TURN = 2;
/** « Coyote time » : on peut encore faire le saut du sol juste après avoir quitté le bord (s). */
export const COYOTE_S = 0.1;
/** Élan aérien : en l'air, la vitesse horizontale rejoint la direction voulue à ce rythme (1/s), et se garde sans entrée. */
export const AIR_ACCEL = 5;
export const AIR_DRAG = 0.4;
/** Élan maximal (m/s) gardé quand on sort du plateau en marchant : le rattrapage au bord reste à portée. */
export const WALKOFF_MAX_SPEED = 3;
export const GRAVITY = 20; // m/s², un peu plus nerveux que la gravité par défaut du monde Rapier
/** Plateforme traversable : au sommet du saut ou en descente, pieds jusqu'à ce nombre de m sous son dessus
 * (corps dans son emprise) -> posé dessus. Évite de rater une plateforme de quelques centimètres. */
export const ONEWAY_SNAP_BELOW = 0.35;
export const ONEWAY_SNAP_MAX_VY = 1.5; // m/s
/** « Bas + saut » sur une plateforme traversable : on la traverse vers le bas pendant ce temps (s). */
export const DROP_THROUGH_S = 0.35;
export const EDGE_RAYCAST_AHEAD = 0.35; // m devant les pieds, dans la direction du pas
export const EDGE_RAYCAST_DEPTH = 1.35; // m sous les pieds : au-delà, c'est le vide
/** Bord : on s'arrête et on vacille (`teeter`) ; en insistant ce temps-là, on marche dans le vide. */
export const TEETER_PUSH_THROUGH_S = 0.45;
/** Découpe d'un grand déplacement (script) en petits pas, pour s'arrêter pile au bord. */
export const MOVE_SUBSTEP_M = 0.2;
export const CHARACTER_RADIUS = 0.4;
export const CHARACTER_HALF_HEIGHT = 0.5; // capsule : hauteur droite hors les deux demi-sphères
/** Zone d'explosion du bas. Au-dessus du `voidY` des maps (-5) : le moteur de map n'émet pas un 2e `ringout`. */
export const RINGOUT_Y = -4.5;
export const CRATE_PICKUP_RADIUS = 1.4;

// ---------- Règles v2 façon Smash (lot LSMASH) : %, vies, bords ouverts ----------
export const STOCKS_DEFAULT = 2;
export const STOCKS_DEMO = 1;
/** Dégâts en % par point de puissance (stat a). Temps réel : ≈ 18 % pour une grenade moyenne (a = 4), les coups
 * sont bien plus fréquents qu'au tour par tour (14 à l'époque). */
export const PCT_PER_POWER = 4.5;
/** Bonus du perso : × (1 + (power − 5) × ce facteur). */
export const FIGHTER_POWER_PCT_FACTOR = 0.04;
/** Charge : dégâts × (CHARGE_DAMAGE_MIN + CHARGE_DAMAGE_SPAN × charge). */
export const CHARGE_DAMAGE_MIN = 0.85;
export const CHARGE_DAMAGE_SPAN = 0.3;
/** La rafale entière du blaster vaut environ ce multiple d'un coup, répartie sur ses tirs. */
export const BLASTER_BURST_DAMAGE_RATIO = 1.1;
export const THROWABLE_DAMAGE_MULT = 1.1;
export const CRIT_CHANCE_V2 = 0.1;
export const CRIT_MULT_V2 = 1.35;
export const NICE_DAMAGE_MULT = 1.25;
/** Plafond d'un seul coup (hors BRO SMASH et mort subite). */
export const MAX_PCT_PER_HIT = 50;
/** Recul (formule Smash simplifiée) : vitesse = (base_arme + charge × k1) × (1 + %après/100 × k2). */
export const LAUNCH_K1 = 0.4;
export const LAUNCH_K2 = 6;
/** Base de recul par catégorie : base + parStat × stat (throwable : c = knockback ; grenade : a + c ; blaster : a, par tir). */
export const LAUNCH_BASE = {
  throwable: { base: 1.35, perC: 0.13 },
  grenade: { base: 1.3, perA: 0.08, perC: 0.05 },
  blaster: { base: 0.5, perA: 0.05, k1: 0.2 },
} as const;
/** Plafond de (base + charge) après traits, avant BRO SMASH : empêche les éjections sous 40 %. */
export const LAUNCH_BASE_CAP = 2.7;
export const HEAVY_LAUNCH_MULT = 1.2;
/** Poids du perso : recul × (100 / hpMax)^WEIGHT_EXP (hpMax sert de « poids » en v2). */
export const WEIGHT_EXP = 0.5;
export const LAUNCH_ANGLE_DEG = 35;
export const LAUNCH_GRAVITY = 20;
/** Décélération horizontale en vol (m/s²), façon « decay » de Smash. */
export const LAUNCH_AIR_DECEL = 2.5;
/** Glissade après l'atterrissage (m/s²). */
export const LAUNCH_GROUND_DECEL = 22;
/** En dessous : fin du vol, le perso reprend pied. */
export const LAUNCH_END_SPEED = 0.6;
/** Zone d'explosion latérale : au-delà du rayon de l'arène + cette marge. */
export const BLAST_SIDE_MARGIN = 8;
/** Zone d'explosion du haut (m au-dessus du plateau) : « star KO ». */
export const BLAST_TOP = 16;
/** BRO SMASH (« Final Smash ») : prochain tir après `super:ready`. */
export const BRO_SMASH = { launchMult: 1.8, damageMult: 1.5 };
/** Base de recul minimale d'un BRO SMASH (avant ×1,8) : même un tir de blaster devient spectaculaire. */
export const SUPER_MIN_LAUNCH_BASE = 2.2;
/** Jauge BRO (0 à 100) : gains par parade, NICE, % reçus et % infligés. */
export const BRO_GAIN = { perfect: 12, good: 6, nice: 10, perPctTaken: 0.45, perPctDealt: 0.25 };
/** Réapparition : au-dessus du centre, flotte un instant puis tombe. */
export const RESPAWN_DELAY_S = 1.1;
export const RESPAWN_HEIGHT = 3;
export const RESPAWN_HOVER_S = 1.2;
/** Rattrapage au bord : distance horizontale max au bord, et bande verticale sous le plateau. */
export const LEDGE_GRAB_DIST = 1.5;
export const LEDGE_MIN_BELOW = 0.5;
/** Pendant son propre tour, avec un saut en réserve : accroche plus bas (≈ 0,35 s pour tenter le double saut). */
export const LEDGE_OWN_TURN_MIN_BELOW = 1.2;
export const LEDGE_MAX_BELOW = 3.2;
/** Perso accroché : pieds à cette profondeur sous le plateau. */
export const LEDGE_HANG_DROP = 1.3;
export const LEDGE_CLIMB_COST = 2;
/** Mort subite : les deux joueurs passent à ce %. */
export const SUDDEN_DEATH_PCT = 150;

// ---------- Visée / charge ----------
export const AIM_CHARGE_MS = 1200;
/** Charge maintenue au maximum au-delà de ce temps : le tir part tout seul (jamais de blocage). */
export const AIM_OVERHOLD_MS = 1500;
/** Visée auto : reste calée sur l'adversaire tant que la souris n'a pas bougé de plus de ce nombre de pixels. */
export const AIM_LOCK_BREAK_PX = 40;
/** Aimant : un point visé à moins de cette distance (m) de l'adversaire se cale sur lui. */
export const AIM_MAGNET_M = 1.8;
/** Obsolètes pour le gameplay (touches réglables par joueur : src/core/input.ts) ; gardées, alignées sur les
 * touches par défaut de J1, pour les écrans qui les lisent encore. */
export const FIRE_KEY = 'KeyF';
export const JUMP_KEY = 'Space';
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
/** Règles v2 : la grenade retombe sur le point visé, lancée à cet angle (cloche lisible). */
export const GRENADE_LOB_DEG = 50;
/** Portée d'une grenade visée par angles (script/IA) : min + charge × span mètres. */
export const GRENADE_RANGE_MIN = 5;
export const GRENADE_RANGE_SPAN = 12;

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
