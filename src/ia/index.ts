// STUB du lot L0 — à remplacer par le lot LI (plan/lots/LI-pipeline-ia.md). Les signatures sont le contrat :
// l'interface (LU) et le gameplay (LG) les appellent déjà ; ce stub renvoie des armes factices pour qu'ils avancent.
import type { Category, Install, PlayerId, Weapon } from '../core/types';

export interface ScanOptions { category?: Category; player?: PlayerId }

let n = 0;
function fakeWeapon(category: Category = 'grenade'): Weapon {
  n += 1;
  return {
    id: `stub-${n}`,
    object: 'rubber duck',
    name: 'Quack Attack',
    category,
    why: 'It floats, it squeaks, it explodes.',
    stats: { a: 4, b: 3, c: 3 },
    trait: 'bouncy',
    palette: ['#f2c14e', '#e0662b'],
    lines: {
      intro: 'A rubber duck! Somebody call the lifeguard!',
      hit: 'QUACK! Right in the feathers!',
      miss: 'The duck swims away...',
      parried: 'Sent back to the pond!',
    },
    source: 'preset',
    cooldown: 0,
  };
}

/** Photo d'un objet → arme (stats JSON + sticker). */
export async function scanObject(_image: Blob | string, opts: ScanOptions = {}): Promise<Weapon> {
  return fakeWeapon(opts.category);
}

/** Génère et vocalise les répliques de l'animateur pendant la présentation des armes. */
export async function prepareCommentary(_weapons: Weapon[]): Promise<void> {}

/** Demande une réplique pour un événement (émise ensuite sur le bus en `commentary:line`). */
export function say(_event: string, _data?: unknown): void {}

export const install: Install = () => {};
