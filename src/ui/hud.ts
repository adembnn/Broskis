// HUD persistant pendant le match : PV segmentés (P1 gauche / P2 droite, miroir), budget de déplacement,
// 3 armes + recharge (pip retourné = carte retournée), chrono, bandeau de tour, sous-titres de l'animateur,
// PERFECT/GOOD/MISS, RING OUT!/K.O. Monter AVANT ctx.hooks.startMatch(...) : sinon le tout premier `turn:start`
// (émis en synchrone) est manqué.
import { durees } from '../art/tokens.js';
import { MOVE_BUDGET } from '../core/state';
import type { Ctx, PlayerId, Weapon } from '../core/types';
import { createCommentary } from './commentary';
import { el, fmtSeconds, makeBar, strokeNum } from './dom';
import { createFloaters } from './floaters';
import { createHpBar } from './hpBar';
import { categoryIconSvg } from './icons';
import { LOCAL_TOKENS } from './theme';

const TICKING_PHASES = new Set(['turn-intro', 'move', 'aim', 'resolve']);
const ARSENAL_SIZE = 3;

// Pip persistant (pas recréé à chaque sync) : sinon `.cooling` bascule sur un nœud tout neuf et la transition
// CSS de retournement (durees.glisse) ne joue jamais — on ne verrait qu'un instantané, jamais le mouvement.
function createWeaponPip() {
  const pip = el('div', 'weapon-pip');
  const flip = el('div', 'weapon-pip-flip');
  const front = el('div', 'weapon-pip-face front');
  const back = el('div', 'weapon-pip-face back');
  const cd = strokeNum('', 'pip-cd');
  back.append(cd);
  flip.append(front, back);
  pip.append(flip);
  let lastCategory = '';
  return {
    root: pip,
    update(weapon: Weapon, active: boolean) {
      pip.hidden = false;
      if (weapon.category !== lastCategory) {
        front.innerHTML = categoryIconSvg(weapon.category);
        pip.style.setProperty('--accent', LOCAL_TOKENS.category[weapon.category]);
        lastCategory = weapon.category;
      }
      pip.title = weapon.name;
      pip.classList.toggle('active', active);
      pip.classList.toggle('cooling', weapon.cooldown > 0);
      cd.textContent = weapon.cooldown > 0 ? String(weapon.cooldown) : '';
    },
  };
}

function renderPlayerPanel(player: PlayerId) {
  const root = el('div', `hud-side p${player + 1}`);
  const name = el('div', 'hud-name');
  const hp = createHpBar(player);
  const weaponsRow = el('div', 'hud-weapons');
  const pips = Array.from({ length: ARSENAL_SIZE }, () => createWeaponPip());
  weaponsRow.append(...pips.map((p) => p.root));
  root.append(name, hp.root, weaponsRow);
  return { root, name, hp, pips };
}
type PlayerPanel = ReturnType<typeof renderPlayerPanel>;

function syncPlayerPanel(ctx: Ctx, player: PlayerId, panel: PlayerPanel) {
  const ps = ctx.state.players[player];
  panel.name.textContent = ps.fighter?.name ?? `Player ${player + 1}`;
  panel.hp.set(ps.hp, ps.fighter?.hpMax ?? 100);
  panel.pips.forEach((pip, i) => {
    const weapon = ps.weapons[i];
    if (weapon) pip.update(weapon, i === ps.selected);
    else pip.root.hidden = true;
  });
}

export interface Hud {
  root: HTMLDivElement;
  dispose(): void;
}

export function mountHud(ctx: Ctx): Hud {
  const root = el('div', 'hud-root');
  const p1 = renderPlayerPanel(0);
  const p2 = renderPlayerPanel(1);
  const top = el('div', 'hud-top');
  top.append(p1.root, p2.root);

  const turnBanner = el('div', 'turn-banner');
  turnBanner.hidden = true;
  const centerBanner = el('div', 'center-banner');
  centerBanner.hidden = true;

  const timerBar = makeBar('mini', 'hud-timer-bar');
  const timerNum = strokeNum('', 'hud-timer-num');
  const timerWrap = el('div', 'hud-timer');
  timerWrap.append(timerBar.root, timerNum);
  const moveBar = makeBar('mini', 'hud-move-bar');
  const moveNum = el('span', 'num hud-move-num');
  const moveWrap = el('div', 'hud-move');
  moveWrap.append(el('span', 'hud-move-label', 'Move'), moveBar.root, moveNum);
  const dock = el('div', 'hud-dock');
  dock.append(timerWrap, moveWrap);

  const commentary = createCommentary();

  const floaters = createFloaters(ctx);
  root.append(top, turnBanner, centerBanner, dock, commentary.root, floaters.root);

  const sync = () => {
    syncPlayerPanel(ctx, 0, p1);
    syncPlayerPanel(ctx, 1, p2);
  };
  sync();

  let turnStartTimer = ctx.state.timerLeft || 1;
  function renderMove(player: PlayerId, moveLeft: number) {
    moveBar.set(moveLeft / MOVE_BUDGET);
    moveNum.textContent = `P${player + 1} · ${moveLeft.toFixed(1)}m`;
  }
  renderMove(ctx.state.active, ctx.state.players[ctx.state.active].moveLeft);

  let turnBannerTimer = 0;
  function showTurnBanner(active: PlayerId) {
    turnBanner.className = `turn-banner p${active + 1}`;
    turnBanner.textContent = `P${active + 1} — YOUR TURN!`;
    turnBanner.hidden = false;
    turnBanner.classList.remove('enter');
    void turnBanner.offsetWidth;
    turnBanner.classList.add('enter');
    window.clearTimeout(turnBannerTimer);
    turnBannerTimer = window.setTimeout(() => {
      turnBanner.hidden = true;
    }, durees.bandeau);
  }

  let centerBannerTimer = 0;
  function showCenterBanner(text: string, cls: string, ms: number) {
    centerBanner.className = `center-banner ${cls}`;
    centerBanner.textContent = text;
    centerBanner.hidden = false;
    centerBanner.classList.remove('enter');
    void centerBanner.offsetWidth;
    centerBanner.classList.add('enter');
    window.clearTimeout(centerBannerTimer);
    centerBannerTimer = window.setTimeout(() => {
      centerBanner.hidden = true;
    }, ms);
  }

  function commentaryNames(): { name: string; color: string }[] {
    const names: { name: string; color: string }[] = [];
    for (const p of ctx.state.players) {
      if (p.fighter) names.push({ name: p.fighter.name, color: p.id === 0 ? 'var(--b-p1-fonce)' : 'var(--b-p2-fonce)' });
      for (const wpn of p.weapons) names.push({ name: wpn.name, color: p.id === 0 ? 'var(--b-p1-fonce)' : 'var(--b-p2-fonce)' });
    }
    return names;
  }

  const offs = [
    ctx.bus.on('turn:start', ({ active }) => {
      turnStartTimer = ctx.state.timerLeft || turnStartTimer;
      showTurnBanner(active);
      renderMove(active, ctx.state.players[active].moveLeft);
      sync();
    }),
    ctx.bus.on('hit', ({ damage, crit, pos }) => {
      sync();
      floaters.spawnWorld(pos, `-${Math.round(damage)}`, crit ? 'crit' : '');
    }),
    ctx.bus.on('weapon:pick', ({ player, index }) => {
      ctx.state.players[player].selected = index;
      sync();
    }),
    ctx.bus.on('fire', () => sync()),
    ctx.bus.on('move:update', ({ player, moveLeft }) => renderMove(player, moveLeft)),
    ctx.bus.on('parry:result', ({ grade }) => {
      const label = grade === 'perfect' ? 'PERFECT!' : grade === 'good' ? 'GOOD' : 'MISS';
      showCenterBanner(label, `grade-${grade}`, durees.dramatique);
    }),
    ctx.bus.on('ringout', ({ player }) => showCenterBanner(`P${player + 1} — RING OUT!`, 'ko', durees.ko)),
    ctx.bus.on('ko', ({ player }) => showCenterBanner(`P${player + 1} — K.O.!`, 'ko', durees.ko)),
    ctx.bus.on('commentary:line', ({ text }) => commentary.show(text, commentaryNames())),
  ];

  ctx.loop.addSystem(
    'ui-hud-timer',
    (_dt, real) => {
      // Ne défile que pendant un tour actif : sinon les écrans de choix (perso/arsenal/présentation/map, qui
      // n'ont pas de limite de temps) videraient le chrono avant même le premier match:start.
      if (TICKING_PHASES.has(ctx.state.phase)) ctx.state.timerLeft = Math.max(0, ctx.state.timerLeft - real);
      timerBar.set(ctx.state.timerLeft / turnStartTimer);
      timerNum.textContent = fmtSeconds(ctx.state.timerLeft);
    },
    900,
  );

  return {
    root,
    dispose() {
      for (const off of offs) off();
      window.clearTimeout(turnBannerTimer);
      window.clearTimeout(centerBannerTimer);
      commentary.dispose();
      floaters.dispose();
    },
  };
}
