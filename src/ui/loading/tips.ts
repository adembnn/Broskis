// Astuces de jeu (anglais) qui tournent pendant une attente (lot LLOAD). Maister : un temps occupé paraît plus court
// qu'un temps vide. Chaque astuce apprend une vraie règle du jeu (pas de blague creuse), la plus utile d'abord.
// API : mountTips(el) remplit `el` et change d'astuce toutes les `everyMs` ; renvoie une fonction d'arrêt.
import { durees } from '../../art/tokens.js';

// Règles du temps réel (plan/PIVOT-TEMPS-REEL.md) ; aucune touche nommée : elles sont réglables (src/core/input.ts).
export const TIPS: readonly string[] = [
  'The higher your <b>%</b>, the further you fly. Stay away from the edge!',
  'Block right before the hit lands: a <b>perfect parry</b> sends it straight back.',
  'Hold <b>fire</b> to charge: stronger and further.',
  'Grenades lob over walls. Blasters stop at the first wall.',
  'Touch the <b>Snap Crate</b>: an instant bonus weapon!',
  'Knocked off? <b>Double jump</b> back to the arena.',
  'Knock them off the arena: a ring-out beats any damage.',
  'A shield wall blocks the line of fire for 5 seconds.',
];

let cursor = 0;

export function nextTip(): string {
  const tip = TIPS[cursor % TIPS.length];
  cursor += 1;
  return tip;
}

/** Affiche une astuce tout de suite, puis en change régulièrement (entrée en « claque »). */
export function mountTips(target: HTMLElement, everyMs = durees.bandeau * 3.5): () => void {
  const show = () => {
    target.innerHTML = nextTip();
    target.classList.remove('swap');
    void target.offsetWidth; // relance l'animation d'entrée
    target.classList.add('swap');
  };
  show();
  const timer = window.setInterval(show, everyMs);
  return () => window.clearInterval(timer);
}
