// API publique et synchrone du lot LM, pour les autres lots (gameplay, IA, UI) : où apparaître, où poser
// la Caisse Snap, si une position est au-dessus du vide, quelle map est chargée. Pas d'événements ici :
// ce sont des lectures ponctuelles (l'état vivant passe par le bus, cf. plan/README.md).
import type { MapId, Vec3 } from '../../core/types';
import { currentMapDef, currentMapId, getCrateSpots, getSpawnPoints, isOverVoid } from './engine';

export { getSpawnPoints, getCrateSpots, isOverVoid };

export function currentMap(): MapId | null {
  return currentMapId();
}

/** Emplacement(s) d'un accessoire déclenchable, pour les lots qui veulent réagir à `prop:triggered`
 *  (ex. appliquer des dégâts de zone à `pos` avec `blastRadius`) sans dupliquer la définition de la map. */
export function getPropInfo(propId: string): { pos: Vec3; blastRadius?: number } | null {
  const def = currentMapDef();
  if (!def) return null;
  const prop = def.props.find((p) => p.id === propId);
  if (prop) return { pos: prop.pos, blastRadius: prop.blastRadius };
  if (propId.startsWith('tile:')) {
    const idx = Number(propId.slice(5));
    const tile = def.tiles[idx];
    if (tile) return { pos: tile.pos };
  }
  return null;
}
