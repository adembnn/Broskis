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

/** Hypothèses STRUCTURELLES (pas des valeurs visuelles) : géométrie du galion, angle de gîte. */
export const LOCAL_TOKENS = {
  galion: {
    shipScale: 1.45, // ship-pirate-large.glb : coque de 19 x 7 m, à peine plus grande que le pont jouable (18 x 6,8)
    deckLocalY: 2.1, // hauteur (repère du modèle) du haut du bastingage : la coque est abaissée d'autant sous le pont
    tiltDeg: 12,     // angle de gîte demandé par le lot (mécanique de jeu, pas une teinte)
  },
} as const;
