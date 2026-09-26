// Barre de PV « Vinyle » (règle 4 du DA) : 1 segment = 10 PV (8 à 12 segments selon hpMax), séparateurs d'encre.
// Au coup : la partie perdue devient vinyle (barre fantôme, durees.fantome de retard puis durees.vidange pour
// rattraper — géré par la transition CSS elle-même) ; un segment entièrement perdu s'arrache (durees.segment).
// Sous 40 % de PV : sticker jaune « ×1.6 » (multiplicateur de recul).
import { durees } from '../art/tokens.js';
import type { PlayerId } from '../core/types';
import { el, strokeNum } from './dom';

const SEG_HP = 10;
const MIN_SEG = 8;
const MAX_SEG = 12;
const LOW_HP_RATIO = 0.4;

export interface HpBar {
  root: HTMLDivElement;
  set(hp: number, hpMax: number): void;
}

function spawnTear(track: HTMLDivElement, segFill: HTMLElement): void {
  // Mesurer le segment (parent), pas `fill` : `fill` peut déjà être réduit par un scaleX partiel précédent.
  const seg = segFill.parentElement!;
  const t = track.getBoundingClientRect();
  const r = seg.getBoundingClientRect();
  const tear = el('div', 'hp-seg-tear');
  tear.style.left = `${r.left - t.left}px`;
  tear.style.width = `${r.width}px`;
  tear.style.background = getComputedStyle(segFill).backgroundColor;
  track.append(tear);
  requestAnimationFrame(() => tear.classList.add('go'));
  window.setTimeout(() => tear.remove(), durees.segment + 60);
}

export function createHpBar(player: PlayerId): HpBar {
  const root = el('div', `hp-bar p${player + 1}`);
  const track = el('div', 'hp-track');
  const num = strokeNum('0', 'hp-num');
  const mult = el('span', 'hp-mult', '×1.6');
  mult.hidden = true;
  root.append(track, num, mult);

  let segs: { fill: HTMLDivElement; ghost: HTMLDivElement }[] = [];
  let segCount = 0;
  let prevFilled: number[] = [];
  let prevHp = -1;

  function build(count: number) {
    track.replaceChildren();
    segs = Array.from({ length: count }, () => {
      const seg = el('div', 'hp-seg');
      const ghost = el('div', 'hp-seg-ghost');
      const fill = el('div', 'hp-seg-fill');
      seg.append(ghost, fill);
      track.append(seg);
      return { fill, ghost };
    });
    prevFilled = segs.map(() => 1);
  }

  function set(hp: number, hpMax: number) {
    const count = Math.max(MIN_SEG, Math.min(MAX_SEG, Math.round(hpMax / SEG_HP) || MIN_SEG));
    if (count !== segCount) {
      build(count);
      segCount = count;
    }
    const clamped = Math.max(0, hp);
    const segHpValue = hpMax / count;

    segs.forEach(({ fill, ghost }, i) => {
      const filled = Math.max(0, Math.min(1, (clamped - i * segHpValue) / segHpValue));
      if (filled <= 0 && prevFilled[i] > 0) spawnTear(track, fill);
      fill.style.transform = `scaleX(${filled})`;
      ghost.style.transform = `scaleX(${filled})`; // le retard/rattrapage vient de la transition CSS (fantome/vidange)
      prevFilled[i] = filled;
    });

    if (Math.round(clamped) !== Math.round(prevHp)) {
      num.textContent = String(Math.round(clamped));
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
    }
    mult.hidden = hpMax <= 0 || clamped / hpMax >= LOW_HP_RATIO;
    prevHp = clamped;
  }

  return { root, set };
}
