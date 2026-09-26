// Écran-titre : BROSKIS, PLAY, et un mode « vs AI » visiblement désactivé (vague 2).
import { button, el, menuScreen } from './dom';

export function mountTitle(container: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const { root, card } = menuScreen('title-card');
    card.append(el('h1', 'b-title', 'BROSKIS'));
    card.append(el('p', 'b-lede', 'Snap any real object: it becomes your weapon.'));

    const row = el('div', 'title-actions');
    const play = button('PLAY', 'b-btn', () => resolve());
    const vsWrap = el('div', 'vs-ai-wrap');
    const vsAi = button('vs AI', 'b-btn small', undefined);
    vsAi.disabled = true;
    vsWrap.append(vsAi, el('span', 'coming-soon', 'coming soon'));
    row.append(play, vsWrap);
    card.append(row);

    container.append(root);
  });
}
