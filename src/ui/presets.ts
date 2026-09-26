// Données prédéfinies de l'interface : 4 combattants, 3 maps. Les armes viennent de src/ia/presets.ts (les 8 vraies,
// avec sticker et voix), plus aucune arme inventée ici.
import type { FighterDef, MapId, Weapon } from '../core/types';
import { PRESET_WEAPONS, presetsReady } from '../ia/presets';

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

/**
 * Armes du râtelier = les 8 vraies armes générées (public/assets/presets/presets.json : sticker Nano Banana Pro +
 * voix de l'animateur), chargées par src/ia/presets.ts. Attendre `presetsReady` avant d'appeler (sinon on lirait
 * encore la banque de secours codée en dur, sans sticker).
 */
export function weaponPresets(): Weapon[] {
  return PRESET_WEAPONS;
}
export { presetsReady };

export const MAP_PRESETS: { id: MapId; name: string; blurb: string }[] = [
  { id: 'archipel', name: 'Crumbling Archipelago', blurb: 'Hex tiles that give up beneath you. The outer ring falls every 2 turns.' },
  { id: 'galion', name: 'Stormy Galleon', blurb: 'A cannon nobody asked for, and a deck that tilts every 3 turns.' },
  { id: 'cuisine', name: 'Giant Kitchen', blurb: "You are tiny. The toaster is not. The sink is the exit." },
];
