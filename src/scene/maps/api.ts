// API publique et synchrone des maps, pour les autres lots (gameplay, caméra, UI) : où apparaître, où
// réapparaître, taille de l'arène, plateformes traversables, si une position est au-dessus du vide.
// Pas d'événements ici : ce sont des lectures ponctuelles (l'état vivant passe par le bus).
import type { MapId, Vec3 } from '../../core/types';
import { currentMapDef, currentMapId, getArenaBounds, getCrateSpots, getSpawnPoints, isOneWayCollider, isOverVoid } from './engine';

export { getSpawnPoints, getCrateSpots, isOverVoid, getArenaBounds, isOneWayCollider };
/** Hauteur max (m) d'une plateforme / marche au-dessus du plateau : le double saut doit la dépasser (LJUMP). */
export { MAX_LEDGE_HEIGHT } from './types';

export function currentMap(): MapId | null {
  return currentMapId();
}

/** Emplacement d'un accessoire déclenchable (réaction à `prop:triggered`) sans dupliquer la map. */
export function getPropInfo(propId: string): { pos: Vec3; blastRadius?: number } | null {
  const def = currentMapDef();
  if (!def) return null;
  const prop = def.props.find((p) => p.id === propId);
  if (prop) return { pos: prop.pos, blastRadius: prop.blastRadius };
  return null;
}
