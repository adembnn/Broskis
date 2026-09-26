// Écran de fin (lot LUX) : le gagnant en grand (portrait, nom, couleur de son coin), puis pour chacun le % final,
// les éjections infligées et les dégâts, l'arme MVP avec son sticker, les nouveautés du Scandex (lot LW).
// Deux choix seulement : REMATCH (touche R) et MENU. L'enchaînement (relance, retour au titre) vit dans index.ts.
import type { Ctx, PlayerId } from '../core/types';
import { button, el, menuScreen } from './dom';
import { kbd } from './keys';
import type { MatchLog } from './matchLog';
import { fighterPortrait } from './portraits';
import { openScandexScreen } from './scandex/screen';
import { getNewSinceMatchStart } from './scandex/store';
import { weaponSticker } from './sticker2d';

/** 'none' : un autre match a été lancé pendant l'affichage (hooks, labo) — rien à faire. */
export type EndAction = 'rematch' | 'menu' | 'none';

function playerColumn(ctx: Ctx, log: MatchLog, player: PlayerId, winner: PlayerId): HTMLDivElement {
  const ps = ctx.state.players[player];
  const other = (player === 0 ? 1 : 0) as PlayerId;
  const kos = log.falls[other] || (log.lastKo?.player === other ? 1 : 0);
  const col = el('div', `end-col p${player + 1}${player === winner ? ' won' : ''}`);
  const head = el('div', 'end-col-head');
  head.append(fighterPortrait(ps.fighter, player), el('span', 'end-col-name', ps.fighter?.name ?? `Player ${player + 1}`));
  const stats = el('div', 'end-stats');
  const stat = (value: string, label: string) => {
    const box = el('div', 'end-stat');
    box.append(el('span', 'end-stat-value', value), el('span', 'end-stat-label', label));
    return box;
  };
  stats.append(
    stat(`${Math.round(ps.pct ?? 0)}%`, 'final damage'),
    stat(String(kos), kos === 1 ? 'KO' : 'KOs'),
    stat(String(Math.round(log.totalDamageBy(player))), 'dealt'),
  );
  col.append(head, stats);
  return col;
}

/** Monte l'écran de fin et attend le choix du joueur. */
export function showEndScreen(ctx: Ctx, screenLayer: HTMLElement, log: MatchLog, winner: PlayerId): Promise<EndAction> {
  return new Promise((resolve) => {
    const { root, card } = menuScreen(`end-card p${winner + 1}`);
    const wps = ctx.state.players[winner];
    const winnerName = wps.fighter?.name ?? `Player ${winner + 1}`;
    const hero = el('div', 'end-hero');
    const title = el('div', 'end-title');
    title.append(el('span', `ptoken p${winner + 1}`, ctx.state.vsAI && winner === 1 ? 'AI' : `P${winner + 1}`), el('span', 'end-name', winnerName));
    const heroRow = el('div', 'end-hero-row');
    heroRow.style.display = 'flex';
    heroRow.style.alignItems = 'center';
    heroRow.style.gap = '24px';
    
    const buildWeaponMini = (w: typeof wps.weapons[0]) => {
      if (!w) return el('div');
      const box = el('div', 'end-hero-weapon');
      box.style.display = 'grid';
      box.style.justifyItems = 'center';
      box.style.gap = '8px';
      const sticker = weaponSticker(w, 'end-hero-sticker');
      sticker.style.width = '100px';
      sticker.style.height = '100px';
      const nameEl = el('span', 'end-hero-wname', w.object || w.name);
      nameEl.style.font = '800 16px/1.1 var(--b-body)';
      nameEl.style.textAlign = 'center';
      nameEl.style.maxWidth = '120px';
      box.append(sticker, nameEl);
      return box;
    };
    
    heroRow.append(buildWeaponMini(wps.weapons[0]), fighterPortrait(wps.fighter, winner), buildWeaponMini(wps.weapons[1]));

    hero.append(heroRow, title, el('div', 'end-wins', 'WINS!'));
    card.append(hero);

    const cols = el('div', 'end-cols');
    cols.append(playerColumn(ctx, log, 0, winner), playerColumn(ctx, log, 1, winner));
    card.append(cols);

    const mvp = log.mvpWeapon();
    const mvpWeapon = mvp && ctx.state.players.flatMap((p) => p.weapons).find((w) => w.id === mvp.id);
    if (mvp && mvpWeapon) {
      const row = el('div', 'end-mvp');
      row.append(
        weaponSticker(mvpWeapon, 'end-mvp-sticker'),
        el('span', 'end-mvp-label', 'MVP weapon'),
        el('strong', 'end-mvp-name', mvp.name),
        el('span', 'end-mvp-total', `${Math.round(mvp.total)}% dealt`),
      );
      card.append(row);
    }

    // Lot LW (Scandex) : les armes fraîchement scannées pendant ce match.
    const newWeapons = getNewSinceMatchStart();
    const actions = el('div', 'screen-foot end-actions');
    const rematchBtn = button('', 'b-btn cta');
    rematchBtn.append(kbd('R'), document.createTextNode(' Rematch'));
    const menuBtn = button('Menu', 'b-btn');
    actions.append(rematchBtn, menuBtn);
    if (newWeapons.length) {
      const keys = new Set(newWeapons.map((w) => w.object.trim().toLowerCase()));
      actions.append(
        button(`Scandex (+${newWeapons.length} new)`, 'b-btn small', () => openScandexScreen(screenLayer, { highlightObjects: keys })),
      );
    }
    card.append(actions);
    screenLayer.replaceChildren(root);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || screenLayer.querySelector('.scandex-card')) return;
      if (e.key.toLowerCase() === 'r') finish('rematch');
    };
    const offStart = ctx.bus.on('match:start', () => finish('none'));
    function finish(action: EndAction) {
      offStart();
      window.removeEventListener('keydown', onKey);
      if (action !== 'none') screenLayer.replaceChildren();
      resolve(action);
    }
    window.addEventListener('keydown', onKey);
    rematchBtn.addEventListener('click', () => finish('rematch'));
    menuBtn.addEventListener('click', () => finish('menu'));
  });
}
