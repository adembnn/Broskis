// Forge d'une arme en cours de génération (lot LLOAD). Rien de décoratif sans raison : chaque changement visible
// correspond à une donnée réellement arrivée, lue sur l'événement `scan:progress` (lot LUX) :
//   const forge = mountForgeView({ photoUrl, label: 'Player 1' });   // s'abonne tout seul au bus
//   area.append(forge.root);
//   const weapon = await scanObject(blob);
// Étapes : 'reading' faisceau de lecture sur la vraie photo + étincelles · 'partial' (flux Gemini) « Gemini sees:
// <objet> », puis le nom qui s'écrit · 'stats' « Nano Banana is drawing… » · 'sticker' le dessin détouré claque par-
// dessus la photo · 'sticker-failed' la photo reste (la 3D a sa forme de secours). `update` reste appelable à la main
// (ex. scan d'une personne, sans événement).
import type { PlayerId, Weapon } from '../../core/types';
import type { ScanStep } from '../../ia';
import { getRuntimeCtx } from '../../ia/runtime';
import { detourSticker } from '../sticker2d';
import { injectLoadingStyles } from './style';
import { typewriter } from './typewriter';

export interface ForgeView {
  root: HTMLDivElement;
  update: (step: ScanStep, preview?: Partial<Weapon>) => void;
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

export interface ForgeOptions {
  photoUrl?: string;
  label?: string;
  /** Joueur qui scanne : les étapes d'un autre joueur sont ignorées (sans lui : un seul scan à la fois). */
  player?: PlayerId;
  /** Textes d'étape à remplacer (ex. scan d'une personne). */
  status?: Partial<Record<ScanStep, string>>;
}

export function mountForgeView(opts: ForgeOptions = {}): ForgeView {
  injectLoadingStyles();
  const texts = { ...STATUS, ...opts.status };
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
  status.set(opts.label ? `${opts.label}: ${texts.reading}` : texts.reading);
  let disposed = false;
  let stickerShown = false;
  let weaponId: string | undefined;

  const markSteps = (statsDone: boolean, stickerDone: boolean) => {
    steps[1].className = statsDone ? 'done' : 'now';
    steps[2].className = stickerDone ? 'done' : statsDone ? 'now' : '';
  };

  const update = (step: ScanStep, preview?: Partial<Weapon>) => {
    if (disposed) return;
    try {
      if (preview?.name) name.set(preview.name);
      // Flux Gemini : l'objet reconnu s'affiche dès qu'il est écrit (preuve visible que l'IA a compris la photo).
      if (step === 'partial') { status.set(preview?.object ? `Gemini sees: ${preview.object}` : texts.partial); return; }
      if (step === 'reading') return;
      if (step === 'stats') {
        if (stickerShown) return;
        root.dataset.step = 'stats';
        status.set(texts.stats);
        markSteps(true, false);
        return;
      }
      // 'sticker' ou 'sticker-failed' : fin de la forge.
      markSteps(true, step === 'sticker');
      status.set(texts[step]);
      if (step === 'sticker' && preview?.stickerUrl && !stickerShown) {
        stickerShown = true;
        void detourSticker(preview.stickerUrl).then((src) => {
          if (disposed) return;
          sticker.src = src ?? preview.stickerUrl!;
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

  // Abonnement à `scan:progress` : la 1re arme identifiée devient « la nôtre », les étapes des autres sont ignorées.
  const off = getRuntimeCtx()?.bus.on('scan:progress', (e) => {
    if (opts.player != null && e.player !== opts.player) return;
    if (weaponId && e.weaponId && e.weaponId !== weaponId) return;
    if (!weaponId && e.weaponId) weaponId = e.weaponId;
    update(e.step, e.preview);
    if (e.step === 'sticker' || e.step === 'sticker-failed') off?.(); // forge terminée : plus rien à écouter
  });

  return {
    root,
    update,
    dispose() {
      disposed = true;
      off?.();
      name.dispose();
      status.dispose();
    },
  };
}
