// Écran-titre (lot LUX) : le concept en 3 secondes. Logo BROSKIS en sticker, une phrase, les vraies armes-objets
// collées autour (canard, poêle, baguette…) : on voit tout de suite que des objets deviennent des armes.
// Un seul gros bouton PLAY (2 joueurs, même clavier) ; « vs AI » déplie les difficultés (lot LX) ; Scandex (lot LW)
// en lien discret.
import { presetsReady, weaponPresets } from './presets';
import { button, el, menuScreen } from './dom';
import { openScandexScreen } from './scandex/screen';
import { weaponSticker } from './sticker2d';

type Difficulty = 'easy' | 'medium' | 'hard' | 'hardcore';

/** Place des stickers d'armes autour du logo (positions en % de l'écran, inclinaison en degrés). */
const SPOTS: [number, number, number][] = [
  [11, 17, -12], [80, 13, 10], [11, 60, 8], [86, 57, -9], [24, 85, -6], [72, 85, 12],
];

export function mountTitle(container: HTMLElement): Promise<{ vsAI?: boolean; difficulty?: Difficulty } | void> {
  return new Promise((resolve) => {
    const { root, card } = menuScreen('title-card');
    root.classList.add('title-screen');

    const deco = el('div', 'title-stickers');
    root.prepend(deco);
    void presetsReady.then(() => {
      weaponPresets()
        .slice(0, SPOTS.length)
        .forEach((w, i) => {
          const [x, y, r] = SPOTS[i];
          const s = weaponSticker(w, 'title-sticker');
          s.style.left = `${x}%`;
          s.style.top = `${y}%`;
          s.style.setProperty('--r', `${r}deg`);
          s.style.animationDelay = `${120 + i * 90}ms`;
          deco.append(s);
        });
    });

    const logo = el('h1', 'b-title title-logo', 'BROSKIS');
    const tagline = el('p', 'title-tagline', 'Snap any real object: it becomes your weapon.');
    card.append(logo, tagline);

    const mainRow = el('div', 'title-actions');
    const play = button('', 'b-btn cta title-play', () => resolve());
    play.append(el('span', 'title-play-main', 'PLAY'), el('span', 'title-play-sub', '2 players · 1 keyboard'));
    const vsAi = button('vs AI', 'b-btn', () => {
      mainRow.hidden = true;
      diffRow.hidden = false;
    });
    mainRow.append(play, vsAi);

    const diffRow = el('div', 'title-actions diff-actions');
    diffRow.hidden = true;
    diffRow.append(el('span', 'diff-label', 'AI level'));
    for (const d of ['easy', 'medium', 'hard', 'hardcore'] as Difficulty[]) {
      diffRow.append(button(d.toUpperCase(), `b-btn small diff-btn${d === 'hardcore' ? ' hardcore' : ''}`, () => resolve({ vsAI: true, difficulty: d })));
    }
    diffRow.append(
      button('Back', 'b-btn link', () => {
        diffRow.hidden = true;
        mainRow.hidden = false;
      }),
    );

    const scandex = button('Scandex: your scanned weapons', 'b-btn link title-scandex', () => openScandexScreen(container));
    card.append(mainRow, diffRow, scandex);
    container.append(root);
  });
}
