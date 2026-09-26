// STUB du lot L0 — à remplacer par le lot LP (plan/lots/LP-perso-photo.md).
import type { FighterDef } from '../../core/types';

/** Photo d'une personne → combattant (attributs Gemini + visage sticker). Secours : perso prédéfini. */
export async function scanFighter(_image: Blob | string): Promise<FighterDef> {
  return { id: 'stub-fighter', name: 'Mystery Bro', model: 'rogue_hooded', hpMax: 100, power: 5, agility: 5, catchphrase: 'Who, me?' };
}
