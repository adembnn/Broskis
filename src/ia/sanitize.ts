// « L'IA interprète, le code arbitre » (skill ia-en-jeu) : toutes les valeurs qui sortent de Gemini repassent
// ici avant de devenir un Weapon. Module isomorphe : importé par api/scan-object.ts (Node, re-bornage
// autoritaire) ET par src/ia/* (navigateur, filet de sécurité si jamais une valeur invalide traînait en cache).
// Aucune dépendance DOM/Node ici à dessein.
import { CATEGORIES, TRAITS, type Category, type Trait, type WeaponLines, type WeaponStats } from '../core/types';

export const MAX_OBJECT_LEN = 40;
export const MAX_NAME_LEN = 40;
export const MAX_WHY_LEN = 100;
export const MAX_LINE_LEN = 90;

const BANNED_WORDS_RE = /\b(epic|legendary)\b/gi;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Palette de secours (carton/écriteau) si Gemini ne renvoie pas deux couleurs valides. */
export const DEFAULT_PALETTE: [string, string] = ['#e0662b', '#f2c14e'];

export function cleanText(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const cleaned = v
    .replace(/[<>{}[\]`*_#]/g, '')
    .replace(/\s+/g, ' ')
    .replace(BANNED_WORDS_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function clampObject(v: unknown, fallback = 'mystery object'): string {
  return cleanText(v, fallback).slice(0, MAX_OBJECT_LEN);
}

export function clampWeaponName(v: unknown, fallback = 'The Unknown'): string {
  return cleanText(v, fallback).slice(0, MAX_NAME_LEN);
}

export function clampWhy(v: unknown, fallback = "Nobody knows why. It just works."): string {
  return cleanText(v, fallback).slice(0, MAX_WHY_LEN);
}

export function clampLine(v: unknown, fallback: string): string {
  return cleanText(v, fallback).slice(0, MAX_LINE_LEN);
}

export function clampCategory(v: unknown, forced?: Category): Category {
  if (forced) return forced;
  return (CATEGORIES as readonly string[]).includes(v as string) ? (v as Category) : 'throwable';
}

export function clampTrait(v: unknown, seed = 0): Trait {
  if ((TRAITS as readonly string[]).includes(v as string)) return v as Trait;
  return TRAITS[Math.abs(seed) % TRAITS.length];
}

export function clampPalette(v: unknown): [string, string] {
  if (Array.isArray(v) && v.length >= 2 && HEX_RE.test(v[0]) && HEX_RE.test(v[1])) {
    return [v[0], v[1]];
  }
  return DEFAULT_PALETTE;
}

/**
 * Budget 10 points, chaque stat entre 1 et 6 (voir plan/README.md). On arrondit, on borne, puis on
 * rééquilibre par pas de 1 jusqu'à la somme exacte : toujours atteignable (min 3, max 18).
 */
export function clampStats(v: unknown): WeaponStats {
  const raw = (v && typeof v === 'object' ? v : {}) as Partial<Record<'a' | 'b' | 'c', unknown>>;
  const nums = (['a', 'b', 'c'] as const).map((k) => {
    const n = Math.round(Number(raw[k]));
    return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 3;
  }) as [number, number, number];
  let total = nums[0] + nums[1] + nums[2];
  let guard = 0;
  while (total !== 10 && guard++ < 60) {
    const dir = total < 10 ? 1 : -1;
    const i = guard % 3;
    const next = nums[i] + dir;
    if (next >= 1 && next <= 6) {
      nums[i] = next;
      total += dir;
    }
  }
  return { a: nums[0], b: nums[1], c: nums[2] };
}

export function clampLines(v: unknown): WeaponLines {
  const raw = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof WeaponLines, unknown>>;
  return {
    intro: clampLine(raw.intro, "Never seen one of these in a fight before."),
    hit: clampLine(raw.hit, 'Contact!'),
    miss: clampLine(raw.miss, 'Whiffed it completely.'),
    parried: clampLine(raw.parried, 'Sent right back.'),
  };
}

/** Repère grossier (défense en profondeur, le prompt le demande déjà) : armes réelles ou personnes. */
const REAL_WORLD_RE = /\b(gun|pistol|rifle|firearm|glock|beretta|ak-?47|shotgun|revolver|machete|switchblade|handgun|sniper|person|human face|man['’]?s face|woman['’]?s face)\b/i;

export function looksUnsafe(...fields: (string | undefined)[]): boolean {
  return fields.some((f) => f && REAL_WORLD_RE.test(f));
}
