// Forge d'une arme en cours de génération (lot LLOAD). Rien de décoratif sans raison : chaque changement visible
// correspond à une donnée réellement arrivée (étapes de scanObject).
//   const forge = mountForgeView({ photoUrl, label: 'Player 1' });
//   area.append(forge.root);
//   const weapon = await scanObject(blob, { onProgress: forge.update });
// Étapes : 'reading' faisceau de lecture sur la vraie photo + étincelles · 'partial'/'stats' le nom de l'arme s'écrit
// dès qu'il arrive · 'sticker' le dessin Nano Banana (détouré) claque par-dessus la photo · 'sticker-failed' la photo
// reste, la scène 3D a sa forme de secours.
import type { Weapon } from '../../core/types';
import type { ScanStep } from '../../ia';
import { chromaKey } from '../../scene/sticker';
import { injectLoadingStyles } from './style';
import { typewriter } from './typewriter';

export interface ForgeView {
  root: HTMLDivElement;
  /** À passer tel quel en `onProgress` de scanObject (déjà lié, ne jette jamais). */
  update: (step: ScanStep, weapon?: Partial<Weapon>) => void;
  dispose(): void;
}

const STATUS: Record<ScanStep, string> = {
  reading: 'Gemini is reading your object…',
  partial: 'Gemini is naming your weapon…',
  stats: 'Nano Banana is drawing your sticker…',
  sticker: 'Forged!',
  'sticker-failed': 'Forged!',
};

/** Étincelles : angle (deg), distance (px), position de départ (% du cadre), décalage (ms). */
const SPARKS: [number, number, number, number, number][] = [
  [-35, 90, 8, 92, 0], [-60, 70, 14, 96, 140], [-20, 110, 4, 80, 300],
  [35, 90, 92, 92, 70], [60, 70, 86, 96, 220], [20, 110, 96, 80, 380],
  [-5, 80, 50, 100, 460], [5, 95, 60, 100, 540],
];

async function keyedSticker(url: string): Promise<string> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return chromaKey(img).toDataURL('image/png');
  } catch {
    return url;
  }
}

export function mountForgeView(opts: { photoUrl?: string; label?: string } = {}): ForgeView {
  injectLoadingStyles();
  const root = document.createElement('div');
  root.className = 'lload-forge';
  root.dataset.step = 'reading';
  root.innerHTML = `
    <div class="lload-forge-stage">
      <div class="lload-forge-photo">${opts.photoUrl ? '<img alt="">' : ''}<div class="lload-beam"></div></div>
      <img class="lload-forge-sticker" alt="">
      ${SPARKS.map(([a, d, x, y, delay]) => `<i class="lload-spark" style="--a:${a}deg;--d:${d}px;left:${x}%;top:${y}%;animation-delay:${delay}ms"></i>`).join('')}
    </div>
    <p class="lload-forge-name"></p>
    <p class="lload-forge-status"></p>
    <ol class="lload-steps"><li class="done">Snapped</li><li class="now">Stats</li><li>Sticker</li></ol>`;
  const photo = root.querySelector<HTMLImageElement>('.lload-forge-photo img');
  if (photo && opts.photoUrl) photo.src = opts.photoUrl;
  const sticker = root.querySelector<HTMLImageElement>('.lload-forge-sticker')!;
  const steps = root.querySelectorAll<HTMLLIElement>('.lload-steps li');
  const name = typewriter(root.querySelector<HTMLElement>('.lload-forge-name')!);
  const status = typewriter(root.querySelector<HTMLElement>('.lload-forge-status')!);
  status.set(opts.label ? `${opts.label}: ${STATUS.reading}` : STATUS.reading);
  let disposed = false;
  let stickerShown = false;

  const markSteps = (statsDone: boolean, stickerDone: boolean) => {
    steps[1].className = statsDone ? 'done' : 'now';
    steps[2].className = stickerDone ? 'done' : statsDone ? 'now' : '';
  };

  const update = (step: ScanStep, weapon?: Partial<Weapon>) => {
    if (disposed) return;
    try {
      if (weapon?.name) name.set(weapon.name);
      if (step === 'partial') { status.set(STATUS.partial); return; }
      if (step === 'reading') return;
      if (step === 'stats') {
        if (stickerShown) return;
        root.dataset.step = 'stats';
        status.set(STATUS.stats);
        markSteps(true, false);
        return;
      }
      // 'sticker' ou 'sticker-failed' : fin de la forge.
      markSteps(true, step === 'sticker');
      status.set(STATUS[step]);
      if (step === 'sticker' && weapon?.stickerUrl && !stickerShown) {
        stickerShown = true;
        void keyedSticker(weapon.stickerUrl).then((src) => {
          if (disposed) return;
          sticker.src = src;
          root.dataset.step = 'sticker';
          root.classList.add('burst');
          requestAnimationFrame(() => sticker.classList.add('on'));
        });
      } else if (step === 'sticker-failed') {
        root.dataset.step = 'sticker-failed';
      }
    } catch (e) {
      console.error('[lload] forge', e);
    }
  };

  return {
    root,
    update,
    dispose() {
      disposed = true;
      name.dispose();
      status.dispose();
    },
  };
}
