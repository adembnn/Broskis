// Sous-titres de l'animateur (règle 3 du DA) : portrait sticker 2 images (bouche fermée/ouverte) qui parle au
// rythme de durees.mot, tenue = max(tenueMin, mots × lectureParMot), une réplique chasse l'autre (durees.decolle).
// Le portrait est un dessin de code (placeholder trait encre) : le lot LV/LD fournira un vrai visuel à l'occasion.
import { durees } from '../art/tokens.js';
import { el } from './dom';

const PORTRAIT_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="46" r="30" fill="var(--b-papier)" stroke="var(--b-encre)" stroke-width="4"/>
  <circle cx="39" cy="42" r="3.4" fill="var(--b-encre)"/>
  <circle cx="61" cy="42" r="3.4" fill="var(--b-encre)"/>
  <path d="M30 30q20-14 40 0" fill="none" stroke="var(--b-encre)" stroke-width="3" stroke-linecap="round"/>
  <path class="mouth-closed" d="M38 58h24" fill="none" stroke="var(--b-encre)" stroke-width="4" stroke-linecap="round"/>
  <ellipse class="mouth-open" cx="50" cy="60" rx="11" ry="7" fill="var(--b-encre)"/>
  <path d="M40 78q10 8 20 0l-4 8h-12z" fill="var(--b-p1)" stroke="var(--b-encre)" stroke-width="3"/>
</svg>`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Colore « P1 »/« Player 1 » etc. dans la couleur foncée du joueur ; `extra` ajoute des noms (perso, arme). */
function highlight(text: string, extra: { name: string; color: string }[]): string {
  let html = escapeHtml(text).replace(/\bP(1|2)\b|\bPlayer (1|2)\b/gi, (m, a, b) => {
    const n = a || b;
    return `<span class="name-p${n}">${m}</span>`;
  });
  for (const { name, color } of extra) {
    if (!name) continue;
    const esc = escapeHtml(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\b${esc}\\b`, 'g'), `<span style="color:${color}">${name}</span>`);
  }
  return html;
}

export interface Commentary {
  root: HTMLDivElement;
  show(text: string, names?: { name: string; color: string }[]): void;
  dispose(): void;
}

export function createCommentary(): Commentary {
  const root = el('div', 'commentary');
  root.hidden = true;
  const portrait = el('div', 'commentary-portrait');
  portrait.innerHTML = PORTRAIT_SVG;
  const bubble = el('div', 'commentary-bubble');
  root.append(portrait, bubble);

  let mouthTimer = 0;
  let hideTimer = 0;
  let busy = false;

  function holdMs(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(durees.tenueMin, words * durees.lectureParMot);
  }

  function reveal(text: string, names: { name: string; color: string }[]) {
    bubble.innerHTML = highlight(text, names);
    root.hidden = false;
    root.classList.remove('sticker-out');
    root.classList.remove('sticker-in');
    void root.offsetWidth;
    root.classList.add('sticker-in');
    window.clearInterval(mouthTimer);
    mouthTimer = window.setInterval(() => portrait.classList.toggle('talk'), durees.mot);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      root.classList.add('sticker-out');
      window.clearInterval(mouthTimer);
      portrait.classList.remove('talk');
      window.setTimeout(() => {
        root.hidden = true;
      }, durees.decolle);
    }, holdMs(text));
  }

  function show(text: string, names: { name: string; color: string }[] = []) {
    if (!text) return;
    if (root.hidden) {
      reveal(text, names);
    } else if (!busy) {
      busy = true;
      root.classList.add('sticker-out');
      window.setTimeout(() => {
        busy = false;
        reveal(text, names);
      }, durees.decolle);
    }
  }

  return {
    root,
    show,
    dispose() {
      window.clearInterval(mouthTimer);
      window.clearTimeout(hideTimer);
    },
  };
}
