// Choix de la map : 3 vignettes (Crumbling Archipelago, Stormy Galleon, Giant Kitchen).
import type { MapId } from '../core/types';
import { preloadMap } from '../core/preload';
import { clear, el, menuScreen } from './dom';
import { mapIconSvg } from './icons';
import { MAP_PRESETS } from './presets';

function mapTile(preset: (typeof MAP_PRESETS)[number], onPick: () => void): HTMLDivElement {
  const tile = el('div', 'map-tile');
  tile.tabIndex = 0;
  const art = el('div', 'map-tile-art');
  art.innerHTML = mapIconSvg(preset.id);
  tile.append(art, el('h3', 'b-title map-tile-name', preset.name), el('p', 'map-tile-blurb', preset.blurb));
  const pick = () => onPick();
  // LLOAD : survol ou focus = intention (instant.page) → la map se charge avant le clic.
  const warm = () => preloadMap(preset.id);
  tile.addEventListener('pointerenter', warm);
  tile.addEventListener('focus', warm);
  tile.addEventListener('click', pick);
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  return tile;
}

export function runMapSelect(screenLayer: HTMLElement): Promise<MapId> {
  clear(screenLayer);
  const { root, card } = menuScreen('map-card');
  card.append(el('h2', 'b-title', 'Choose the arena'));
  const grid = el('div', 'map-grid');
  card.append(grid);
  screenLayer.append(root);

  return new Promise((resolve) => {
    for (const preset of MAP_PRESETS) grid.append(mapTile(preset, () => resolve(preset.id)));
  });
}
