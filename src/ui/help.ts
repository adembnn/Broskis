// Guidage du temps réel (lot LUX, pivot 15h25) : dans CHAQUE moitié d'écran, une carte de commandes discrète avec les
// VRAIES touches du joueur (commandes réglables, keys.ts) — Move · Jump ×2 · Fire (hold = charge) · Block · Weapons.
// Au 1er match elle est grande pendant le compte à rebours et les 10 premières secondes, puis se réduit à une ligne
// (H pour la déplier). Et l'anneau de parade : quand un projectile arrive sur un joueur (`projectile:incoming`,
// ~400 ms avant l'impact), un anneau se referme dans SA vue seulement, avec sa touche de blocage au centre.
import * as THREE from 'three';
import type { Ctx, PlayerId } from '../core/types';
import { el } from './dom';
import { fireKey, jumpKey, kbd, keyOf, moveKeys, onBindingsChange, parryKey, weaponKeys } from './keys';

const COMPACT_KEY = 'broskis:controls-compact';
/** Carte grande pendant le compte à rebours + ces secondes de combat, au tout premier match. */
const BIG_FIRST_S = 10;
export const TOGGLE_CODE = 'KeyH';

function loadCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}
function saveCompact(): void {
  try {
    localStorage.setItem(COMPACT_KEY, '1');
  } catch {
    /* sans stockage : la carte redeviendra grande au prochain chargement */
  }
}

/** État partagé des 2 cartes : grande ou compacte (H bascule les deux). */
export interface ControlsMode {
  big: boolean;
  firstMatch: boolean;
  listeners: Set<() => void>;
  set(big: boolean): void;
}

export function createControlsMode(ctx: Ctx): ControlsMode {
  const mode: ControlsMode = {
    big: !loadCompact(),
    firstMatch: !loadCompact(),
    listeners: new Set(),
    set(big) {
      if (mode.big === big) return;
      mode.big = big;
      for (const fn of mode.listeners) fn();
    },
  };
  let fightStart = -1;
  ctx.bus.on('match:start', () => {
    fightStart = -1;
    if (mode.firstMatch) mode.set(true);
  });
  ctx.bus.on('match:banner', ({ kind }) => {
    if (kind === 'go') fightStart = ctx.loop.realTime;
  });
  ctx.bus.on('match:end', () => {
    if (mode.firstMatch) saveCompact();
    mode.firstMatch = false;
  });
  // 1er match : la carte se réduit d'elle-même 10 s après GO!
  ctx.loop.addSystem('ui-controls-shrink', () => {
    if (mode.firstMatch && mode.big && fightStart >= 0 && ctx.loop.realTime - fightStart > BIG_FIRST_S) {
      mode.firstMatch = false;
      mode.set(false);
    }
  }, 960);
  window.addEventListener('keydown', (e) => {
    if (e.code !== TOGGLE_CODE || e.repeat) return;
    const phase = ctx.state.phase as string;
    if (phase === 'title' || phase === 'fighter-select' || phase === 'arsenal' || phase === 'reveal' || phase === 'map-select') return;
    mode.firstMatch = false;
    mode.set(!mode.big);
  });
  return mode;
}

export interface ControlsCard {
  root: HTMLDivElement;
  dispose(): void;
}

/** Carte de commandes d'UN joueur, avec ses touches réelles. */
export function createControlsCard(player: PlayerId, mode: ControlsMode): ControlsCard {
  const root = el('div', `ctrl p${player + 1}`);
  const item = (keys: string[], label: string, cls = '') => {
    const it = el('span', `ctrl-item${cls ? ` ${cls}` : ''}`);
    const k = el('span', 'ctrl-keys');
    for (const key of keys) k.append(kbd(key));
    it.append(k, el('span', 'ctrl-label', label));
    return it;
  };
  // perf (LPERF) : le DOM n'est construit qu'au départ et quand les touches changent (Settings). La bascule
  // grande / compacte (H, ou 10 s après GO!) ne touche que la classe et 3 textes : reconstruire toute la carte
  // en plein combat coûtait jusqu'à 150 ms (mesuré, tools/perf/aide.mjs).
  const labels: { el: HTMLElement; big: string; small: string }[] = [];
  const label = (big: string, small: string) => {
    const it = { el: el('span', 'ctrl-label', mode.big ? big : small), big, small };
    labels.push(it);
    return it.el;
  };
  function build() {
    labels.length = 0;
    const fire = item([fireKey(player)], '');
    fire.lastElementChild!.replaceWith(label('Fire · hold = charge', 'Fire'));
    const parry = item([parryKey(player)], '');
    parry.lastElementChild!.replaceWith(label('Block · tap as the ring closes', 'Block'));
    const hint = el('span', 'ctrl-hint');
    hint.append(kbd('H'), label('hide', 'help'));
    root.replaceChildren(item(moveKeys(player), 'Move'), item([jumpKey(player)], 'Jump ×2'), fire, parry, item(weaponKeys(player), 'Weapons'), hint);
    toggle();
  }
  function toggle() {
    root.classList.toggle('big', mode.big);
    for (const l of labels) l.el.textContent = mode.big ? l.big : l.small;
  }
  build();
  mode.listeners.add(toggle);
  const offBindings = onBindingsChange(build);
  return {
    root,
    dispose() {
      mode.listeners.delete(toggle);
      offBindings();
    },
  };
}

// ---------- Anneau de parade dans la vue du joueur visé ----------
/** Caméra de la vue d'un joueur : `ctx.three.cameras[player]` (lot RTVIEW, écran scindé). Absente : repli au centre
 *  de sa moitié, là où sa caméra de dos place son perso. */
function viewCamera(ctx: Ctx, player: PlayerId): THREE.Camera | null {
  const cams = (ctx.three as unknown as { cameras?: THREE.Camera[] }).cameras;
  return cams?.[player] ?? null;
}
const tmpV = new THREE.Vector3();

export interface ParryRing {
  root: HTMLDivElement;
  show(etaMs: number, projectileId: string): void;
  hide(): void;
}

/** Anneau qui se referme en `etaMs` au-dessus du perso visé, sa touche de blocage au centre. `half` = sa moitié. */
export function createParryRing(ctx: Ctx, player: PlayerId): ParryRing {
  const root = el('div', `pring p${player + 1}`);
  root.hidden = true;
  const ring = el('span', 'pring-ring');
  const key = el('span', 'pring-key');
  root.append(ring, key);
  let timer = 0;
  return {
    root,
    show(etaMs) {
      key.replaceChildren(kbd(keyOf(player, 'parry'), 'huge'));
      const cam = viewCamera(ctx, player);
      const half = root.parentElement?.getBoundingClientRect();
      const p = ctx.state.players[player].pos;
      // Projection dans SA vue (la moitié qui porte ce calque), au niveau du torse de son perso.
      if (cam && half) {
        tmpV.set(p[0], p[1] + 1, p[2]).project(cam);
        root.style.left = `${(tmpV.x * 0.5 + 0.5) * half.width}px`;
        root.style.top = `${(-tmpV.y * 0.5 + 0.5) * half.height}px`;
      } else {
        root.style.left = '50%';
        root.style.top = '58%';
      }
      ring.style.animation = 'none';
      void ring.offsetWidth;
      ring.style.animation = '';
      ring.style.animationDuration = `${Math.max(120, etaMs)}ms`;
      root.hidden = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (root.hidden = true), Math.max(120, etaMs) + 260);
    },
    hide() {
      window.clearTimeout(timer);
      root.hidden = true;
    },
  };
}
