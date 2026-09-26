// Données prédéfinies : 4 combattants, 6 à 8 armes, 3 maps. En attendant `src/ia/presets.ts` (non créé : hors de mon
// périmètre src/ui/**), tout est défini ici en dur. Chaque objet respecte le contrat de src/core/types.ts
// (budget arme = a+b+c = 10, chaque stat 1..6).
import type { Category, FighterDef, MapId, Weapon } from '../core/types';

export const FIGHTER_PRESETS: FighterDef[] = [
  {
    id: 'preset-barbarian',
    name: 'Big Gustav',
    model: 'barbarian',
    hpMax: 120,
    power: 9,
    agility: 2,
    trait: 'heavy',
    catchphrase: 'Subtlety is for other guys.',
  },
  {
    id: 'preset-knight',
    name: 'Sir Clank',
    model: 'knight',
    hpMax: 110,
    power: 7,
    agility: 4,
    trait: 'loud',
    catchphrase: "I announce every attack. It's tradition.",
  },
  {
    id: 'preset-mage',
    name: 'Nova Fizzlewick',
    model: 'mage',
    hpMax: 85,
    power: 6,
    agility: 5,
    trait: 'healing',
    catchphrase: 'I read the manual. All of it.',
  },
  {
    id: 'preset-rogue',
    name: 'Whisper Vex',
    model: 'rogue_hooded',
    hpMax: 90,
    power: 5,
    agility: 9,
    trait: 'slippery',
    catchphrase: "You won't see the second hit either.",
  },
];

/** Max d'affichage des barres de perso (HP relatif à 80-120, Power/Agility sur une échelle 1-10). */
export const FIGHTER_BAR_MAX = { hp: 120, power: 10, agility: 10 };

function w(
  id: string,
  object: string,
  name: string,
  category: Category,
  stats: [number, number, number],
  trait: Weapon['trait'],
  palette: [string, string],
  why: string,
  lines: Weapon['lines'],
): Weapon {
  const [a, b, c] = stats;
  return { id, object, name, category, why, stats: { a, b, c }, trait, palette, lines, source: 'preset', cooldown: 0 };
}

export const WEAPON_PRESETS: Weapon[] = [
  w('preset-fan', 'desk fan', 'The Breeze-inator', 'blaster', [4, 4, 2], 'loud', ['#F6B964', '#F2A541'],
    'Three speeds. All of them personal.',
    { intro: 'It has three speeds and zero chill.', hit: 'Full blast! Right in the face!', miss: 'Just moved some air.', parried: 'Batted away like lint.' }),
  w('preset-stapler', 'stapler', 'Office Enforcer', 'blaster', [3, 5, 2], 'sticky', ['#E7C88A', '#C68B4E'],
    'Every meeting needed more staples anyway.',
    { intro: "Fully loaded. Don't ask with what.", hit: 'CHK-CHK! Stapled to the spot!', miss: 'Out of staples. Awkward.', parried: 'Jammed on the parry.' }),
  w('preset-bowling', 'bowling ball', 'The Split Ender', 'grenade', [6, 2, 2], 'heavy', ['#8FA766', '#6E8B3D'],
    'Down the lane, into your day.',
    { intro: 'Three finger holes, one bad intention.', hit: 'STRIKE! Right down the middle!', miss: 'Gutter ball. Embarrassing.', parried: 'Sent rolling right back.' }),
  w('preset-balloon', 'party balloon', 'Confetti Doom', 'grenade', [2, 5, 3], 'loud', ['#F2C14E', '#E0662B'],
    "It pops. That's the whole plan.",
    { intro: 'Filled with confetti and bad decisions.', hit: 'POP! Glitter everywhere!', miss: 'Floated off, harmlessly festive.', parried: 'Popped early. Anticlimactic.' }),
  w('preset-pan', 'frying pan', 'Sunday Special', 'throwable', [5, 2, 3], 'heavy', ['#D98B6B', '#8B5A2B'],
    'Breakfast was never this violent.',
    { intro: 'Still has bacon grease on it.', hit: 'CLANG! Breakfast is served!', miss: 'Clattered off into the dirt.', parried: 'Caught and returned to sender.' }),
  w('preset-chicken', 'rubber chicken', 'The Discount Falcon', 'throwable', [2, 5, 3], 'bouncy', ['#F6D9A0', '#D9483B'],
    'Squeaks on impact. Every time.',
    { intro: 'A classic. Slightly cursed.', hit: 'SQUAWK! Direct hit!', miss: 'Squeaked past, insulted.', parried: 'Bounced off, still squeaking.' }),
  w('preset-lid', 'trash can lid', 'Bin Aegis', 'shield', [5, 4, 1], 'heavy', ['#A9B0A6', '#8E8272'],
    'Recycling was never this defensible.',
    { intro: 'Smells faintly of victory.', hit: 'A wall nobody asked for.', miss: 'Dropped it. Oops.', parried: 'Held. Barely.' }),
  w('preset-umbrella', 'umbrella', 'The Parasol Wall', 'shield', [3, 3, 4], 'slippery', ['#BFE3E6', '#2E7F7A'],
    'Blocks blows. Occasionally blocks rain.',
    { intro: 'Rated for hail, not for this.', hit: 'Deflected with style.', miss: 'Blew inside out.', parried: 'Snapped shut just in time.' }),
];

export const MAP_PRESETS: { id: MapId; name: string; blurb: string }[] = [
  { id: 'archipel', name: 'Crumbling Archipelago', blurb: 'Hex tiles that give up beneath you. The outer ring falls every 2 turns.' },
  { id: 'galion', name: 'Stormy Galleon', blurb: 'A cannon nobody asked for, and a deck that tilts every 3 turns.' },
  { id: 'cuisine', name: 'Giant Kitchen', blurb: "You are tiny. The toaster is not. The sink is the exit." },
];
