// Écran d'attente du « snap » de la tête, dans l'encart du joueur (lot LWAIT). Chaque changement visible correspond à
// une donnée RÉELLEMENT arrivée (étapes de scanFighterReport, src/ia/fighter) ; rien ne coche tout seul :
//   1. « Reading your face… »  → surnom qui s'écrit (flux Gemini) + couleurs en pastilles ; coché quand le texte est là
//   2. « Drawing your cartoon head (front + back)… » → crayon + chrono réel ; la planche se dévoile à son arrivée ;
//      cochée quand face et dos sont découpés
//   3. « Building your 3D fighter… » → le perso 3D claque, la tête se gonfle, il tourne ; coché quand la tête est dessinée
//   4. « Ready! » → gros tampon.
// Échec ou lenteur : message + boutons au choix du joueur (fail), jamais de sortie automatique.
import { ui } from '../../art/tokens.js';
import type { FighterDef, PlayerId } from '../../core/types';
import type { FighterTraitsPreview } from '../../ia/fighter';
import { detourSticker } from '../sticker2d';
import { mountHeadPreview, type HeadPreview } from './headPreview';
import { injectHeadStyles } from './headStyle';
import { injectLoadingStyles } from './style';
import { typewriter } from './typewriter';

export interface HeadForge {
  root: HTMLDivElement;
  /** Champs du texte arrivés au fil de l'eau (surnom, couleurs, accessoire). */
  traits(a: FighterTraitsPreview): void;
  /** Nom, stats et couleurs connus : étape 1 cochée. */
  text(f: FighterDef): void;
  /** Planche face + dos arrivée : elle se dévoile. */
  sheet(url: string): void;
  /** Face et dos posés : construit le perso 3D. true quand la tête est à l'écran ; false si elle n'a pas pu être posée.
   * null : pas de 3D possible ici (contexte WebGL refusé), la tête 2D fait foi. */
  head(f: FighterDef): Promise<boolean | null>;
  /** Message clair + boutons au choix du joueur ; l'étape en cours passe en alerte. */
  fail(message: string, actions: [string, () => void][]): void;
  clearFail(): void;
  dispose(): void;
}

type Etape = 'face' | 'draw' | 'build' | 'ready';
const ORDRE: Etape[] = ['face', 'draw', 'build', 'ready'];
const TEXTES: Record<Etape, string> = {
  face: 'Reading your face…',
  draw: 'Drawing your cartoon head (front + back)…',
  build: 'Building your 3D fighter…',
  ready: 'Ready!',
};

const CRAYON = `<svg viewBox="0 0 60 60" aria-hidden="true"><g transform="rotate(35 30 30)" stroke="${ui.encre}" stroke-width="${ui.trait}" stroke-linejoin="round">
  <rect x="24" y="4" width="12" height="36" rx="2" fill="${ui.alerte}"/>
  <rect x="24" y="4" width="12" height="7" fill="${ui.vinyle}"/>
  <path d="M24 40 L30 54 L36 40 Z" fill="${ui.papier}"/>
  <path d="M28 49 L30 54 L32 49 Z" fill="${ui.encre}" stroke="none"/></g></svg>`;

export function mountHeadForge(opts: { photoUrl: string; player: PlayerId }): HeadForge {
  injectLoadingStyles();
  injectHeadStyles();
  const root = document.createElement('div');
  root.className = `lwait p${opts.player + 1} flash`;
  root.dataset.step = 'face';
  root.innerHTML = `
    <div class="lwait-stage">
      <div class="lwait-photo"><img alt=""><div class="lload-beam"></div></div>
      <div class="lwait-pencil">${CRAYON}</div>
      <img class="lwait-sheet" alt="">
      <div class="lwait-stamp">Ready!</div>
    </div>
    <div class="lwait-info">
      <ol class="lwait-steps">${ORDRE.map((k) => `<li data-k="${k}"><i></i><span>${TEXTES[k]}</span>${k === 'draw' ? '<b class="lwait-clock"></b>' : ''}</li>`).join('')}</ol>
      <div class="lwait-fail" hidden><p></p><div class="lwait-actions"></div></div>
    </div>`;
  root.querySelector<HTMLImageElement>('.lwait-photo img')!.src = opts.photoUrl;
  const stage = root.querySelector<HTMLDivElement>('.lwait-stage')!;
  const sheetImg = root.querySelector<HTMLImageElement>('.lwait-sheet')!;
  const li = (k: Etape) => root.querySelector<HTMLLIElement>(`.lwait-steps li[data-k="${k}"]`)!;
  // Sous l'étape 1 : le surnom qui s'écrit et les pastilles de couleur (lecture du visage par Gemini).
  const read = document.createElement('div');
  read.className = 'lwait-read';
  const nick = document.createElement('p');
  nick.className = 'lwait-nick';
  read.append(nick);
  li('face').after(read);
  const nickTw = typewriter(nick);
  const failBox = root.querySelector<HTMLDivElement>('.lwait-fail')!;
  const clock = root.querySelector<HTMLElement>('.lwait-clock')!;

  const etat: Record<Etape, '' | 'now' | 'done' | 'fail'> = { face: 'now', draw: 'now', build: '', ready: '' };
  const peindre = () => {
    for (const k of ORDRE) li(k).className = etat[k];
    root.dataset.step = etat.draw === 'done' ? (etat.build === 'done' ? 'ready' : 'build') : etat.face === 'done' ? 'draw' : 'face';
  };
  peindre();
  window.setTimeout(() => root.classList.remove('flash'), 600);

  // Chrono RÉEL du dessin (Nano Banana ne renvoie rien avant l'image) : le temps qui passe, jamais une fausse barre.
  const t0 = performance.now();
  const chrono = window.setInterval(() => {
    if (etat.draw !== 'now') return void (clock.textContent = '');
    clock.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
  }, 100);

  let disposed = false;
  let preview: HeadPreview | null = null;
  const couleurs = new Set<string>();
  let accessoire = '';
  const pastille = (c: string) => {
    if (couleurs.has(c)) return;
    couleurs.add(c);
    const s = document.createElement('span');
    s.className = 'lwait-swatch';
    s.style.background = c;
    read.append(s);
  };

  const api: HeadForge = {
    root,
    traits(a) {
      if (disposed) return;
      if (a.nickname) nickTw.set(a.nickname);
      if (a.hair) pastille(a.hair);
      for (const c of a.outfit ?? []) pastille(c);
      if (a.accessory && !accessoire) {
        accessoire = a.accessory;
        const tag = document.createElement('span');
        tag.className = 'lwait-tag';
        tag.textContent = a.accessory;
        read.append(tag);
      }
    },
    text(f) {
      if (disposed) return;
      nickTw.set(f.name);
      if (f.look?.hair) pastille(f.look.hair);
      if (f.look?.primary) pastille(f.look.primary);
      if (f.look?.secondary) pastille(f.look.secondary);
      etat.face = 'done';
      peindre();
    },
    sheet(url) {
      if (disposed || !url || root.classList.contains('has-sheet')) return;
      void detourSticker(url).then((src) => {
        if (disposed) return;
        sheetImg.src = src ?? url;
        root.classList.add('has-sheet');
        requestAnimationFrame(() => sheetImg.classList.add('on'));
      });
    },
    async head(f) {
      if (disposed) return false;
      api.sheet(f.portraitUrl ?? f.look?.faceUrl ?? '');
      etat.draw = 'done';
      if (etat.face !== 'done') api.text(f);
      etat.build = 'now';
      peindre();
      preview?.dispose();
      preview = mountHeadPreview(f, opts.player);
      if (!preview) return null;
      stage.append(preview.root);
      root.classList.add('has-3d');
      const ok = await preview.ready;
      if (disposed) return false;
      if (!ok) return false;
      etat.build = 'done';
      etat.ready = 'done';
      peindre();
      root.classList.add('ready');
      return true;
    },
    fail(message, actions) {
      if (disposed) return;
      for (const k of ORDRE) if (etat[k] === 'now') etat[k] = 'fail';
      peindre();
      failBox.querySelector('p')!.textContent = message;
      const row = failBox.querySelector<HTMLDivElement>('.lwait-actions')!;
      row.replaceChildren(
        ...actions.map(([label, onClick], i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = i === 0 ? 'b-btn small' : 'b-btn small alt';
          b.textContent = label;
          b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
          return b;
        }),
      );
      failBox.hidden = false;
    },
    clearFail() {
      failBox.hidden = true;
      for (const k of ORDRE) if (etat[k] === 'fail') etat[k] = 'now';
      peindre();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(chrono);
      nickTw.dispose();
      preview?.dispose();
      preview = null;
    },
  };
  return api;
}
