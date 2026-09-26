// Écran-titre : BROSKIS, PLAY, et un mode « vs AI » visiblement désactivé (vague 2).
import { button, el, menuScreen } from './dom';

export function mountTitle(container: HTMLElement): Promise<{ vsAI?: boolean; difficulty?: 'easy' | 'medium' | 'hard' | 'hardcore' } | void> {
  return new Promise((resolve) => {
    const { root, card } = menuScreen('title-card');
    card.append(el('h1', 'b-title', 'BROSKIS'));
    card.append(el('p', 'b-lede', 'Snap any real object: it becomes your weapon.'));

    const mainRow = el('div', 'title-actions');
    const play = button('PLAY', 'b-btn', () => resolve());
    const vsAi = button('vs AI', 'b-btn small', () => {
      mainRow.style.display = 'none';
      diffRow.style.display = 'flex';
    });
    mainRow.append(play, vsAi);
    
    const diffRow = el('div', 'title-actions diff-actions');
    diffRow.style.display = 'none';
    const btnE = button('EASY', 'b-btn small diff-btn', () => resolve({ vsAI: true, difficulty: 'easy' }));
    const btnM = button('MEDIUM', 'b-btn small diff-btn', () => resolve({ vsAI: true, difficulty: 'medium' }));
    const btnH = button('HARD', 'b-btn small diff-btn', () => resolve({ vsAI: true, difficulty: 'hard' }));
    const btnHC = button('HARDCORE', 'b-btn small diff-btn hardcore', () => resolve({ vsAI: true, difficulty: 'hardcore' }));
    diffRow.append(btnE, btnM, btnH, btnHC);
    
    card.append(mainRow, diffRow);

    container.append(root);
  });
}
