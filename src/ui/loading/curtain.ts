// Rideau de transition plein écran (lot LLOAD) : deux volets aux couleurs des coins (P1 rouge à gauche, P2 bleu à
// droite) qui se rejoignent en biais, le logo BROSKIS qui claque au centre, des pastilles de progression honnêtes
// (une par étape réelle) et une astuce si l'attente dure. Uniquement des transform/opacity : il bouge même quand
// le fil principal compile des shaders.
//   const c = getCurtain();  await c.close();  c.setProgress(1, 3);  …  await c.open();
import { durees } from '../../art/tokens.js';
import { injectLoadingStyles } from './style';
import { mountTips } from './tips';

export interface Curtain {
  /** Volets fermés + logo : résolue quand l'écran est entièrement couvert. */
  close(): Promise<void>;
  /** Volets qui s'ouvrent (le logo se décolle) : résolue quand la scène est entièrement visible. */
  open(): Promise<void>;
  /** Étapes réelles terminées sur le total (pastilles). */
  setProgress(done: number, total: number): void;
  readonly closed: boolean;
}

/** Au-delà de ce temps rideau fermé, une astuce apparaît (en dessous, elle ne serait qu'un clignotement). */
const TIP_AFTER_MS = durees.dramatique;

let instance: Curtain | null = null;

// Construit le rideau (DOM, styles, calques GPU) à un moment calme dès le démarrage : le clic sur la map n'a
// plus rien à préparer (243 ms mesurés sur la première image sinon).
if (typeof window !== 'undefined') {
  const warm = () => { getCurtain(); };
  if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1000);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function getCurtain(): Curtain {
  if (instance) return instance;
  injectLoadingStyles();
  const root = document.createElement('div');
  root.className = 'lload-curtain';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="lload-panel p1"></div>
    <div class="lload-panel p2"></div>
    <div class="lload-center">
      <div class="lload-logo">BROSKIS</div>
      <div class="lload-pips"></div>
      <div class="lload-tip" hidden></div>
    </div>`;
  document.body.append(root);
  const pips = root.querySelector<HTMLElement>('.lload-pips')!;
  const tip = root.querySelector<HTMLElement>('.lload-tip')!;
  let state: 'open' | 'closing' | 'closed' | 'opening' = 'open';
  let stopTips: (() => void) | null = null;
  let tipTimer = 0;

  const setState = (s: typeof state) => {
    state = s;
    root.classList.toggle('is-closing', s === 'closing');
    root.classList.toggle('is-closed', s === 'closed');
    root.classList.toggle('is-opening', s === 'opening');
  };

  instance = {
    get closed() { return state === 'closed'; },
    async close() {
      if (state === 'closed') return;
      pips.replaceChildren();
      setState('closing');
      await wait(durees.glisse);
      setState('closed');
      tipTimer = window.setTimeout(() => {
        tip.hidden = false;
        stopTips = mountTips(tip);
      }, TIP_AFTER_MS);
    },
    async open() {
      if (state === 'open') return;
      window.clearTimeout(tipTimer);
      stopTips?.();
      stopTips = null;
      tip.hidden = true;
      setState('opening');
      await wait(durees.glisse);
      setState('open');
    },
    setProgress(done, total) {
      if (pips.childElementCount !== total) {
        pips.replaceChildren(...Array.from({ length: total }, () => Object.assign(document.createElement('i'), { className: 'lload-pip' })));
      }
      [...pips.children].forEach((p, i) => p.classList.toggle('done', i < done));
    },
  };
  return instance;
}
