// Banque de secours (lot LI) : utilisée quand le réseau est mort, que Gemini refuse, ou en ?demo=1 sans cache.
// 8 objets du quotidien codés en dur ci-dessous (une base qui marche sans rien d'autre), remplacés en tâche
// de fond par public/assets/presets/presets.json s'il est présent (8 armes + stickers jpg + voix wav déjà
// générées avec de vraies clés, voir plan/SUIVI.md) — jamais l'inverse, cette banque reste le filet de
// sécurité si ce fichier manque ou que le réseau est coupé (c'est le cas dans CE worktree).
import type { Weapon } from '../core/types';
import type { CommentaryKind } from './config';
import { primeAudioUrl } from './tts-client';
import {
  clampCategory,
  clampLines,
  clampObject,
  clampPalette,
  clampStats,
  clampTrait,
  clampWeaponName,
  clampWhy,
} from './sanitize';

function preset(w: Omit<Weapon, 'source' | 'cooldown'>): Weapon {
  return { ...w, source: 'preset', cooldown: 0 };
}

export const PRESET_WEAPONS: Weapon[] = [
  preset({
    id: 'preset-hand-mixer',
    object: 'electric hand mixer',
    name: 'The Batter Blaster',
    category: 'blaster',
    why: "Whisks so fast it forgets it isn't a gun.",
    stats: { a: 2, b: 6, c: 2 },
    trait: 'loud',
    palette: ['#c9c9c9', '#d63447'],
    lines: {
      intro: "Look out — fully charged and full of batter!",
      hit: 'Whipped clean!',
      miss: 'Batter everywhere, target nowhere.',
      parried: 'Sent back, still spinning.',
    },
  }),
  preset({
    id: 'preset-hose-nozzle',
    object: 'garden hose nozzle',
    name: 'Old Faithful Jr.',
    category: 'blaster',
    why: 'Technically a fire hose. Mostly a soaking hazard.',
    stats: { a: 3, b: 4, c: 3 },
    trait: 'slippery',
    palette: ['#3b7a57', '#c9a227'],
    lines: {
      intro: "Hope you brought a towel.",
      hit: 'Soaked and shocked!',
      miss: "Missed, but the floor's wet now.",
      parried: 'Redirected, still dripping.',
    },
  }),
  preset({
    id: 'preset-rubber-duck',
    object: 'rubber duck',
    name: 'Quackenade',
    category: 'grenade',
    why: 'Squeaks once, then ruins your whole day.',
    stats: { a: 4, b: 3, c: 3 },
    trait: 'bouncy',
    palette: ['#f5c518', '#e8702a'],
    lines: {
      intro: 'Cute. Deceptively cute.',
      hit: 'QUACK! Direct hit!',
      miss: 'It just floats away, unbothered.',
      parried: 'Sent back to the bathtub.',
    },
  }),
  preset({
    id: 'preset-snow-globe',
    object: 'snow globe',
    name: 'The Blizzard Bomb',
    category: 'grenade',
    why: 'Shakes once, shatters into a tiny angry winter.',
    stats: { a: 3, b: 4, c: 3 },
    trait: 'split',
    palette: ['#4a90c4', '#eef3f6'],
    lines: {
      intro: "Careful — it's got a whole season bottled up.",
      hit: 'A blizzard, indoors!',
      miss: 'It just rolls away, unbroken.',
      parried: 'Batted back before it could snow.',
    },
  }),
  preset({
    id: 'preset-frying-pan',
    object: 'cast iron frying pan',
    name: 'The Breakfast Ender',
    category: 'throwable',
    why: 'Forged for eggs. Repurposed for justice.',
    stats: { a: 6, b: 1, c: 3 },
    trait: 'heavy',
    palette: ['#2b2b2b', '#f2c14e'],
    lines: {
      intro: 'This thing has ended more mornings than alarms.',
      hit: 'CLANG! Breakfast is over.',
      miss: 'Too heavy — landed early.',
      parried: 'Batted back, dented pride only.',
    },
  }),
  preset({
    id: 'preset-duct-tape',
    object: 'roll of duct tape',
    name: 'Sticky Situation',
    category: 'throwable',
    why: "Fixes everything. Especially your opponent's shoes to the floor.",
    stats: { a: 2, b: 5, c: 3 },
    trait: 'sticky',
    palette: ['#b6b6b6', '#8a5a34'],
    lines: {
      intro: 'Silver, sticky, and deeply unfair.',
      hit: "Stuck! That's going to peel.",
      miss: 'Rolled off harmlessly.',
      parried: 'Bounced back, somehow still sticky.',
    },
  }),
  preset({
    id: 'preset-ironing-board',
    object: 'ironing board',
    name: 'The Pressing Matter',
    category: 'shield',
    why: 'Presses out wrinkles. And your opponent’s plans.',
    stats: { a: 4, b: 4, c: 2 },
    trait: 'healing',
    palette: ['#d8d2c4', '#5f8fa6'],
    lines: {
      intro: 'Steam vents rated for combat. Somehow.',
      hit: 'Reflected — pressed flat on the way back.',
      miss: 'It just stands there. Bravely.',
      parried: 'The board finally gives out. Wrinkled.',
    },
  }),
  preset({
    id: 'preset-beanbag',
    object: 'beanbag chair',
    name: 'The Comfy Wall',
    category: 'shield',
    why: "Filled with beans. And something that shouldn't be in there.",
    stats: { a: 3, b: 5, c: 2 },
    trait: 'explosive',
    palette: ['#7a3b3b', '#caa46d'],
    lines: {
      intro: 'Sit on it, or hide behind it. Your call.',
      hit: 'Reflected — and it POPPED a little.',
      miss: 'Just absorbs it. Rude, but effective.',
      parried: 'It finally bursts. Beans everywhere.',
    },
  }),
];

const REMOTE_PRESETS_URL = '/assets/presets/presets.json';

interface RemotePresetRaw {
  id?: unknown;
  object?: unknown;
  weaponName?: unknown;
  name?: unknown;
  category?: unknown;
  why?: unknown;
  stats?: unknown;
  trait?: unknown;
  palette?: unknown;
  lines?: unknown;
  stickerUrl?: unknown;
  /** Ligne d'intro déjà vocalisée (fichier .wav), voir public/assets/presets/presets.json sur main. */
  voiceUrl?: unknown;
}

function mapRemotePreset(raw: RemotePresetRaw): Weapon | null {
  if (!raw || typeof raw !== 'object') return null;
  const category = clampCategory(raw.category);
  const object = clampObject(raw.object);
  if (object === 'mystery object') return null; // rien d'exploitable, on ignore plutôt que de polluer la banque
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `preset-remote-${object.replace(/\s+/g, '-')}`,
    object,
    name: clampWeaponName(raw.weaponName ?? raw.name),
    category,
    why: clampWhy(raw.why),
    stats: clampStats(raw.stats),
    trait: clampTrait(raw.trait, category.length),
    palette: clampPalette(raw.palette),
    stickerUrl: typeof raw.stickerUrl === 'string' ? raw.stickerUrl : undefined,
    lines: clampLines(raw.lines),
    source: 'preset',
    cooldown: 0,
  };
}

/**
 * Remplace la banque codée en dur par public/assets/presets/presets.json si ce fichier existe (asset
 * partagé, pas dans les chemins de ce lot — on ne fait que le LIRE). Tâche de fond, jamais bloquant :
 * les tout premiers appels avant résolution utilisent encore la banque codée en dur ci-dessus, ce qui
 * reste correct dans les deux cas. Navigateur uniquement (rien à charger côté serveur, api/*.ts a sa
 * propre copie de secours synchrone).
 */
async function tryLoadRemotePresets(): Promise<void> {
  try {
    const res = await fetch(REMOTE_PRESETS_URL, { cache: 'force-cache' });
    // Vite dev sert index.html (200, text/html) pour toute route inconnue (SPA fallback) : un simple
    // `res.ok` ne suffit pas à détecter un fichier manquant, il faut vérifier le type de contenu.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw) || !raw.length) return;
    const mapped = (raw as RemotePresetRaw[]).map((r) => ({ weapon: mapRemotePreset(r), voiceUrl: r?.voiceUrl }));
    const weapons = mapped.map((m) => m.weapon).filter((w): w is Weapon => w !== null);
    if (!weapons.length) return;
    PRESET_WEAPONS.length = 0;
    PRESET_WEAPONS.push(...weapons);
    for (const { weapon, voiceUrl } of mapped) {
      if (weapon && typeof voiceUrl === 'string' && voiceUrl) primeAudioUrl(weapon.lines.intro, voiceUrl);
    }
  } catch {
    // pas de fichier, réseau coupé, JSON invalide... la banque codée en dur reste en place.
  }
}

if (typeof window !== 'undefined') void tryLoadRemotePresets();

function cloneWithFreshId(w: Weapon, rng: () => number): Weapon {
  // Copie : chaque scan raté doit renvoyer sa propre instance (id unique), pas l'objet partagé du bank.
  return { ...w, id: `${w.id}-${Math.floor(rng() * 1e6)}` };
}

/** Un objet tapé au clavier qui correspond exactement à un nom de la banque (ex. tests, régie de démo). */
export function findPresetByObjectName(name: string): Weapon | undefined {
  const norm = name.trim().toLowerCase();
  return PRESET_WEAPONS.find((w) => w.object.toLowerCase() === norm);
}

export function pickPreset(rng: () => number = Math.random, category?: Weapon['category']): Weapon {
  const pool = category ? PRESET_WEAPONS.filter((w) => w.category === category) : PRESET_WEAPONS;
  const list = pool.length ? pool : PRESET_WEAPONS;
  const w = list[Math.floor(rng() * list.length)];
  return cloneWithFreshId(w, rng);
}

/**
 * Répliques génériques de l'animateur (persona Nigel Crankshaft, voir src/ia/commentary.ts) utilisées
 * seulement si api/commentary est injoignable ET que rien n'est encore en cache. Volontairement courtes,
 * jamais deux fois la même dans un match grâce au tirage sans remise géré par le pickeur.
 */
export const FALLBACK_COMMENTARY: Record<CommentaryKind, string[]> = {
  hit: ['Contact! Right where it counts.', 'That connected. That really connected.', "Oh, that's gonna leave a mark."],
  crit: ['OH! Right in the— and that\'s the WHOLE SANDWICH!', 'CRITICAL! Nobody saw that coming, least of all them.', 'Straight through the guard, folks!'],
  miss: ['Swing and a whole lot of nothing.', 'Air! Pure, undefeated air.', "Missed — that object was clearly built for something else."],
  'parry-perfect': ['PERFECT parry — and that\'s the WHOLE SANDWICH!', 'Timed to the millisecond. Unfair, honestly.', 'Reflected! Right back where it came from.'],
  'low-hp': ["They're hanging by a thread out there.", 'One good hit ends this. Any second now.', "Legs are wobbling. It's getting dangerous."],
  ko: ["KO! And that's the WHOLE SANDWICH, folks!", "It's over! Down and staying down.", 'Lights out! Somebody check on them.'],
  'match-start': ["Two fighters, zero common sense — let's go!", "Here we go — I have no idea what these objects do!", 'Weapons up! Questionable choices, all of them.'],
  'crate-grab': ['Crate secured! Ten seconds to scan something silly.', 'Grabbed it! Point that camera at literally anything.', 'Fresh crate, fresh nonsense — scan away!'],
};
