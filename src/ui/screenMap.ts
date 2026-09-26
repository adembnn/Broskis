// Choix de l'arène (lot LUX) : 3 grandes vignettes peintes aux couleurs de chaque map (mapThumbs.ts), nom, danger
// en une ligne. Un clic = on y va (un seul appel à l'action). Clavier : 1 2 3.
import type { MapId } from '../core/types';
import { clear, el, menuScreen } from './dom';
import { kbd } from './keys';
import { mapThumbSvg } from './mapThumbs';
import { MAP_PRESETS } from './presets';

function mapTile(preset: (typeof MAP_PRESETS)[number], index: number, onPick: () => void): HTMLDivElement {
  const tile = el('div', 'map-tile');
  tile.tabIndex = 0;
  const art = el('div', 'map-thumb');
  art.innerHTML = mapThumbSvg(preset.id);
  const name = el('div', 'map-tile-head');
  name.append(kbd(String(index + 1)), el('h3', 'b-title map-tile-name', preset.name));
  tile.append(art, name, el('p', 'map-tile-blurb', preset.blurb));
  tile.addEventListener('click', onPick);
  tile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick();
    }
  });
  return tile;
}

export function runMapSelect(screenLayer: HTMLElement): Promise<MapId> {
  clear(screenLayer);
  const { root, card } = menuScreen('map-card');
  card.append(el('h2', 'b-title', 'Pick the arena'));
  const grid = el('div', 'map-grid');
  card.append(grid);
  screenLayer.append(root);

  return new Promise((resolve) => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0 && MAP_PRESETS[i]) pick(MAP_PRESETS[i].id);
    };
    function pick(id: MapId) {
      window.removeEventListener('keydown', onKey);
      resolve(id);
    }
    window.addEventListener('keydown', onKey);
    MAP_PRESETS.forEach((preset, i) => grid.append(mapTile(preset, i, () => pick(preset.id))));
  });
}
