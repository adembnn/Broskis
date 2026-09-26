// Fin de match sur match:end : « Damage Report » façon addition (inspiré de src/wow/endscreen.js de
// bagarre-de-taverne, « L'Addition »), meilleur coup, arme MVP, Rematch (touche R) et New fighters.
import type { Ctx, PlayerId } from '../core/types';
import { button, clear, el, menuScreen } from './dom';
import type { MatchLog } from './matchLog';
import { openScandexScreen } from './scandex/screen';
import { getNewSinceMatchStart } from './scandex/store';

function billLine(label: string, amount: number): HTMLLIElement {
  const li = el('li', 'bill-line');
  li.append(el('span', 'bill-label', label), el('span', 'bill-dots'), el('span', 'num bill-amount', String(Math.round(amount))));
  return li;
}

function renderReport(ctx: Ctx, card: HTMLDivElement, log: MatchLog, winner: PlayerId) {
  const winnerName = ctx.state.players[winner].fighter?.name ?? `Player ${winner + 1}`;
  card.append(el('h2', 'b-title', 'Damage Report'), el('p', 'b-lede', `${winnerName} takes the win.`));

  const layout = el('div', 'report-layout');
  const bill = el('section', 'report-bill');
  bill.append(el('h3', 'b-title', 'The Bill'));
  const lines = el('ul', 'bill-lines');
  const recent = log.lines.slice(-10);
  if (!recent.length) lines.append(el('li', 'bill-empty', 'Not a single hit landed. Riveting.'));
  for (const line of recent) lines.append(billLine(`${line.weaponName} on P${line.target + 1}${line.crit ? ' (crit)' : ''}`, line.damage));
  bill.append(lines);
  const total = el('p', 'bill-total');
  total.append(el('span', '', 'Total dealt by winner'), el('b', 'num', String(Math.round(log.totalDamageBy(winner)))));
  bill.append(total);

  const side = el('section', 'report-side');
  side.append(el('h3', 'b-title', 'Best Hit'));
  side.append(el('p', 'report-best', log.bestHit ? `${log.bestHit.weaponName} — ${Math.round(log.bestHit.damage)} damage` : 'No standout hit this match.'));
  const mvp = log.mvpWeapon();
  side.append(el('h3', 'b-title', 'MVP Weapon'));
  side.append(el('p', 'report-mvp', mvp ? `${mvp.name} — ${Math.round(mvp.total)} total damage` : 'No weapon stood out.'));
  if (log.lastKo) side.append(el('p', 'report-cause', log.lastKo.cause === 'ringout' ? 'Ended in a ring out.' : 'Ended on hit points.'));

  layout.append(bill, side);
  card.append(layout);

  // Lot LW (Scandex) : met en avant les armes fraîchement scannées pendant ce match.
  const newWeapons = getNewSinceMatchStart();
  if (newWeapons.length) {
    const scandexSection = el('section', 'report-scandex');
    scandexSection.append(el('h3', 'b-title', 'New in Scandex'));
    const names = newWeapons.map((w) => w.name).join(', ');
    scandexSection.append(el('p', '', names));
    card.append(scandexSection);
  }
}

export type EndAction = 'rematch' | 'new-fighters';

/** Se réabonne à chaque appel : à n'appeler qu'une fois par match (voir src/ui/index.ts). */
export function runEndScreen(ctx: Ctx, screenLayer: HTMLElement, log: MatchLog): Promise<EndAction> {
  return new Promise((resolve) => {
    const off = ctx.bus.on('match:end', ({ winner }) => {
      off();
      // LG (gameplay) est encore un stub : au cas où rien d'autre ne l'a fait, on referme la phase proprement.
      if (ctx.state.phase !== 'end') ctx.bus.emit('phase:change', { from: ctx.state.phase, to: 'end' });
      const { root, card } = menuScreen('end-card');
      renderReport(ctx, card, log, winner);

      const actions = el('div', 'report-actions');
      const rematchBtn = button('Rematch (R)', 'b-btn');
      const newFightersBtn = button('New fighters', 'b-btn small alt');
      const newWeaponKeys = new Set(getNewSinceMatchStart().map((w) => w.object.trim().toLowerCase()));
      const scandexBtn = button('Scandex', 'b-btn small', () => openScandexScreen(screenLayer, { highlightObjects: newWeaponKeys }));
      actions.append(rematchBtn, newFightersBtn, scandexBtn);
      card.append(actions);
      clear(screenLayer);
      screenLayer.append(root);

      const onKey = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === 'r') finish('rematch');
      };
      function finish(action: EndAction) {
        window.removeEventListener('keydown', onKey);
        clear(screenLayer);
        resolve(action);
      }
      window.addEventListener('keydown', onKey);
      rematchBtn.addEventListener('click', () => finish('rematch'));
      newFightersBtn.addEventListener('click', () => finish('new-fighters'));
    });
  });
}
