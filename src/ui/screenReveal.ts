// Présentation des armes : cartes façon Wacky Packages, révélées une par une (joueur 1 puis joueur 2),
// sous-titrées par l'animateur (commentary:line). prepareCommentary prépare les répliques ; le passage est possible.
import type { Ctx, PlayerId, Weapon } from '../core/types';
import { prepareCommentary } from '../ia';
import { button, clear, el, menuScreen } from './dom';
import type { ArsenalResult } from './screenArsenal';
import { renderWeaponCard } from './weaponCard';

type Advance = 'next' | 'skip';

/** Même cadence que la pesée vocale de l'animateur (src/ia/commentary.ts, lot LVOX) : 1re arme à 1,8 s, puis 3 s
 *  par arme. Les cartes avancent seules à ce rythme (carte = voix), « Next » reste possible pour aller plus vite. */
const WEIGH_IN_FIRST_MS = 1800;
const WEIGH_IN_STEP_MS = 3000;

function waitAdvance(nextBtn: HTMLButtonElement, skipBtn: HTMLButtonElement, autoMs: number): Promise<Advance> {
  return new Promise((resolve) => {
    const auto = window.setTimeout(() => onNext(), autoMs);
    const onNext = () => {
      cleanup();
      resolve('next');
    };
    const onSkip = () => {
      cleanup();
      resolve('skip');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    function cleanup() {
      window.clearTimeout(auto);
      nextBtn.removeEventListener('click', onNext);
      skipBtn.removeEventListener('click', onSkip);
      window.removeEventListener('keydown', onKey);
    }
    nextBtn.addEventListener('click', onNext);
    skipBtn.addEventListener('click', onSkip);
    window.addEventListener('keydown', onKey);
  });
}

export async function runReveal(ctx: Ctx, screenLayer: HTMLElement, arsenal: ArsenalResult): Promise<void> {
  clear(screenLayer);
  const { root, card } = menuScreen('reveal-card');
  card.append(el('h2', 'b-title', 'Weapon Check'));
  const stage = el('div', 'reveal-stage');
  const subtitle = el('p', 'reveal-subtitle');
  subtitle.hidden = true;
  const nextBtn = button('Announcer is warming up…', 'b-btn');
  const skipBtn = button('Skip presentation', 'b-btn small alt');
  nextBtn.disabled = true;
  const footer = el('div', 'reveal-footer');
  footer.append(nextBtn, skipBtn);
  card.append(stage, subtitle, footer);
  screenLayer.append(root);

  const order: { player: PlayerId; weapon: Weapon }[] = [
    ...arsenal.weapons[0].map((weapon) => ({ player: 0 as PlayerId, weapon })),
    ...arsenal.weapons[1].map((weapon) => ({ player: 1 as PlayerId, weapon })),
  ];
  const showCard = (i: number) => {
    const { player, weapon } = order[i];
    clear(stage);
    stage.append(
      el('p', `reveal-kicker p${player + 1}`, `Player ${player + 1}`),
      renderWeaponCard(weapon, { player, cardNumber: i + 1, photoUrl: arsenal.photos.get(weapon.id), reveal: true }),
    );
    // Réplique écrite par défaut, remplacée par ce que l'animateur dit RÉELLEMENT (voice:line).
    subtitle.hidden = false;
    subtitle.textContent = weapon.lines.intro;
  };
  // La 1re carte est là tout de suite : pas d'écran vide pendant que l'animateur se prépare.
  if (order.length) showCard(0);

  // L'animateur a 6 s pour se préparer ; passé ce délai (ou sur Skip), on continue avec ses répliques de
  // secours. Le passage reste toujours possible : un appel IA lent ne doit jamais bloquer le parcours.
  let skipped = false;
  await Promise.race([
    prepareCommentary(order.map((o) => o.weapon)).catch((e) => console.warn('[reveal] animateur indisponible', e)),
    new Promise((r) => setTimeout(r, 6000)),
    new Promise<void>((r) => skipBtn.addEventListener('click', () => { skipped = true; r(); }, { once: true })),
  ]);
  if (skipped) return;
  nextBtn.disabled = false;
  nextBtn.textContent = 'Next';

  const offVoice = ctx.bus.on('voice:line', ({ text, speaker }) => {
    if (speaker !== 'announcer') return;
    subtitle.hidden = false;
    subtitle.textContent = text;
  });

  for (let i = 0; i < order.length; i++) {
    if (i > 0) showCard(i);
    nextBtn.textContent = i === order.length - 1 ? 'To the map' : 'Next';
    const autoMs = i === 0 ? WEIGH_IN_FIRST_MS + WEIGH_IN_STEP_MS : WEIGH_IN_STEP_MS;
    if ((await waitAdvance(nextBtn, skipBtn, autoMs)) === 'skip') break;
  }
  offVoice();
}
