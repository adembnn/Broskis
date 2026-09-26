// HUD du temps réel, écran scindé (lot LUX, pivot 15h25) : chaque moitié a le sien — en bas, l'encart du joueur
// (portrait, nom, % énorme qui saute et change de couleur, vies, jauge BRO, BLOCK), sa barre de 3 armes (sticker,
// touche, anneau de recharge en secondes, charge du tir), sa carte de commandes (help.ts), son anneau de parade et
// ses bandeaux (PERFECT!, EDGE!). Au centre : séparateur fin et chrono du match (mort subite à 3:00). En travers :
// READY? 3-2-1 GO! et GAME!. Contre l'IA : une seule vue plein écran, l'IA n'a que son encart.
// Lecture de l'état à chaque image (recharges, charge, blocage) : robuste même si un événement manque.
import { durees } from '../art/tokens.js';
import type { Ctx, PlayerId, PlayerState, Weapon } from '../core/types';
import { createCommentary } from './commentary';
import { el } from './dom';
import { createFloaters } from './floaters';
import { createControlsCard, createControlsMode, createParryRing } from './help';
import { CATEGORY_DOES, categoryIconSvg } from './icons';
import { kbd, onBindingsChange, weaponKeys } from './keys';
import { fighterPortrait } from './portraits';
import { weaponSticker } from './sticker2d';
import { LOCAL_TOKENS } from './theme';

/** Champs du temps réel (plan/PIVOT-TEMPS-REEL.md), ajoutés par le lot règles : lus s'ils existent. */
type RtPlayer = PlayerState & { cooldowns?: number[]; charge?: number; blocking?: boolean };

const PRE_MATCH = new Set(['title', 'fighter-select', 'arsenal', 'reveal', 'map-select']);
/** Durée du match avant la mort subite (s), plan/PIVOT-TEMPS-REEL.md. */
const MATCH_S = 180;

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
  const block = el('span', 'plate-block', 'BLOCK');
  body.append(name, pct, stocks);
  root.append(portrait, body, bro, block);

  let lastPct = -1;
  let lastStocks = -1;
  let lastFighter = '';
  let lastBlock = false;
  return {
    root,
    update(ctx: Ctx) {
      const ps = ctx.state.players[player] as RtPlayer;
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
        stocks.replaceChildren(...Array.from({ length: total }, (_, i) => el('span', `stock${i < s ? '' : ' lost'}`)));
        if (lastStocks > s) replay(stocks, 'lost-one');
        lastStocks = s;
      }
      const blocking = !!ps.blocking;
      if (blocking !== lastBlock) {
        lastBlock = blocking;
        root.classList.toggle('blocking', blocking);
      }
      root.classList.toggle('ledge', !!ps.onLedge);
    },
    setBro(value: number, ready: boolean) {
      broFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
      bro.classList.toggle('ready', ready);
      bro.classList.toggle('on', ready || value > 0);
      broLabel.textContent = ready ? 'BRO SMASH READY' : 'BRO';
    },
    reset() {
      lastPct = -1;
      lastStocks = -1;
    },
  };
}

// ---------- Carte d'arme de la barre ----------
function createWeaponCard() {
  const root = el('div', 'wcard');
  const key = el('span', 'wcard-keyslot');
  const art = el('div', 'wcard-art');
  const name = el('div', 'wcard-name');
  const does = el('div', 'wcard-does');
  const cd = el('div', 'wcard-cd');
  const cdNum = el('span', 'wcard-cd-num');
  cd.append(cdNum);
  const charge = el('div', 'wcard-charge');
  const chargeFill = el('i');
  charge.append(chargeFill);
  root.append(key, art, name, does, cd, charge);
  let lastId = '';
  let lastSticker = '';
  let lastKey = '';
  let total = 0;
  let wasCooling = false;
  return {
    root,
    update(w: Weapon | undefined, selected: boolean, keyLabel: string, cooldown: number | null, chargeK: number) {
      root.hidden = !w;
      if (!w) return;
      if (w.id !== lastId || (w.stickerUrl ?? '') !== lastSticker) {
        lastId = w.id;
        lastSticker = w.stickerUrl ?? '';
        total = 0;
        art.replaceChildren(weaponSticker(w, 'wcard-sticker'));
        name.textContent = w.name;
        does.innerHTML = `<span class="wcard-ico" style="--accent:${LOCAL_TOKENS.category[w.category]}">${categoryIconSvg(w.category)}</span>`;
        does.append(CATEGORY_DOES[w.category]);
      }
      if (keyLabel !== lastKey) {
        lastKey = keyLabel;
        key.replaceChildren(kbd(keyLabel, 'wcard-key'));
      }
      root.classList.toggle('selected', selected);
      // Recharge : en secondes (temps réel, `cooldowns`), sinon en tours (ancien `cooldown`).
      const cooling = cooldown != null ? cooldown > 0.05 : w.cooldown > 0;
      if (cooling) {
        if (cooldown != null) {
          if (cooldown > total) total = cooldown;
          cd.style.setProperty('--cd', String(total > 0 ? cooldown / total : 1));
          cdNum.textContent = cooldown >= 1 ? cooldown.toFixed(0) : cooldown.toFixed(1);
        } else {
          cd.style.setProperty('--cd', '1');
          cdNum.textContent = `${w.cooldown}`;
        }
      } else if (wasCooling) {
        total = 0;
        replay(root, 'ready-pop');
      }
      wasCooling = cooling;
      root.classList.toggle('cooling', cooling);
      const k = selected ? Math.max(0, Math.min(1, chargeK)) : 0;
      charge.classList.toggle('on', k > 0.02);
      chargeFill.style.transform = `scaleX(${k})`;
    },
  };
}

// ---------- Une moitié d'écran ----------
function createHalf(ctx: Ctx, player: PlayerId, mode: ReturnType<typeof createControlsMode>) {
  const root = el('div', `half p${player + 1}`);
  const plate = createPlate(player);
  const wbar = el('div', 'wbar');
  const cards = Array.from({ length: 3 }, () => createWeaponCard());
  wbar.append(...cards.map((c) => c.root));
  const ctrl = createControlsCard(player, mode);
  const row = el('div', 'half-row');
  row.append(plate.root, wbar);
  const bottom = el('div', 'half-bottom');
  bottom.append(ctrl.root, row);
  const banner = el('div', 'half-banner');
  banner.hidden = true;
  const edge = el('div', 'half-edge', 'EDGE!');
  edge.hidden = true;
  const ring = createParryRing(ctx, player);
  root.append(ring.root, banner, edge, bottom);

  let bannerTimer = 0;
  let keys = weaponKeys(player);
  const offKeys = onBindingsChange(() => (keys = weaponKeys(player)));
  return {
    root,
    plate,
    ring,
    showBanner(text: string, cls: string, ms: number) {
      banner.className = `half-banner ${cls}`;
      banner.textContent = text;
      banner.hidden = false;
      replay(banner, 'enter');
      window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => (banner.hidden = true), ms);
    },
    setEdge(on: boolean) {
      edge.hidden = !on;
    },
    update() {
      plate.update(ctx);
      const ps = ctx.state.players[player] as RtPlayer;
      cards.forEach((c, i) => c.update(ps.weapons[i], i === ps.selected, keys[i] ?? String(i + 1), ps.cooldowns ? ps.cooldowns[i] ?? 0 : null, ps.charge ?? 0));
    },
    dispose() {
      offKeys();
      ctrl.dispose();
      window.clearTimeout(bannerTimer);
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
  const mode = createControlsMode(ctx);
  const halves = [createHalf(ctx, 0, mode), createHalf(ctx, 1, mode)];
  const sep = el('div', 'split-sep');
  const clock = el('div', 'match-clock');
  clock.hidden = true;
  const centerBanner = el('div', 'center-banner');
  centerBanner.hidden = true;
  const bigBanner = el('div', 'big-banner');
  bigBanner.hidden = true;
  const commentary = createCommentary();
  const top = el('div', 'hud-top');
  top.append(clock, commentary.root);
  const floaters = createFloaters(ctx);
  root.append(halves[0].root, halves[1].root, sep, top, centerBanner, bigBanner, floaters.root);

  const isAI = (p: PlayerId) => ctx.state.vsAI && p === 1;
  function layout() {
    // Deux humains : écran scindé ; contre l'IA : plein écran, l'IA n'a que son encart.
    root.classList.toggle('split', !ctx.state.vsAI);
    root.classList.toggle('solo', ctx.state.vsAI);
  }

  let centerTimer = 0;
  function showCenterBanner(text: string, cls: string, ms: number) {
    centerBanner.className = `center-banner ${cls}`;
    centerBanner.textContent = text;
    centerBanner.hidden = false;
    replay(centerBanner, 'enter');
    window.clearTimeout(centerTimer);
    centerTimer = window.setTimeout(() => (centerBanner.hidden = true), ms);
  }

  // READY? → 3, 2, 1 → GO! → (combat) → GAME! Émis par les règles ; repli local si elles ne le font pas.
  let bigTimer = 0;
  let lastBannerAt = 0;
  let gameShown = false;
  function showBig(text: string, cls: string, hold: number) {
    lastBannerAt = performance.now();
    bigBanner.className = `big-banner ${cls}`;
    bigBanner.textContent = text;
    bigBanner.hidden = false;
    replay(bigBanner, 'slam');
    window.clearTimeout(bigTimer);
    bigTimer = window.setTimeout(() => {
      bigBanner.classList.add('leave');
      bigTimer = window.setTimeout(() => (bigBanner.hidden = true), durees.decolle);
    }, hold);
  }
  const showBanner = (kind: 'ready' | 'go' | 'game') => {
    if (kind === 'game') gameShown = true;
    if (kind === 'go') fightStart = ctx.loop.time;
    if (kind === 'ready') showBig('READY?', 'ready', durees.bandeau * 6);
    else if (kind === 'go') showBig('GO!', 'go', durees.dramatique);
    else showBig('GAME!', 'game', durees.ko * 2);
  };

  // Chrono du match : 3:00 → 0:00 depuis GO!, puis mort subite.
  let fightStart = -1;
  let lastClock = '';
  let suddenShown = false;

  function commentaryNames(): { name: string; color: string }[] {
    const names: { name: string; color: string }[] = [];
    for (const p of ctx.state.players) {
      const color = p.id === 0 ? 'var(--b-p1-fonce)' : 'var(--b-p2-fonce)';
      if (p.fighter) names.push({ name: p.fighter.name, color });
      for (const wpn of p.weapons) names.push({ name: wpn.name, color });
    }
    return names;
  }

  const bro = [
    { value: 0, ready: false },
    { value: 0, ready: false },
  ];

  const offs = [
    ctx.bus.on('phase:change', ({ to }) => {
      root.hidden = PRE_MATCH.has(to);
    }),
    ctx.bus.on('match:start', () => {
      gameShown = false;
      suddenShown = false;
      fightStart = -1;
      lastClock = '';
      clock.hidden = true;
      layout();
      halves.forEach((h, i) => {
        h.plate.reset();
        h.setEdge(false);
        h.ring.hide();
        bro[i] = { value: 0, ready: false };
        h.plate.setBro(0, false);
      });
      root.hidden = false;
      const startedAt = performance.now();
      window.setTimeout(() => {
        if (lastBannerAt >= startedAt) return; // les règles jouent READY?/GO! elles-mêmes
        showBanner('ready');
        window.setTimeout(() => showBanner('go'), 1200);
      }, 150);
    }),
    ctx.bus.on('match:banner', ({ kind }) => showBanner(kind)),
    ctx.bus.on('match:end', () => {
      if (!gameShown) showBanner('game');
    }),
    ctx.bus.onAny((name, payload) => {
      // Événements du temps réel pas encore dans le contrat partagé : lus par leur nom (plan/PIVOT-TEMPS-REEL.md).
      if ((name as string) === 'countdown') {
        const n = (payload as { n?: number })?.n;
        if (typeof n === 'number' && n > 0) showBig(String(n), 'count', 800);
      }
    }),
    ctx.bus.on('projectile:incoming', ({ target, etaMs, id }) => {
      if (!isAI(target)) halves[target].ring.show(etaMs, id);
    }),
    ctx.bus.on('parry:result', ({ player, grade }) => {
      halves[player].ring.hide();
      if (grade === 'perfect') halves[player].showBanner('PERFECT!', 'perfect', durees.dramatique);
      else if (grade === 'good') halves[player].showBanner('BLOCKED', 'good', durees.dramatique * 0.7);
    }),
    ctx.bus.on('hit', ({ target }) => halves[target].ring.hide()),
    ctx.bus.on('teeter', ({ player, on }) => halves[player].setEdge(on)),
    ctx.bus.on('stock:lost', ({ player, stocksLeft }) => {
      halves[player].setEdge(false);
      const label = stocksLeft <= 0 ? `P${player + 1} — OUT!` : stocksLeft === 1 ? `P${player + 1} — LAST LIFE!` : `P${player + 1} — ${stocksLeft} LIVES LEFT`;
      showCenterBanner(label, `ko p${player + 1}`, durees.ko);
    }),
    ctx.bus.on('bro:gauge', ({ player, value }) => {
      bro[player].value = value;
      halves[player].plate.setBro(value, bro[player].ready);
    }),
    ctx.bus.on('super:ready', ({ player }) => {
      bro[player].ready = true;
      halves[player].plate.setBro(1, true);
    }),
    ctx.bus.on('super:fire', ({ player }) => {
      bro[player] = { value: 0, ready: false };
      halves[player].plate.setBro(0, false);
    }),
    // Lot LVOX : le sous-titre = ce qui est RÉELLEMENT entendu (`voice:line`), animateur seulement.
    ctx.bus.on('voice:line', ({ text, speaker }) => {
      if (speaker !== 'announcer') return;
      commentary.show(text, commentaryNames());
    }),
  ];

  ctx.loop.addSystem(
    'ui-hud',
    () => {
      if (root.hidden) return;
      halves[0].update();
      halves[1].update();
      if (fightStart >= 0) {
        const left = Math.max(0, MATCH_S - (ctx.loop.time - fightStart));
        const txt = left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'SUDDEN DEATH';
        if (txt !== lastClock) {
          lastClock = txt;
          clock.textContent = txt;
          clock.hidden = false;
          clock.classList.toggle('late', left <= 10);
          if (left <= 0 && !suddenShown) {
            suddenShown = true;
            showCenterBanner('SUDDEN DEATH!', 'ko', durees.ko);
          }
        }
      }
    },
    900,
  );

  return {
    root,
    dispose() {
      for (const off of offs) off();
      halves.forEach((h) => h.dispose());
      window.clearTimeout(centerTimer);
      window.clearTimeout(bigTimer);
      commentary.dispose();
      floaters.dispose();
    },
  };
}
