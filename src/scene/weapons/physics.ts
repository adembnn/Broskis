// « Une chaise n'est pas une canette » (Adem, 15h50) : ce que le rendu déduit de `weapon.physics` (contrat
// WeaponPhysics, estimé par le scan, borné par le code). Les vieilles armes (presets sans physique) reçoivent une
// estimation par mots-clés de l'objet, puis par catégorie : la démo hors ligne montre aussi des objets différents.
import type { Category, Material, ObjectShape, Weapon, WeaponPhysics } from '../../core/types';
import { WEAPON_FX } from './tokens';

type Guess = Partial<WeaponPhysics> & { words: string[] };

// Du plus précis au plus général : le 1er mot-clé trouvé dans `weapon.object` gagne.
const GUESSES: Guess[] = [
  { words: ['office chair'], massKg: 12, sizeM: [1.1, 0.65, 0.65], material: 'plastic', shape: 'irregular', bounciness: 0.2 },
  { words: ['chair', 'stool'], massKg: 6, sizeM: [0.9, 0.5, 0.5], material: 'wood', shape: 'box', bounciness: 0.15 },
  { words: ['gnome', 'statue', 'figurine'], massKg: 3, sizeM: [0.45, 0.22, 0.22], material: 'ceramic', shape: 'irregular', fragile: true },
  { words: ['frying pan', 'pan', 'skillet', 'wok'], massKg: 1.6, sizeM: [0.06, 0.3, 0.5], material: 'metal', shape: 'flat' },
  { words: ['lid', 'plate', 'frisbee', 'tray', 'record'], massKg: 0.5, sizeM: [0.03, 0.3, 0.3], material: 'metal', shape: 'flat' },
  { words: ['rubber duck', 'duck'], massKg: 0.1, sizeM: [0.12, 0.12, 0.1], material: 'rubber', shape: 'round', bounciness: 0.85 },
  { words: ['ball', 'orange', 'apple', 'globe', 'egg'], massKg: 0.3, sizeM: [0.2, 0.2, 0.2], material: 'rubber', shape: 'round', bounciness: 0.7 },
  { words: ['baguette', 'bread'], massKg: 0.25, sizeM: [0.65, 0.07, 0.06], material: 'food', shape: 'long' },
  { words: ['banana'], massKg: 0.15, sizeM: [0.2, 0.04, 0.04], material: 'food', shape: 'long' },
  { words: ['pizza', 'cake', 'pie', 'sandwich', 'cheese'], massKg: 0.5, sizeM: [0.05, 0.3, 0.3], material: 'food', shape: 'flat' },
  { words: ['smartphone', 'phone', 'tablet'], massKg: 0.2, sizeM: [0.15, 0.075, 0.009], material: 'glass', shape: 'flat', fragile: true },
  { words: ['stapler', 'wrench', 'hammer', 'key', 'scissors'], massKg: 0.4, sizeM: [0.07, 0.05, 0.18], material: 'metal', shape: 'box' },
  { words: ['can', 'soda'], massKg: 0.37, sizeM: [0.12, 0.066, 0.066], material: 'metal', shape: 'round', liquid: true },
  { words: ['bottle', 'jar', 'glass', 'vase'], massKg: 0.8, sizeM: [0.3, 0.08, 0.08], material: 'glass', shape: 'long', fragile: true, liquid: true },
  { words: ['mug', 'cup', 'teapot'], massKg: 0.35, sizeM: [0.1, 0.12, 0.09], material: 'ceramic', shape: 'irregular', fragile: true, liquid: true },
  { words: ['book', 'notebook', 'newspaper', 'magazine', 'paper'], massKg: 0.5, sizeM: [0.24, 0.17, 0.03], material: 'paper', shape: 'flat' },
  { words: ['pillow', 'sock', 'shirt', 'plush', 'teddy', 'hat', 'towel', 'scarf'], massKg: 0.3, sizeM: [0.4, 0.3, 0.12], material: 'fabric', shape: 'irregular', bounciness: 0.1 },
  { words: ['bat', 'broom', 'umbrella', 'stick', 'sword', 'pencil', 'pen', 'spoon', 'fork', 'knife', 'remote'], massKg: 0.6, sizeM: [0.8, 0.06, 0.06], material: 'wood', shape: 'long' },
  { words: ['rock', 'stone', 'brick'], massKg: 2, sizeM: [0.2, 0.2, 0.15], material: 'stone', shape: 'irregular' },
  { words: ['box', 'toaster', 'microwave', 'cube'], massKg: 2, sizeM: [0.25, 0.3, 0.25], material: 'plastic', shape: 'box' },
  { words: ['mixer', 'blender', 'drill', 'hair dryer'], massKg: 1, sizeM: [0.3, 0.12, 0.2], material: 'plastic', shape: 'irregular' },
];

const BY_CATEGORY: Record<Category, WeaponPhysics> = {
  blaster: { massKg: 0.8, sizeM: [0.2, 0.08, 0.35], material: 'plastic', shape: 'irregular', bounciness: 0.3, fragile: false, liquid: false },
  grenade: { massKg: 0.4, sizeM: [0.15, 0.15, 0.15], material: 'plastic', shape: 'round', bounciness: 0.5, fragile: false, liquid: false },
  throwable: { massKg: 1.5, sizeM: [0.35, 0.25, 0.2], material: 'wood', shape: 'irregular', bounciness: 0.3, fragile: false, liquid: false },
  shield: { massKg: 3, sizeM: [0.6, 0.6, 0.05], material: 'metal', shape: 'flat', bounciness: 0.2, fragile: false, liquid: false },
};

const cache = new WeakMap<Weapon, WeaponPhysics>();

/** Physique réelle de l'arme, ou estimation (mots-clés de l'objet, sinon catégorie). */
export function physicsOf(w: Weapon): WeaponPhysics {
  if (w.physics) return w.physics;
  let p = cache.get(w);
  if (p) return p;
  const name = `${w.object ?? ''} ${w.name ?? ''}`.toLowerCase();
  const g = GUESSES.find((x) => x.words.some((k) => name.includes(k)));
  const base = BY_CATEGORY[w.category] ?? BY_CATEGORY.throwable;
  p = { ...base, ...(g ?? {}) } as WeaponPhysics;
  delete (p as Partial<Guess>).words;
  cache.set(w, p);
  return p;
}

export interface ObjectLook {
  phys: WeaponPhysics;
  /** Taille affichée (m, plus grande dimension) : la vraie, bornée pour rester lisible (0,35 à 1,6 m). */
  size: number;
  /** 0 (≈ 50 g) → 1 (≈ 20 kg), échelle logarithmique : pilote traînée, ombre, secousse, poussière. */
  weight: number;
  /** Épaisseur réelle / plus grande dimension : épaisseur de l'extrusion du sticker. */
  depthRatio: number;
  /** Tours par seconde en vol (≈ 1 / masse). */
  turns: number;
  material: Material;
  shape: ObjectShape;
}

export function lookOf(w: Weapon): ObjectLook {
  const phys = physicsOf(w);
  const [h, wd, d] = phys.sizeM;
  const largest = Math.max(h, wd, d, 0.01);
  const size = Math.min(WEAPON_FX.physique.tailleMax, Math.max(WEAPON_FX.physique.tailleMin, largest));
  const m = Math.max(0.02, phys.massKg);
  const weight = Math.min(1, Math.max(0, (Math.log(m) - Math.log(0.05)) / (Math.log(20) - Math.log(0.05))));
  // Le sticker montre la face (hauteur × largeur) : l'extrusion, c'est la profondeur réelle.
  const depthRatio = Math.min(1, Math.max(0.03, d / Math.max(h, wd, 0.01)));
  const turns = Math.min(WEAPON_FX.physique.toursMax, Math.max(WEAPON_FX.physique.toursMin, WEAPON_FX.physique.tours / Math.sqrt(m)));
  return { phys, size, weight, depthRatio, turns, material: phys.material, shape: phys.shape };
}
