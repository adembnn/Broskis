// Animation de « forge » pendant l'attente d'un scan (arme, combattant ou objet en plein combat) : un marteau qui
// frappe une enclume, avec des étincelles en traits nets (pas de particules qui scintillent sans raison — anti-slop).
// Purement CSS (keyframes), aucune dépendance au moteur de rendu 3D.
import { el } from './dom';

export interface ForgeWidget {
  root: HTMLDivElement;
  setLabel(text: string): void;
  dispose(): void;
}

const SPARKS = 5;

export function mountForge(label: string): ForgeWidget {
  const root = el('div', 'forge');
  const rig = el('div', 'forge-rig');
  rig.innerHTML = `
    <svg viewBox="0 0 120 90" aria-hidden="true" class="forge-svg">
      <path class="forge-anvil" d="M20 78h50l6-10H30l-4-14h44l8 10h10l-6-18H26l-10 22-8 2z"/>
      <g class="forge-hammer">
        <rect x="54" y="6" width="10" height="34" rx="3" class="forge-handle"/>
        <rect x="40" y="0" width="38" height="16" rx="4" class="forge-head"/>
      </g>
      ${Array.from({ length: SPARKS })
        // écartées en x (pas de rotation) : la classe forge-spark-N anime déjà translate/opacity, pas de conflit CSS.
        .map((_, i) => `<rect class="forge-spark forge-spark-${i}" x="${50 + i * 5}" y="44" width="3" height="9" />`)
        .join('')}
    </svg>`;
  const caption = el('p', 'forge-label', label);
  root.append(rig, caption);
  return {
    root,
    setLabel(text) {
      caption.textContent = text;
    },
    dispose() {},
  };
}
