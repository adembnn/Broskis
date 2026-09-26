// Astuces de jeu (anglais) qui tournent pendant une attente (lot LLOAD). Maister : un temps occupé paraît plus court
// qu'un temps vide. Chaque astuce apprend une vraie règle du jeu (pas de blague creuse), la plus utile d'abord.
// API : mountTips(el) remplit `el` et change d'astuce toutes les `everyMs` ; renvoie une fonction d'arrêt.
import { durees } from '../../art/tokens.js';

export const TIPS: readonly string[] = [
  'The higher your <b>%</b>, the further you fly. Stay away from the edge!',
  'Parry: <b>SPACE</b> for P1, <b>ENTER</b> for P2, right when the ring closes.',
  'A <b>perfect parry</b> sends the shot straight back.',
  'Grenades lob over walls. Blasters stop at the first wall.',
  'Grab the <b>Snap Crate</b>: scan a brand-new weapon mid-fight!',
  'A weapon you just used needs one turn to reload.',
  'Knock them off the arena: a ring-out beats any damage.',
  'Shields block, and a perfect parry reflects the hit.',
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
