import type { Accessory, FighterDef, ModelId, Trait } from '../../core/types';
import { postJson } from '../fetch-json';
import { isDataUrl, toResizedJpegBase64 } from '../image';

let counter = 0;
function makeId(): string {
  counter += 1;
  return `custom-fighter-${Date.now().toString(36)}-${counter.toString(36)}`;
}

const FALLBACK_FIGHTER: FighterDef = {
  id: 'stub-fighter',
  name: 'Mystery Bro',
  model: 'rogue_hooded',
  hpMax: 100,
  power: 5,
  agility: 5,
  catchphrase: 'Who, me?'
};

interface ScanFighterApiResult {
  nickname: string;
  hairColor: string;
  hairStyle: string;
  outfitPrimary: string;
  outfitSecondary: string;
  accessory: Accessory;
  stats: { hpMax: number; power: number; agility: number };
  trait: Trait;
  catchphrase: string;
  faceUrl?: string;
}

/** Photo d'une personne → combattant (attributs Gemini + visage sticker). Secours : perso prédéfini. */
export async function scanFighter(image: Blob | string): Promise<FighterDef> {
  // Optionnel : si image est un string, pas de scan. On pourrait implémenter un cache comme scanObject
  if (typeof image === 'string' && !isDataUrl(image)) {
    return FALLBACK_FIGHTER;
  }

  try {
    const { base64, mimeType } = await toResizedJpegBase64(image);
    
    // On utilise un timeout large de 35s car l'API appelle 2 modèles IA en parallèle
    const raw = await postJson<ScanFighterApiResult>('/api/scan-fighter', { imageBase64: base64, mimeType }, 35000);
    
    if (!raw) {
      return FALLBACK_FIGHTER;
    }

    let chosenModel: ModelId = 'knight';
    if (raw.stats?.hpMax >= 110 || raw.trait === 'heavy') chosenModel = 'barbarian';
    else if (raw.stats?.agility >= 5 || raw.trait === 'slippery') chosenModel = 'rogue_hooded';
    else if (raw.trait === 'healing' || raw.trait === 'explosive') chosenModel = 'mage';

    return {
      id: makeId(),
      name: raw.nickname || 'Unknown',
      model: chosenModel,
      hpMax: raw.stats?.hpMax ?? 100,
      power: raw.stats?.power ?? 3,
      agility: raw.stats?.agility ?? 3,
      trait: raw.trait,
      catchphrase: raw.catchphrase,
      portraitUrl: raw.faceUrl,
      look: {
        primary: raw.outfitPrimary,
        secondary: raw.outfitSecondary,
        hair: raw.hairColor,
        accessory: raw.accessory !== 'none' ? raw.accessory : undefined,
        faceUrl: raw.faceUrl
      }
    };
  } catch (err) {
    console.error('[scanFighter] error', err);
    return FALLBACK_FIGHTER;
  }
}
