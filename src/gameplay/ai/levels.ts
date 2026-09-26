// Réglages du bot temps réel par difficulté (plan/lots/RTBOT-ia-temps-reel.md). Reprend les 4 niveaux et la
// dispersion de parade de difficulty.ts ; ajoute ce qui compte en temps réel (réaction, agressivité, bord…).
// Le bot n'a AUCUN bonus de stats : la difficulté ne joue que sur ses réflexes et ses choix.
import type { Category, GameState } from '../../core/types';
import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../difficulty';

export type Stance = 'aggressive' | 'defensive' | 'edgeguard' | 'bait';
export const STANCES: readonly Stance[] = ['aggressive', 'defensive', 'edgeguard', 'bait'];

export interface BotLevel {
  level: DifficultyLevel;
  /** Délai avant de « voir » un tir adverse ou un changement (ms). */
  reactionMs: number;
  /** Chance de défendre un projectile vu à temps (bloquer ou esquiver). */
  defendRate: number;
  /** Parmi les défenses d'un tir tendu : part des blocages (le reste : esquive latérale). */
  blockShare: number;
  /** Chance de viser la parade parfaite (blocage ~75 ms avant l'impact) plutôt qu'un blocage prudent. */
  perfectTry: number;
  /** Écart-type du moment de la parade (ms), repris de difficulty.ts. */
  parrySigmaMs: number;
  /** 0..1 : envie de tirer, de charger et de coller l'adversaire. */
  aggression: number;
  /** Attente avant de tirer une arme prête (s ; tirée entre ×0,5 et ×1,5). */
  hesitationS: number;
  /** Chance d'attendre un tir « propre » (cible lisible, pas en garde) plutôt que tirer tout de suite. */
  precision: number;
  /** Marge au bord (m), augmentée avec le % du bot. */
  edgeMargin: number;
  /** Chance de bien rattraper une chute (double saut au bon moment). */
  recovery: number;
  /** Pauses « humaines » : secondes d'arrêt par tranche de 10 s. */
  idlePerTenS: number;
  /** Posture de départ (Gemini la change ensuite). */
  stance: Stance;
}

const KEY: Record<GameState['difficulty'], DifficultyLevel> = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile', hardcore: 'Hardcore' };

const TABLE: Record<DifficultyLevel, Omit<BotLevel, 'level' | 'parrySigmaMs'>> = {
  Facile: { reactionMs: 450, defendRate: 0.3, blockShare: 0.6, perfectTry: 0.1, aggression: 0.3, hesitationS: 1.2, precision: 0.15, edgeMargin: 1.2, recovery: 0.6, idlePerTenS: 2.5, stance: 'defensive' },
  Moyen: { reactionMs: 300, defendRate: 0.55, blockShare: 0.65, perfectTry: 0.3, aggression: 0.55, hesitationS: 0.6, precision: 0.5, edgeMargin: 1.8, recovery: 0.85, idlePerTenS: 0.8, stance: 'aggressive' },
  Difficile: { reactionMs: 200, defendRate: 0.75, blockShare: 0.7, perfectTry: 0.5, aggression: 0.75, hesitationS: 0.3, precision: 0.8, edgeMargin: 2.2, recovery: 1, idlePerTenS: 0.2, stance: 'aggressive' },
  Hardcore: { reactionMs: 130, defendRate: 0.9, blockShare: 0.75, perfectTry: 0.7, aggression: 0.9, hesitationS: 0.12, precision: 0.95, edgeMargin: 2.5, recovery: 1, idlePerTenS: 0, stance: 'aggressive' },
};

export function botLevel(difficulty: GameState['difficulty']): BotLevel {
  const level = KEY[difficulty] ?? 'Moyen';
  return { level, parrySigmaMs: DIFFICULTY_LEVELS[level].parrySigmaMs, ...TABLE[level] };
}

/** Portée idéale de chaque arme (m) : le bot s'y place avant de tirer. */
export const IDEAL_RANGE: Record<Category, [number, number]> = {
  blaster: [8, 12],
  grenade: [10, 16],
  throwable: [5, 9],
  shield: [6, 12],
};

/** Effet de la posture choisie par Gemini sur le réflexe. */
export interface StanceMods {
  /** Décalage de la portée idéale (m). */
  rangeShift: number;
  hesitationMult: number;
  defendMult: number;
  perfectMult: number;
  /** Poids du placement « côté centre » de l'adversaire (ses coups reçus l'envoient vers le bord). */
  edgePressure: number;
  /** Attirance vers le centre de l'arène. */
  centerPull: number;
  /** Envie de poser le bouclier. */
  shieldUse: number;
}

export const STANCE_MODS: Record<Stance, StanceMods> = {
  aggressive: { rangeShift: -1.5, hesitationMult: 0.6, defendMult: 0.85, perfectMult: 1, edgePressure: 0.5, centerPull: 0, shieldUse: 0.1 },
  defensive: { rangeShift: 2.5, hesitationMult: 1.3, defendMult: 1.15, perfectMult: 1.1, edgePressure: 0.3, centerPull: 0.4, shieldUse: 0.7 },
  edgeguard: { rangeShift: -0.5, hesitationMult: 0.8, defendMult: 1, perfectMult: 1, edgePressure: 1, centerPull: 0.1, shieldUse: 0.1 },
  bait: { rangeShift: 3, hesitationMult: 1.1, defendMult: 1.1, perfectMult: 1.25, edgePressure: 0.3, centerPull: 0.2, shieldUse: 0.3 },
};
