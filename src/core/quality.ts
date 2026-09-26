// Qualité automatique (lot LPERF). Mesuré sur le PC d'Adem : sur la puce Intel intégrée (celle que Chrome prend
// par défaut sur un portable à 2 GPU), le post-traitement (MSAA ×4 sur cible HalfFloat + bloom) coûte ~20 ms
// par image : 28 i/s au lieu de 64. Au 1er tour jouable, on mesure 2 s d'images ; si la médiane dépasse
// 20 ms (< 50 i/s), on passe en « basse » : rendu direct dans le canvas (anticrénelage natif, sans bloom).
// Les shaders du rendu direct sont d'abord compilés en tâche de fond (`preparer`) : sinon la bascule gèle
// l'écran ~1 s. Sur un bon GPU rien ne change. Forçable dans l'URL : ?q=haute ou ?q=basse.
import type { Bus } from './bus';

export type Qualite = 'haute' | 'basse';

export interface QualiteCtl {
  niveau: Qualite;
  /** Temps d'image médian mesuré (ms) ; null tant que la mesure n'est pas faite. */
  medianeMs: number | null;
  set(n: Qualite): void;
  /** Appelée à chaque frame par le système de rendu, avec le temps réel écoulé (s). */
  frame(real: number): void;
}

const SEUIL_MS = 20;
const MESURE_S = 2;

declare global { interface Window { __qualite?: QualiteCtl } }

export function createQualite(bus: Bus, preparer: (n: Qualite) => Promise<unknown>): QualiteCtl {
  const url = new URLSearchParams(location.search).get('q');
  const force: Qualite | null = url === 'haute' || url === 'basse' ? url : null;
  const echantillons: number[] = [];
  let mesure = false;
  let cumul = 0;

  const q: QualiteCtl = {
    niveau: 'haute',
    medianeMs: null,
    set(n) {
      if (q.niveau === n) return;
      void preparer(n).catch(() => {}).then(() => {
        q.niveau = n;
        console.info(`[qualité] ${n}${q.medianeMs != null ? ` (image médiane ${q.medianeMs.toFixed(1)} ms)` : ''}`);
      });
    },
    frame(real) {
      if (!mesure) return;
      echantillons.push(real * 1000);
      cumul += real;
      if (cumul < MESURE_S) return;
      mesure = false;
      echantillons.sort((a, b) => a - b);
      q.medianeMs = echantillons[echantillons.length >> 1];
      if (q.medianeMs > SEUIL_MS) q.set('basse');
    },
  };
  if (force === 'basse') q.set('basse');

  // Au 1er tour jouable (map chargée, bandeau passé) : c'est la charge réelle du match.
  if (!force) {
    bus.on('phase:change', ({ to }) => {
      if (to !== 'move' || mesure || q.medianeMs != null) return;
      echantillons.length = 0;
      cumul = 0;
      mesure = true;
    });
  }
  window.__qualite = q; // débogage : window.__qualite.set('basse')
  return q;
}
