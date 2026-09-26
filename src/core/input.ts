// Commandes réglables par joueur (P1, P2), demandées par Adem : touches PHYSIQUES (`KeyboardEvent.code`, donc
// WASD tombe sur ZQSD d'un clavier AZERTY), sauvegardées dans le navigateur. Tout le code d'entrée (gameplay)
// passe par `matches` / `actionsOf`, toute l'interface (aide à l'écran, écran Settings) par `bindingLabel`.
import type { PlayerId } from './types';

export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'weapon1' | 'weapon2' | 'weapon3' | 'fire' | 'parry';
/** Plusieurs touches possibles par action. */
export type Bindings = Record<Action, string[]>;

/** Ordre et libellés (anglais, affichés dans Settings → Controls). */
export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'up', label: 'Move up' },
  { id: 'down', label: 'Move down' },
  { id: 'left', label: 'Move left' },
  { id: 'right', label: 'Move right' },
  { id: 'jump', label: 'Jump (press twice: double jump)' },
  { id: 'weapon1', label: 'Weapon 1' },
  { id: 'weapon2', label: 'Weapon 2' },
  { id: 'weapon3', label: 'Weapon 3' },
  { id: 'fire', label: 'Charge & fire (hold, release) — mouse click works too' },
  { id: 'parry', label: 'Parry (when the ring closes)' },
];

export const DEFAULT_BINDINGS: [Bindings, Bindings] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'],
    weapon1: ['Digit1'], weapon2: ['Digit2'], weapon3: ['Digit3'], fire: ['KeyF'], parry: ['Space'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ShiftRight'],
    weapon1: ['Digit8', 'Numpad1'], weapon2: ['Digit9', 'Numpad2'], weapon3: ['Digit0', 'Numpad3'], fire: ['KeyL', 'Numpad0'], parry: ['Enter', 'NumpadEnter'] },
];

const STORAGE_KEY = 'broskis.controls.v1';
const clone = (b: Bindings): Bindings => JSON.parse(JSON.stringify(b));

let current: [Bindings, Bindings] = [clone(DEFAULT_BINDINGS[0]), clone(DEFAULT_BINDINGS[1])];
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as [Partial<Bindings>, Partial<Bindings>] | null;
  if (saved) for (const p of [0, 1] as const) current[p] = { ...clone(DEFAULT_BINDINGS[p]), ...saved[p] };
} catch { /* navigateur sans stockage : valeurs par défaut */ }

const listeners = new Set<() => void>();
function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* sans stockage : le réglage vaut pour la session */ }
  for (const fn of listeners) fn();
}

export function getBindings(player: PlayerId): Readonly<Bindings> { return current[player]; }

/** Remplace les touches d'une action (la 1re est la principale, affichée en premier). */
export function setBinding(player: PlayerId, action: Action, codes: string[]): void {
  current[player] = { ...current[player], [action]: codes.filter(Boolean) };
  save();
}

export function resetBindings(player?: PlayerId): void {
  for (const p of player === undefined ? [0, 1] as const : [player]) current[p] = clone(DEFAULT_BINDINGS[p]);
  save();
}

/** Prévient l'interface (aide à l'écran) quand un joueur change ses touches. Renvoie la désinscription. */
export function onBindingsChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

export function matches(code: string, player: PlayerId, action: Action): boolean {
  return current[player][action].includes(code);
}

/** Actions d'un joueur déclenchées par une touche (une touche peut servir à 2 actions de phases différentes, ex. saut et parade). */
export function actionsOf(code: string, player: PlayerId): Action[] {
  return ACTIONS.map((a) => a.id).filter((a) => current[player][a].includes(code));
}

// Libellés : la vraie lettre du clavier du joueur (AZERTY : KeyW s'affiche « Z ») quand le navigateur la donne.
let layout: Map<string, string> | null = null;
const nav = navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } };
nav.keyboard?.getLayoutMap?.().then((m) => { layout = m; for (const fn of listeners) fn(); }).catch(() => {});

const NAMES: Record<string, string> = {
  Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'ALT GR', Tab: 'TAB', Backspace: '⌫',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'ESC',
};

export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  const fromLayout = layout?.get(code);
  if (fromLayout) return fromLayout.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  return code;
}

/** Libellé de la touche principale d'une action (ex. « Z » pour avancer sur AZERTY). */
export function bindingLabel(player: PlayerId, action: Action): string {
  const codes = current[player][action];
  return codes.length ? keyLabel(codes[0]) : '—';
}

/** Les 4 touches de déplacement, pour l'aide à l'écran (ex. « ZQSD » ou « ↑←↓→ »). */
export function moveLabel(player: PlayerId): string {
  return (['up', 'left', 'down', 'right'] as const).map((a) => bindingLabel(player, a)).join('');
}
