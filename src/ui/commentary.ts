// Sous-titre de l'animateur (lot LUX, désencombrement) : une ligne courte en bas au centre, au-dessus de l'aide,
// petit portrait rond, disparaît au bout de ~2 s (un peu plus pour une longue phrase). Jamais une grande carte qui
// masque le jeu. Une réplique chasse l'autre (décollage durees.decolle). Texte = ce qui est RÉELLEMENT entendu
// (hud.ts l'alimente depuis `voice:line`).
import { durees } from '../art/tokens.js';
import { el } from './dom';

const PORTRAIT_SVG = `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="46" r="30" fill="var(--b-papier)" stroke="var(--b-encre)" stroke-width="5"/>
  <circle cx="39" cy="42" r="4" fill="var(--b-encre)"/>
  <circle cx="61" cy="42" r="4" fill="var(--b-encre)"/>
  <path d="M30 30q20-14 40 0" fill="none" stroke="var(--b-encre)" stroke-width="4" stroke-linecap="round"/>
  <path class="mouth-closed" d="M38 58h24" fill="none" stroke="var(--b-encre)" stroke-width="5" stroke-linecap="round"/>
  <ellipse class="mouth-open" cx="50" cy="60" rx="11" ry="7" fill="var(--b-encre)"/>
</svg>`;

/** Tenue à l'écran : ~2 s, jusqu'à 3,2 s pour une longue phrase (lisible sans boucher l'écran). */
const HOLD_MIN_MS = 2000;
const HOLD_MAX_MS = 3200;
const HOLD_PER_WORD_MS = 190;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** Colore « P1 »/« Player 1 » etc. dans la couleur foncée du joueur ; `extra` ajoute des noms (perso, arme). */
function highlight(text: string, extra: { name: string; color: string }[]): string {
  let html = escapeHtml(text).replace(/\bP(1|2)\b|\bPlayer (1|2)\b/gi, (m, a, b) => `<span class="name-p${a || b}">${m}</span>`);
  for (const { name, color } of extra) {
    if (!name) continue;
    const esc = escapeHtml(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\b${esc}\\b`, 'g'), `<span style="color:${color}">${escapeHtml(name)}</span>`);
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
  let swapTimer = 0;

  function holdMs(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, words * HOLD_PER_WORD_MS));
  }

  function reveal(text: string, names: { name: string; color: string }[]) {
    bubble.innerHTML = highlight(text, names);
    root.hidden = false;
    root.classList.remove('sticker-out', 'sticker-in');
    void root.offsetWidth;
    root.classList.add('sticker-in');
    window.clearInterval(mouthTimer);
    mouthTimer = window.setInterval(() => portrait.classList.toggle('talk'), durees.mot);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      root.classList.add('sticker-out');
      window.clearInterval(mouthTimer);
      portrait.classList.remove('talk');
      hideTimer = window.setTimeout(() => {
        root.hidden = true;
      }, durees.decolle);
    }, holdMs(text));
  }

  function show(text: string, names: { name: string; color: string }[] = []) {
    if (!text) return;
    window.clearTimeout(swapTimer);
    if (root.hidden) {
      reveal(text, names);
      return;
    }
    root.classList.add('sticker-out');
    swapTimer = window.setTimeout(() => reveal(text, names), durees.decolle);
  }

  return {
    root,
    show,
    dispose() {
      window.clearInterval(mouthTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(swapTimer);
    },
  };
}
