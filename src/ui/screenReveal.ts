// Présentation des armes : cartes façon Wacky Packages, révélées une par une (joueur 1 puis joueur 2),
// sous-titrées par l'animateur (commentary:line). prepareCommentary prépare les répliques ; le passage est possible.
import type { Ctx, PlayerId, Weapon } from '../core/types';
import { prepareCommentary } from '../ia';
import { button, clear, el, menuScreen } from './dom';
import type { ArsenalResult } from './screenArsenal';
import { renderWeaponCard } from './weaponCard';

type Advance = 'next' | 'skip';

function waitAdvance(nextBtn: HTMLButtonElement, skipBtn: HTMLButtonElement): Promise<Advance> {
  return new Promise((resolve) => {
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
  skipBtn.disabled = true;
  const footer = el('div', 'reveal-footer');
  footer.append(nextBtn, skipBtn);
  card.append(stage, subtitle, footer);
  screenLayer.append(root);

  const order: { player: PlayerId; weapon: Weapon }[] = [
    ...arsenal.weapons[0].map((weapon) => ({ player: 0 as PlayerId, weapon })),
    ...arsenal.weapons[1].map((weapon) => ({ player: 1 as PlayerId, weapon })),
  ];

  await prepareCommentary(order.map((o) => o.weapon));
  nextBtn.disabled = false;
  skipBtn.disabled = false;
  nextBtn.textContent = 'Next';

  const offCommentary = ctx.bus.on('commentary:line', ({ text }) => {
    subtitle.hidden = false;
    subtitle.textContent = text;
  });

  let cardNumber = 0;
  for (const { player, weapon } of order) {
    cardNumber += 1;
    clear(stage);
    stage.append(
      el('p', 'reveal-kicker', `Player ${player + 1}`),
      renderWeaponCard(weapon, { player, cardNumber, photoUrl: arsenal.photos.get(weapon.id), reveal: true }),
    );
    // Réplique par défaut le temps que l'animateur (commentary:line) prenne le relais.
    subtitle.hidden = false;
    subtitle.textContent = weapon.lines.intro;
    nextBtn.textContent = cardNumber === order.length ? 'To the map' : 'Next';
    if ((await waitAdvance(nextBtn, skipBtn)) === 'skip') break;
  }
  offCommentary();
}
