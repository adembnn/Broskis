// Présentation des armes : cartes façon Wacky Packages, révélées une par une (joueur 1 puis joueur 2),
// sous-titrées par l'animateur (commentary:line). prepareCommentary prépare les répliques ; le passage est possible.
import type { Ctx, PlayerId, Weapon } from '../core/types';
import { prepareCommentary, weaponIntro } from '../ia';
import { button, clear, el, menuScreen } from './dom';
import { typewriter } from './loading';
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
  const nextBtn = button('Next', 'b-btn');
  const skipBtn = button('Skip presentation', 'b-btn small alt');
  const footer = el('div', 'reveal-footer');
  footer.append(nextBtn, skipBtn);
  card.append(stage, subtitle, footer);
  screenLayer.append(root);

  const order: { player: PlayerId; weapon: Weapon }[] = [
    ...arsenal.weapons[0].map((weapon) => ({ player: 0 as PlayerId, weapon })),
    ...arsenal.weapons[1].map((weapon) => ({ player: 1 as PlayerId, weapon })),
  ];

  // LLOAD : plus d'attente ici (25 s mesurées avant). La banque de l'animateur se prépare en fond pendant qu'on
  // présente ; chaque carte est dite avec sa voix dès qu'elle est prête (déjà vocalisée depuis l'arsenal le plus souvent).
  void prepareCommentary(order.map((o) => o.weapon));
  const line = typewriter(subtitle);
  const offCommentary = ctx.bus.on('commentary:line', ({ text }) => {
    subtitle.hidden = false;
    line.set(text);
  });

  let cardNumber = 0;
  for (const { player, weapon } of order) {
    cardNumber += 1;
    const shown = cardNumber;
    clear(stage);
    stage.append(
      el('p', 'reveal-kicker', `Player ${player + 1}`),
      renderWeaponCard(weapon, { player, cardNumber, photoUrl: arsenal.photos.get(weapon.id), reveal: true }),
    );
    subtitle.hidden = false;
    line.set(weapon.lines.intro);
    void weaponIntro(weapon).then(({ text, audioUrl }) => {
      if (shown === cardNumber && audioUrl) ctx.bus.emit('commentary:line', { text, priority: 3, audioUrl, at: ctx.loop.time });
    });
    nextBtn.textContent = cardNumber === order.length ? 'To the map' : 'Next';
    if ((await waitAdvance(nextBtn, skipBtn)) === 'skip') break;
  }
  line.dispose();
  offCommentary();
}
