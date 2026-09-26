// Entrées temps réel des 2 joueurs EN MÊME TEMPS : clavier (touches réglables de chacun, src/core/input.ts,
// relues à chaque événement), manettes (Gamepad API : la 1re à P1, la 2e à P2) et hook de test
// `gameHooks.input(player, action, down)`. Chaque image, `pollInputs` rend pour chaque joueur : direction
// (stick ou touches), actions maintenues, fronts « appuyé » / « relâché » depuis l'image précédente
// (un appui plus court qu'une image n'est jamais perdu) et l'heure exacte de l'appui (parade parfaite).
import type { InputAction, PlayerId } from '../core/types';
import { actionsOf, getBindings } from '../core/input';

export interface PlayerInput {
  /** x = droite, y = avant (relatif à la vue du joueur), longueur ≤ 1. */
  move: [number, number];
  held: Set<InputAction>;
  pressed: Set<InputAction>;
  released: Set<InputAction>;
  /** Heure (ms, horloge performance.now) du dernier appui de chaque action. */
  downAt: Map<InputAction, number>;
}

const ACTIONS: readonly InputAction[] = ['up', 'down', 'left', 'right', 'jump', 'weapon1', 'weapon2', 'weapon3', 'fire', 'parry'];
const keysDown = new Set<string>();
const hookHeld: [Set<InputAction>, Set<InputAction>] = [new Set(), new Set()];
const pressedSince: [Set<InputAction>, Set<InputAction>] = [new Set(), new Set()];
const releasedSince: [Set<InputAction>, Set<InputAction>] = [new Set(), new Set()];
const downAt: [Map<InputAction, number>, Map<InputAction, number>] = [new Map(), new Map()];
const prevHeld: [Set<InputAction>, Set<InputAction>] = [new Set(), new Set()];

// Manette standard : A = saut, X ou RT = tir, RB = blocage, croix gauche / haut / droite = armes 1 / 2 / 3.
const PAD_BUTTONS: [number, InputAction][] = [[0, 'jump'], [2, 'fire'], [7, 'fire'], [5, 'parry'], [14, 'weapon1'], [12, 'weapon2'], [15, 'weapon3']];
const DEADZONE = 0.2;

function pads(): (Gamepad | null)[] {
  try {
    return [...(navigator.getGamepads?.() ?? [])].filter((g): g is Gamepad => !!g && g.connected);
  } catch { return []; }
}

function keyboardHeld(player: PlayerId): Set<InputAction> {
  const b = getBindings(player);
  const out = new Set<InputAction>();
  for (const a of ACTIONS) if (b[a].some((code) => keysDown.has(code))) out.add(a);
  return out;
}

/** Appelée une fois par image (système « gameplay-input ») : l'état d'entrée des 2 joueurs. */
export function pollInputs(): [PlayerInput, PlayerInput] {
  const connected = pads();
  const now = performance.now();
  return ([0, 1] as const).map((p) => {
    const held = keyboardHeld(p);
    for (const a of hookHeld[p]) held.add(a);
    let mx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    let my = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    const pad = connected[p];
    if (pad) {
      for (const [i, a] of PAD_BUTTONS) if (pad.buttons[i]?.pressed) held.add(a);
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > DEADZONE) { mx += ax; my -= ay; }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const pressed = new Set<InputAction>(pressedSince[p]);
    const released = new Set<InputAction>(releasedSince[p]);
    // Appui vu seulement ici (manette) : horodaté maintenant ; au clavier, l'heure exacte vient de l'événement.
    for (const a of held) if (!prevHeld[p].has(a)) { pressed.add(a); if (!pressedSince[p].has(a)) downAt[p].set(a, now); }
    for (const a of prevHeld[p]) if (!held.has(a)) released.add(a);
    pressedSince[p].clear();
    releasedSince[p].clear();
    prevHeld[p] = new Set(held);
    return { move: [mx, my] as [number, number], held, pressed, released, downAt: downAt[p] };
  }) as [PlayerInput, PlayerInput];
}

/** Simule une touche (tests, régie) : même chemin que le clavier. */
export function setHookInput(player: PlayerId, action: InputAction, down: boolean): void {
  if (down) {
    if (!hookHeld[player].has(action)) { pressedSince[player].add(action); downAt[player].set(action, performance.now()); }
    hookHeld[player].add(action);
  } else if (hookHeld[player].delete(action)) {
    releasedSince[player].add(action);
  }
}

export function clearInputs(): void {
  keysDown.clear();
  for (const p of [0, 1] as const) {
    hookHeld[p].clear(); pressedSince[p].clear(); releasedSince[p].clear(); prevHeld[p].clear();
  }
}

export function installControls(): void {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    let used = false;
    for (const p of [0, 1] as const) {
      for (const a of actionsOf(e.code, p)) {
        used = true;
        pressedSince[p].add(a);
        downAt[p].set(a, e.timeStamp); // même horloge que performance.now()
      }
    }
    if (used) { keysDown.add(e.code); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (!keysDown.delete(e.code)) return;
    for (const p of [0, 1] as const) for (const a of actionsOf(e.code, p)) releasedSince[p].add(a);
  });
  window.addEventListener('blur', () => clearInputs()); // change de fenêtre = relâche tout
}
