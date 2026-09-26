// Settings → Controls (lot LUX) : une colonne par joueur, une ligne par action (src/core/input.ts). Clic sur une touche
// → « Press a key… » → la touche pressée est enregistrée (ÉCHAP annule). Conflits signalés (le partage saut/parade
// d'un même joueur est permis). « Reset to defaults ». Ouvert depuis l'écran-titre, ou avec ÉCHAP en match (jeu en
// pause : ralenti à 0 via la boucle, touches du jeu bloquées tant que le panneau est ouvert).
import { ACTIONS, getBindings, keyLabel, resetBindings, setBinding } from '../core/input';
import type { Action } from '../core/input';
import type { Ctx, PlayerId } from '../core/types';
import { button, el } from './dom';

const PAUSE_KEY = 'ui-settings-pause';
const PRE_MATCH = new Set(['title', 'fighter-select', 'arsenal', 'reveal', 'map-select', 'end']);
/** Deux actions d'un même joueur qui peuvent partager une touche sans gêne. */
const SHAREABLE: Action[][] = [['jump', 'parry']];

let open = false;
export const isSettingsOpen = (): boolean => open;

function conflictsOf(player: PlayerId, action: Action): string[] {
  const code = getBindings(player)[action][0];
  if (!code) return [];
  const out: string[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    for (const a of ACTIONS) {
      if (p === player && a.id === action) continue;
      if (!getBindings(p)[a.id].includes(code)) continue;
      if (p === player && SHAREABLE.some((g) => g.includes(a.id) && g.includes(action))) continue;
      out.push(`P${p + 1} ${a.label.split(' (')[0].split(' ·')[0]}`);
    }
  }
  return out;
}

/** Ouvre le panneau par-dessus `container`. Se résout à la fermeture. */
export function openSettings(ctx: Ctx, container: HTMLElement): Promise<void> {
  if (open) return Promise.resolve();
  open = true;
  const inMatch = !PRE_MATCH.has(ctx.state.phase);
  if (inMatch) ctx.loop.setSlow(PAUSE_KEY, 0);

  const root = el('div', `b-overlay settings-overlay${inMatch ? ' in-match' : ''}`);
  const card = el('div', 'b-panel b-card settings-card');
  root.append(card);
  const head = el('div', 'settings-head');
  head.append(el('h2', 'b-title', inMatch ? 'Paused' : 'Settings'), el('span', 'settings-tab active', 'Controls'));
  const grid = el('div', 'controls-grid');
  const note = el('p', 'settings-note', 'Click a key, then press the new one. ESC cancels.');
  const foot = el('div', 'screen-foot');
  const reset = button('Reset to defaults', 'b-btn small');
  const done = button(inMatch ? 'Resume' : 'Done', 'b-btn cta');
  foot.append(reset, done);
  card.append(head, grid, note, foot);
  container.append(root);

  let listening: { player: PlayerId; action: Action; btn: HTMLButtonElement } | null = null;

  function render() {
    grid.replaceChildren(el('span', 'cg-corner'), el('span', 'cg-head p1', 'P1'), el('span', 'cg-head p2', 'P2'));
    for (const a of ACTIONS) {
      grid.append(el('span', 'cg-label', a.label));
      for (const p of [0, 1] as PlayerId[]) {
        const cell = el('span', 'cg-cell');
        const codes = getBindings(p)[a.id];
        const b = button(codes.length ? codes.map(keyLabel).join(' / ') : '—', `key-btn p${p + 1}`);
        const conflicts = conflictsOf(p, a.id);
        if (conflicts.length) b.classList.add('conflict');
        b.addEventListener('click', () => {
          if (listening) listening.btn.classList.remove('listening');
          listening = { player: p, action: a.id, btn: b };
          b.classList.add('listening');
          b.textContent = 'Press a key…';
        });
        cell.append(b);
        if (conflicts.length) cell.append(el('span', 'cg-conflict', `Also: ${conflicts.join(', ')}`));
        grid.append(cell);
      }
    }
  }
  render();

  // Tant que le panneau est ouvert, AUCUNE touche n'atteint le jeu (capture sur window, avant tout le monde).
  const onKey = (e: KeyboardEvent) => {
    e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    e.preventDefault();
    if (listening) {
      if (e.code !== 'Escape') setBinding(listening.player, listening.action, [e.code]);
      listening = null;
      render();
      return;
    }
    if (e.code === 'Escape') close();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  let resolveClose!: () => void;
  const closed = new Promise<void>((r) => (resolveClose = r));
  function close() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    if (inMatch) ctx.loop.clearSlow(PAUSE_KEY);
    root.remove();
    open = false;
    resolveClose();
  }
  reset.addEventListener('click', () => {
    resetBindings();
    listening = null;
    render();
  });
  done.addEventListener('click', close);
  return closed;
}

/** ÉCHAP en match : pause + Settings. À appeler une fois (install de l'UI). */
export function installSettingsKey(ctx: Ctx, container: HTMLElement): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || open || e.repeat) return;
    if (PRE_MATCH.has(ctx.state.phase)) return;
    if (container.querySelector('.b-overlay, .b-menu')) return; // SNAP TIME!, écran de fin… déjà ouverts
    e.preventDefault();
    void openSettings(ctx, container);
  });
}
