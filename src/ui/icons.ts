// Pictogrammes de catégorie d'arme et de map : SVG trait encre, pas d'emoji (règle anti-slop). Une pastille ronde
// de la couleur de catégorie (LOCAL_TOKENS.category) sert de fond ; le pictogramme reste à 2 tons (encre + fond).
import type { Category, MapId } from '../core/types';

const PATHS: Record<Category, string> = {
  // rafale : 3 traits convergents vers une pointe
  blaster: '<path d="M3 12h9M8 7l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="12" r="2" />',
  // grenade : corps rond + goupille
  grenade: '<circle cx="12" cy="14" r="7"/><path d="M12 7V4m-2.5 0h5M9 6l-1.5-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // objet lourd à lancer : losange épais
  throwable: '<path d="M12 3 20 12 12 21 4 12z"/>',
  // bouclier
  shield: '<path d="M12 2.5 19.5 5.5v6c0 5-3.2 8.4-7.5 10-4.3-1.6-7.5-5-7.5-10v-6z"/>',
};

/** Pas de couleur en dur : hérite `color` de l'élément englobant (ink pour un badge, --accent pour un pip HUD…). */
export function categoryIconSvg(category: Category): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${PATHS[category]}</svg>`;
}

export function categoryBadge(category: Category, accent: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'cat-badge';
  span.style.background = accent;
  span.innerHTML = categoryIconSvg(category);
  span.title = category;
  return span;
}

const MAP_PATHS: Record<MapId, string> = {
  // hexagones dont un s'effrite (ligne de fracture)
  archipel:
    '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9z" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M12 3v6l-4 2.5M12 9l4 2.5M4 16.5l8-5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  // coque de galion + mât
  galion:
    '<path d="M3 14h18l-2.5 6h-13z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M12 14V3m0 3 6 2.5-6 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  // damier de plan de travail
  cuisine:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<path d="M12 3.5v17M3.5 12h17" stroke="currentColor" stroke-width="1.4"/>',
};

export function mapIconSvg(id: MapId): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none">${MAP_PATHS[id]}</svg>`;
}
