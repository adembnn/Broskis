// Pont vers src/art/tokens.js (lot LDA2 en parallèle). Ce lot ne modifie JAMAIS tokens.js.
// LOCAL_TOKENS ne garde que ce qui n'est PAS une valeur visuelle (hypothèses structurelles).
import * as artTokens from '../../art/tokens.js';

export const palette = artTokens.palette as { fond: string; matiere: string; lumiere: string; joueur: string; danger: string };

export const rendu = artTokens.rendu as {
  toneMapping: string;
  paliers: { heros: number; decor: number; plancher: number };
  contour: { encre: string; vinyle: string; epaisseur: { encre: number; vinyle: number; lisere: number; prop: number; sticker: number } };
  rayures: { largeur: number; angle: number };
  ombres: { tache: number };
};

export interface MapPalette { fond: string; sol: string; matiere: string; accent: string; lumiere: string }
export interface MapLightDirectional { type: 'directionnelle'; couleur: string; intensite: number; position: [number, number, number] }
export interface MapLightSpot { type: 'spot'; couleur: string; intensite: number; position: [number, number, number]; angle: number; penombre: number; decroissance: number }
export interface MapDecorGrade { saturation: number; teinte: string }

export interface ArchipelTokens {
  palette: MapPalette;
  ciel: { haut: string; horizon: string; bas: string };
  panorama: { image: string; rotation: number; intensite: number; repetitions: number; horizon: number; haut: string; bas: string; chroma: number; brume: number }; // LSKY
  brouillard: { couleur: string; debut: number; fin: number };
  hemi: { ciel: string; sol: string; intensite: number };
  principale: MapLightDirectional;
  pratique: { couleur: string; intensite: number; portee: number; decroissance: number; vacillement: number };
  decor: MapDecorGrade;
  corbeaux: { nombre: number; couleur: string; envol: number };
}
export interface GalionTokens {
  palette: MapPalette;
  ciel: { haut: string; horizon: string; bas: string };
  panorama: { image: string; rotation: number; intensite: number; repetitions: number; horizon: number; haut: string; bas: string; chroma: number; brume: number }; // LSKY
  brouillard: { couleur: string; debut: number; fin: number };
  hemi: { ciel: string; sol: string; intensite: number };
  principale: MapLightDirectional;
  pratique: { couleur: string; intensite: number; portee: number; decroissance: number; vacillement: number };
  decor: MapDecorGrade;
  mer: { ecume: string; couronnes: [number, number, number]; vitesses: [number, number, number]; houle: number };
  vague: { hauteur: number };
  eclair: { fond: string; facteur: number; duree: number; flashs: number; intervalle: [number, number] };
}
export interface CuisineTokens {
  palette: MapPalette;
  ciel: { haut: string; horizon: string; bas: string };
  panorama: { image: string; rotation: number; intensite: number; repetitions: number; horizon: number; haut: string; bas: string; chroma: number; brume: number }; // LSKY
  brouillard: { couleur: string; debut: number; fin: number };
  hemi: { ciel: string; sol: string; intensite: number };
  principale: MapLightSpot;
  pratique: { couleur: string; intensite: number; portee: number; decroissance: number; vacillement: number };
  decor: MapDecorGrade;
  cafe: { couleur: string; opacite: number; rayon: number; epaisseur: number };
}

const mapsToken = artTokens.maps as { archipel: ArchipelTokens; galion: GalionTokens; cuisine: CuisineTokens };

export function archipelTokens(): ArchipelTokens { return mapsToken.archipel; }
export function galionTokens(): GalionTokens { return mapsToken.galion; }
export function cuisineTokens(): CuisineTokens { return mapsToken.cuisine; }

// ---------------------------------------------------------------------------
// Lot LMAP3 : revêtements et variations (valeurs VISUELLES du plateau, propres à ce lot ; le ciel, le
// brouillard et les lumières restent dans src/art/tokens.js).
// ---------------------------------------------------------------------------
export type DetailKind = 'bois' | 'herbe' | 'pierre' | 'faience';

/** Texture de détail triplanaire : echelle = répétitions par mètre, force = 0 (rien) à 1 (plein contraste),
 *  relief = intensité du relief (la texture sert aussi de carte de hauteur). */
export const SURFACES: Record<DetailKind, { echelle: number; force: number; relief: number; /** image tuilable (lot LTEX), ex. '/assets/textures/pont-bois.png' ; absente = texture procédurale */ image?: string }> = {
  bois: { echelle: 0.3, force: 0.7, relief: 0.3 },
  herbe: { echelle: 0.5, force: 0.8, relief: 0.5 },
  pierre: { echelle: 0.4, force: 0.75, relief: 0.6 },
  faience: { echelle: 0.4, force: 0.5, relief: 0.1 },
};

export const PLATEAU = {
  /** Archipel : grade des dalles hex (pleine couleur, le décor lointain reste désaturé). */
  archipelDalles: { saturation: 0.8, teinte: '#F6F0E4' },
  /** Variation de teinte par dalle / planche : ± luminosité, ± teinte (tours de roue chromatique). */
  variation: { luminosite: 0.16, teinte: 0.02 },
  /** Galion : largeur (m) du liseré de plat-bord sombre peint au bord du pont. */
  liserePont: 0.45,
  /** Grille-pain de la cuisine : chrome, bakélite, pain de mie, croûte, levier. */
  grillePain: { chrome: '#C9CFD2', bakelite: '#2B2522', mie: '#E8C489', croute: '#9A5A26', levier: '#D8402E', metal: 0.85, rugosite: 0.22 },
  /** Rouleau à pâtisserie : hêtre clair. */
  rouleau: { bois: '#C99A62' },
  /** Éponge : mousse et grattoir. */
  eponge: { mousse: '#E8C84A', grattoir: '#3E7A4A' },
};

/** Hypothèses STRUCTURELLES (pas des valeurs visuelles) : géométrie du galion, angle de gîte. */
export const LOCAL_TOKENS = {
  galion: {
    shipScale: 2.14, // ship-pirate-large.glb : 13,1 x 4,8 m -> coque de 28 x 10,3 m sous le pont jouable (LMAP3)
    deckLocalY: 2.1, // hauteur (repère du modèle) du haut du bastingage : la coque est abaissée d'autant sous le pont
    tiltDeg: 12,     // angle de gîte demandé par le lot (mécanique de jeu, pas une teinte)
  },
} as const;
