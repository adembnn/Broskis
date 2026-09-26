// HUD du match façon Smash (lot LUX) : en bas, un encart par joueur (portrait, nom, % énorme qui saute et change de
// couleur, vies, jauge BRO), au centre la barre des 3 armes du joueur actif (sticker, nom, catégorie, touche,
// recharge), au-dessus l'aide contextuelle (help.ts). Bandeaux READY? / GO! / GAME!, bandeau de tour, notes de
// parade, sous-titres de l'animateur en haut. Monter AVANT ctx.hooks.startMatch (le 1er turn:start est synchrone).
import { durees } from '../art/tokens.js';
import type { Ctx, PlayerId, Weapon } from '../core/types';
import { createCommentary } from './commentary';
import { el } from './dom';
import { categoryTag } from './icons';
import { createFloaters } from './floaters';
import { mountHelp } from './help';
import { kbd } from './keys';
import { fighterPortrait } from './portraits';
import { weaponSticker } from './sticker2d';
import { LOCAL_TOKENS } from './theme';

const MATCH_PHASES = new Set(['turn-intro', 'move', 'aim', 'resolve', 'snap-time', 'ko']);
const ARSENAL_SIZE = 3;

/** Couleur du % façon Smash : blanc → jaune → orange → rouge → rouge sombre (paliers LOCAL_TOKENS.pct). */
function pctColor(pct: number): string {
  const ramp = LOCAL_TOKENS.pct;
  if (pct <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    const [p1, c1] = ramp[i];
    const [p0, c0] = ramp[i - 1];
    if (pct <= p1) return mix(c0, c1, (pct - p0) / (p1 - p0));
  }
  return ramp[ramp.length - 1][1];
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function replay(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// ---------- Encart joueur ----------
function createPlate(player: PlayerId) {
  const root = el('div', `plate p${player + 1}`);
  const portrait = el('div', 'plate-portrait');
  const body = el('div', 'plate-body');
  const name = el('div', 'plate-name');
  const pct = el('div', 'plate-pct');
  const pctNum = el('span', 'pct-num', '0');
  pct.append(pctNum, el('span', 'pct-sign', '%'));
  const stocks = el('div', 'plate-stocks');
  const bro = el('div', 'plate-bro');
  const broFill = el('i');
  const broLabel = el('span', 'bro-label', 'BRO');
  bro.append(broFill, broLabel);
  body.append(name, pct, stocks);
  root.append(portrait, body, bro);

  let lastPct = -1;
  let lastStocks = -1;
  let lastFighter = '';
  return {
    root,
    sync(ctx: Ctx) {
      const ps = ctx.state.players[player];
      const f = ps.fighter;
      const fid = f?.id ?? '';
      if (fid !== lastFighter) {
        lastFighter = fid;
        name.textContent = f?.name ?? `Player ${player + 1}`;
        portrait.replaceChildren(fighterPortrait(f, player));
      }
      const p = Math.max(0, Math.round(ps.pct ?? 0));
      if (p !== lastPct) {
        if (lastPct >= 0 && p > lastPct) replay(pct, 'hit');
        pctNum.textContent = String(p);
        pct.style.setProperty('--pct-color', pctColor(p));
        lastPct = p;
      }
      const s = Math.max(0, ps.stocks ?? 0);
      if (s !== lastStocks) {
        const total = Math.max(s, ctx.state.demo ? 1 : 2, lastStocks);
        stocks.replaceChildren(
          ...Array.from({ length: total }, (_, i) => el('span', `stock${i < s ? '' : ' lost'}`)),
        );
        if (lastStocks > s) replay(stocks, 'lost-one');
        lastStocks = s;
      }
      root.classList.toggle('active', ctx.state.active === player && MATCH_PHASES.has(ctx.state.phase));
      root.classList.toggle('ledge', !!ps.onLedge);
    },
    setBro(value: number, ready: boolean) {
      broFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
      bro.classList.toggle('ready', ready);
      broLabel.textContent = ready ? 'BRO SMASH READY' : 'BRO';
    },
    reset() {
      lastPct = -1;
      lastStocks = -1;
    },
  };
}

// ---------- Barre d'armes du joueur actif ----------
function createWeaponCard(index: number) {
  const root = el('div', 'wcard');
  const key = kbd(String(index + 1), 'wcard-key');
  const art = el('div', 'wcard-art');
  const name = el('div', 'wcard-name');
  const tagSlot = el('div', 'wcard-tag');
  const cd = el('div', 'wcard-cd', 'READY IN 1 TURN');
  root.append(key, art, name, tagSlot, cd);
  let lastId = '';
  let lastSticker = '';
  return {
    root,
    update(w: Weapon | undefined, selected: boolean) {
      root.hidden = !w;
      if (!w) return;
      if (w.id !== lastId || (w.stickerUrl ?? '') !== lastSticker) {
        lastId = w.id;
        lastSticker = w.stickerUrl ?? '';
        art.replaceChildren(weaponSticker(w, 'wcard-sticker'));
        name.textContent = w.name;
        tagSlot.replaceChildren(categoryTag(w, true));
      }
      root.classList.toggle('selected', selected);
      root.classList.toggle('cooling', w.cooldown > 0);
      cd.textContent = w.cooldown > 1 ? `READY IN ${w.cooldown} TURNS` : 'READY IN 1 TURN';
    },
  };
}

export interface Hud {
  root: HTMLDivElement;
  dispose(): void;
}

export function mountHud(ctx: Ctx): Hud {
  const root = el('div', 'hud-root');
  root.hidden = true;
  const plates = [createPlate(0), createPlate(1)];
  const wbar = el('div', 'wbar');
  const cards = Array.from({ length: ARSENAL_SIZE }, (_, i) => createWeaponCard(i));
  wbar.append(...cards.map((c) => c.root));

  const turnBanner = el('div', 'turn-banner');
  turnBanner.hidden = true;
  const centerBanner = el('div', 'center-banner');
  centerBanner.hidden = true;
  const bigBanner = el('div', 'big-banner');
  bigBanner.hidden = true;

  const commentary = createCommentary();
  const floaters = createFloaters(ctx);
  const help = mountHelp(ctx);
  // Colonne du bas, au centre : sous-titre de l'animateur (2 s), aide à touches, barre d'armes. Rien d'autre.
  const bottom = el('div', 'hud-bottom');
  bottom.append(commentary.root, help.root, wbar);
  root.append(help.world, plates[0].root, plates[1].root, bottom, turnBanner, centerBanner, bigBanner, floaters.root, help.defend);

  const bro = [
    { value: 0, ready: false },
    { value: 0, ready: false },
  ];

  const sync = () => {
    plates[0].sync(ctx);
    plates[1].sync(ctx);
    const active = ctx.state.players[ctx.state.active];
    cards.forEach((c, i) => c.update(active.weapons[i], i === active.selected));
    wbar.classList.toggle('p1', ctx.state.active === 0);
    wbar.classList.toggle('p2', ctx.state.active === 1);
    // La barre n'est utile qu'au joueur qui agit : estompée pendant le vol et la parade.
    const phase = ctx.state.phase;
    wbar.classList.toggle('idle', (phase !== 'move' && phase !== 'aim') || !help.defend.hidden);
  };

  let turnBannerTimer = 0;
  function showTurnBanner(active: PlayerId) {
    const ai = ctx.state.vsAI && active === 1;
    turnBanner.className = `turn-banner p${active + 1}`;
    turnBanner.textContent = ai ? "AI'S TURN" : `P${active + 1}'S TURN`;
    turnBanner.hidden = false;
    replay(turnBanner, 'enter');
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
    replay(centerBanner, 'enter');
    window.clearTimeout(centerBannerTimer);
    centerBannerTimer = window.setTimeout(() => {
      centerBanner.hidden = true;
    }, ms);
  }

  // READY? → GO! → (match) → GAME! Émis par les règles (match:banner) ; repli local si elles ne le font pas.
  let bigTimer = 0;
  let lastBannerAt = 0;
  let gameShown = false;
  function showBig(kind: 'ready' | 'go' | 'game') {
    lastBannerAt = performance.now();
    if (kind === 'game') gameShown = true;
    bigBanner.className = `big-banner ${kind}`;
    bigBanner.textContent = kind === 'ready' ? 'READY?' : kind === 'go' ? 'GO!' : 'GAME!';
    bigBanner.hidden = false;
    replay(bigBanner, 'slam');
    window.clearTimeout(bigTimer);
    const hold = kind === 'go' ? durees.dramatique : kind === 'ready' ? durees.bandeau * 2 : durees.ko * 2;
    bigTimer = window.setTimeout(() => {
      bigBanner.classList.add('leave');
      bigTimer = window.setTimeout(() => {
        bigBanner.hidden = true;
      }, durees.decolle);
    }, hold);
  }

  function commentaryNames(): { name: string; color: string }[] {
    const names: { name: string; color: string }[] = [];
    for (const p of ctx.state.players) {
      const color = p.id === 0 ? 'var(--b-p1-fonce)' : 'var(--b-p2-fonce)';
      if (p.fighter) names.push({ name: p.fighter.name, color });
      for (const wpn of p.weapons) names.push({ name: wpn.name, color });
    }
    return names;
  }

  const offs = [
    ctx.bus.on('phase:change', ({ to }) => {
      root.hidden = !MATCH_PHASES.has(to) && to !== 'end';
      sync();
    }),
    ctx.bus.on('match:start', () => {
      gameShown = false;
      plates.forEach((p) => p.reset());
      bro.forEach((b, i) => {
        b.value = 0;
        b.ready = false;
        plates[i].setBro(0, false);
      });
      root.hidden = false;
      sync();
      const startedAt = performance.now();
      // Repli : sans match:banner des règles dans les 150 ms, on joue READY? / GO! nous-mêmes (affichage seul).
      window.setTimeout(() => {
        if (lastBannerAt >= startedAt) return;
        showBig('ready');
        window.setTimeout(() => showBig('go'), 1200);
      }, 150);
    }),
    ctx.bus.on('match:banner', ({ kind }) => showBig(kind)),
    ctx.bus.on('match:end', () => {
      if (!gameShown) showBig('game');
    }),
    ctx.bus.on('turn:start', ({ active }) => {
      showTurnBanner(active);
      sync();
    }),
    // Pas de chiffre flottant (désencombrement) : c'est le % de l'encart qui saute, tremble et change de couleur.
    ctx.bus.on('hit', () => sync()),
    ctx.bus.on('stock:lost', ({ player, stocksLeft }) => {
      sync();
      const label = stocksLeft <= 0 ? `P${player + 1} — OUT!` : stocksLeft === 1 ? `P${player + 1} — LAST LIFE!` : `P${player + 1} — ${stocksLeft} LIVES LEFT`;
      showCenterBanner(label, `ko p${player + 1}`, durees.ko);
    }),
    ctx.bus.on('respawn', () => sync()),
    ctx.bus.on('ledge:grab', () => sync()),
    ctx.bus.on('ledge:climb', () => sync()),
    ctx.bus.on('weapon:pick', () => sync()),
    ctx.bus.on('fire', () => sync()),
    ctx.bus.on('scan:result', () => sync()),
    ctx.bus.on('parry:window', () => sync()),
    ctx.bus.on('parry:result', ({ grade, deltaMs }) => {
      const label = grade === 'perfect' ? 'PERFECT!' : grade === 'good' ? 'GOOD!' : deltaMs < 0 ? 'TOO EARLY' : 'TOO LATE';
      showCenterBanner(label, `grade-${grade}`, durees.dramatique);
    }),
    ctx.bus.on('bro:gauge', ({ player, value }) => {
      bro[player].value = value;
      plates[player].setBro(value, bro[player].ready);
    }),
    ctx.bus.on('super:ready', ({ player }) => {
      bro[player].ready = true;
      plates[player].setBro(1, true);
    }),
    ctx.bus.on('super:fire', ({ player }) => {
      bro[player].ready = false;
      bro[player].value = 0;
      plates[player].setBro(0, false);
    }),
    // Lot LVOX (une seule voix) : le sous-titre de la carte animateur = ce qui est RÉELLEMENT entendu
    // (`voice:line`, émis par src/audio/barks.ts au démarrage d'une réplique), jamais `commentary:line`.
    // Seulement l'animateur : un bark de perso ou la provocation de l'IA n'ont rien à faire sur sa carte.
    ctx.bus.on('voice:line', ({ text, speaker }) => {
      if (speaker !== 'announcer') return;
      commentary.show(text, commentaryNames());
    }),
  ];

  return {
    root,
    dispose() {
      for (const off of offs) off();
      window.clearTimeout(turnBannerTimer);
      window.clearTimeout(centerBannerTimer);
      window.clearTimeout(bigTimer);
      commentary.dispose();
      floaters.dispose();
      help.dispose();
    },
  };
}
