// Texte qui s'écrit au fil de l'eau (lot LLOAD), synchronisé à l'arrivée RÉELLE des données :
//   const tw = typewriter(el);  tw.set('The Caff');  tw.set('The Caffeinator');  // flux : on continue, on ne recommence pas
//   tw.set('Autre chose');      // texte différent : on efface et on réécrit
//   await tw.done;              // résolue quand tout le texte connu est affiché
// Vitesse : tokens `durees.mot` (ms par mot) ramenée au caractère ; rattrape son retard si le flux va plus vite.
import { durees } from '../../art/tokens.js';

export interface Typewriter {
  set(text: string): void;
  /** Affiche tout d'un coup (bouton « passer », mouvement réduit). */
  flush(): void;
  readonly done: Promise<void>;
  dispose(): void;
}

const CHARS_PER_WORD = 5;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function typewriter(el: HTMLElement, msPerChar = durees.mot / CHARS_PER_WORD): Typewriter {
  let target = '';
  let shown = 0;
  let raf = 0;
  let last = 0;
  let resolveDone: () => void = () => {};
  let done: Promise<void> = Promise.resolve();

  const render = () => {
    el.textContent = target.slice(0, shown);
    el.classList.toggle('lload-caret', shown < target.length);
  };

  const step = (t: number) => {
    const dt = last ? t - last : 16;
    last = t;
    // Plus il reste de texte, plus on accélère : un long flux ne prend jamais plus d'~1,5 s de retard.
    const backlog = target.length - shown;
    const speed = Math.max(1, backlog / 60);
    shown = Math.min(target.length, shown + Math.max(1, Math.round((dt / msPerChar) * speed)));
    render();
    if (shown < target.length) raf = requestAnimationFrame(step);
    else { raf = 0; last = 0; resolveDone(); }
  };

  const api: Typewriter = {
    set(text) {
      if (text === target) return;
      if (!text.startsWith(target.slice(0, shown))) shown = 0; // texte différent : on repart de zéro
      target = text;
      if (reduced()) { shown = target.length; render(); resolveDone(); return; }
      if (!raf) {
        done = new Promise((r) => { resolveDone = r; });
        raf = requestAnimationFrame(step);
      }
      render();
    },
    flush() {
      shown = target.length;
      render();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      resolveDone();
    },
    get done() { return done; },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.classList.remove('lload-caret');
      resolveDone();
    },
  };
  return api;
}
