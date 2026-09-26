// Lot LW (partie Scandex) — écran de collection : grille des cartes d'arme déjà scannées (même grammaire sticker
// que le reste de l'UI, réutilise weaponCard.ts). Ouvrable depuis l'écran-titre et la fin de match ; se ferme
// proprement (Échap ou bouton), retire ses écouteurs pour ne rien laisser fuir.
import { button, clear, el, menuScreen } from '../dom';
import { renderWeaponCard } from '../weaponCard';
import { getAll, onChange } from './store';
import type { Weapon } from '../../core/types';

let stylesInjected = false;
/** Petite feuille de style scopée au Scandex : ne référence que des variables --b-* (voir src/ui/theme.ts). */
function injectScandexStyles(): void {
  if (stylesInjected || document.getElementById('scandex-style')) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'scandex-style';
  style.textContent = `
.scandex-card { width:min(760px,94vw); }
.scandex-count { margin:0 0 14px; color:var(--b-muted); font-weight:800; }
.scandex-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:16px; max-height:56vh; overflow-y:auto; padding:4px; margin:0 0 18px; }
.scandex-grid .weapon-card { width:100%; }
.scandex-empty { color:var(--b-muted); font-style:italic; margin:24px 0; }
.scandex-entry.is-new .weapon-card-face { box-shadow:0 0 0 4px var(--b-alerte), var(--b-sticker-shadow); }
.scandex-new-badge { display:inline-block; margin:0 0 10px; padding:2px 10px; font-family:var(--b-display); font-size:13px; text-transform:uppercase; background:var(--b-alerte); border:var(--b-trait) solid var(--b-encre); border-radius:999px; }
`;
  document.head.append(style);
}

export interface ScandexScreenOptions {
  /** Objets réels (déjà normalisés en minuscules/trim) à mettre en avant, ex. les nouvelles armes d'un match. */
  highlightObjects?: Set<string>;
  title?: string;
  onClose?: () => void;
}

/** Ouvre le Scandex par-dessus `container` (empilé après ce qui y est déjà, façon overlay). Retourne un `close()`. */
export function openScandexScreen(container: HTMLElement, opts: ScandexScreenOptions = {}): () => void {
  injectScandexStyles();
  const { root, card } = menuScreen('scandex-card');
  card.append(el('h2', 'b-title', opts.title ?? 'Scandex'));

  const count = el('p', 'scandex-count');
  const grid = el('div', 'scandex-grid');
  const empty = el('p', 'scandex-empty', 'No weapons scanned yet. Snap a real object during a match to fill your Scandex.');

  card.append(count, grid, empty);

  const closeBtn = button('Close', 'b-btn', () => close());
  const actions = el('div', 'report-actions');
  actions.append(closeBtn);
  card.append(actions);

  function render(): void {
    const entries = getAll();
    count.textContent = `${entries.length} weapon${entries.length === 1 ? '' : 's'} discovered`;
    clear(grid);
    empty.hidden = entries.length > 0;
    for (const entry of entries) {
      const wrap = el('div', 'scandex-entry');
      const key = entry.weapon.object.trim().toLowerCase();
      if (opts.highlightObjects?.has(key)) wrap.classList.add('is-new');
      wrap.append(renderWeaponCard(entry.weapon as Weapon, { player: 0 }));
      grid.append(wrap);
    }
  }
  render();
  const offChange = onChange(render);

  container.append(root);

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  window.addEventListener('keydown', onKeydown);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    offChange();
    window.removeEventListener('keydown', onKeydown);
    root.remove();
    opts.onClose?.();
  }

  return close;
}
