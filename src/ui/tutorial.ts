// Premier match = tutoriel intégré (lot LUX), une seule fois (localStorage, lecture/écriture protégées) : 3 bulles
// au premier tour du premier joueur humain (se déplacer, choisir une arme, charger et tirer), puis une bulle à la
// première parade. Chaque bulle avance d'elle-même quand le joueur a fait le geste ; « Skip » coupe tout.
// Forcer : ?tuto=1 · jamais en ?demo=1 (la régie a déjà joué).
import type { Ctx, PlayerId } from '../core/types';
import { button, el } from './dom';
import { jumpKey, keyLine, parryKey } from './keys';

const STORAGE_KEY = 'broskis:tuto-done';
const TOTAL = 4;

function alreadyDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* navigation privée : le tutoriel reviendra, tant pis */
  }
}

export function installTutorial(ctx: Ctx, layer: HTMLElement): void {
  const force = new URLSearchParams(location.search).get('tuto') === '1';
  if (!force && (ctx.demo || alreadyDone())) return;

  const bubble = el('div', 'tuto');
  bubble.hidden = true;
  layer.append(bubble);

  let step = 0; // 0 = pas commencé, 1..4 = bulle affichée, 5 = fini
  let learner: PlayerId = 0;
  let movedFrom = 0;
  const offs: (() => void)[] = [];

  function finish(save: boolean) {
    step = TOTAL + 1;
    bubble.hidden = true;
    for (const off of offs) off();
    if (save) markDone();
  }

  function show(n: number, title: string, line: HTMLElement | string, cls = '') {
    step = n;
    const head = el('div', 'tuto-head');
    head.append(el('span', 'tuto-step', `${n}/${TOTAL}`), el('span', 'tuto-title', title));
    const body = typeof line === 'string' ? el('div', 'tuto-body', line) : line;
    body.classList.add('tuto-body');
    const skip = button('Skip tutorial', 'b-btn small tuto-skip', () => finish(true));
    bubble.className = `tuto ${cls}`.trim();
    bubble.replaceChildren(head, body, skip);
    bubble.hidden = false;
  }

  const human = (p: PlayerId) => !(ctx.state.vsAI && p === 1);

  offs.push(
    ctx.bus.on('match:start', () => {
      if (step > TOTAL) return;
      step = 0;
      bubble.hidden = true;
    }),
    ctx.bus.on('phase:change', ({ to }) => {
      if (to === 'move' && step === 0 && human(ctx.state.active)) {
        learner = ctx.state.active;
        movedFrom = ctx.state.players[learner].moveLeft;
        show(1, 'Move with WASD', keyLine([['W', 'A', 'S', 'D'], 'to walk', '·', [jumpKey()], 'to jump']));
      }
      if (to === 'end' || to === 'title') bubble.hidden = true;
    }),
    // Une bulle d'attaque ne concerne que son joueur : cachée pendant le tour de l'autre, remise à son retour.
    ctx.bus.on('turn:start', ({ active }) => {
      if (step >= 1 && step <= 3) bubble.hidden = active !== learner;
    }),
    ctx.bus.on('move:update', ({ player, moveLeft }) => {
      if (step !== 1 || player !== learner || movedFrom - moveLeft < 1) return;
      show(2, 'Pick a weapon', keyLine(['Press', ['1'], 'to grab your first weapon']));
    }),
    ctx.bus.on('weapon:pick', ({ player }) => {
      if ((step !== 1 && step !== 2) || player !== learner) return;
      show(3, 'Hold and release to FIRE', keyLine(['Aim with the mouse', '·', 'Hold', ['CLICK'], 'then release']));
    }),
    ctx.bus.on('fire', ({ player }) => {
      if (step < 1 || step > 3 || player !== learner) return;
      step = 3.5; // attend la première parade d'un humain
      bubble.hidden = true;
    }),
    ctx.bus.on('parry:window', ({ defender }) => {
      if (step > TOTAL || !human(defender)) return;
      show(
        4,
        'Your turn to defend!',
        keyLine(['Press', [parryKey(defender)], 'when the ring closes: perfect = no damage']),
        `p${defender + 1} defend-tip`,
      );
    }),
    ctx.bus.on('parry:result', () => {
      if (step !== 4) return;
      window.setTimeout(() => finish(true), 2600);
    }),
    ctx.bus.on('match:end', () => {
      if (step >= 1) finish(true); // un match joué en entier : on ne réimpose plus le tutoriel
    }),
  );
}
