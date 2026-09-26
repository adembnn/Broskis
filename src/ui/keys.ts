// Touches affichées à l'écran, dessinées comme des touches de clavier (<kbd class="key">). Les libellés viennent
// TOUS des commandes réglables du joueur (src/core/input.ts : bindingLabel, AZERTY compris) : aucune touche de jeu
// écrite en dur dans l'interface. Qui affiche des touches s'abonne à onBindingsChange pour se redessiner.
import { bindingLabel } from '../core/input';
import type { Action } from '../core/input';
import type { PlayerId } from '../core/types';
import { el } from './dom';

export { onBindingsChange } from '../core/input';

export const keyOf = (player: PlayerId, action: Action): string => bindingLabel(player, action);
export const jumpKey = (player: PlayerId): string => bindingLabel(player, 'jump');
export const fireKey = (player: PlayerId): string => bindingLabel(player, 'fire');
export const parryKey = (player: PlayerId): string => bindingLabel(player, 'parry');
/** Haut, gauche, bas, droite (ex. Z Q S D, ou ↑ ← ↓ →). */
export const moveKeys = (player: PlayerId): string[] => (['up', 'left', 'down', 'right'] as const).map((a) => bindingLabel(player, a));
export const weaponKeys = (player: PlayerId): string[] => (['weapon1', 'weapon2', 'weapon3'] as const).map((a) => bindingLabel(player, a));

/** Une touche de clavier dessinée ; élargie pour SPACE/ENTER/SHIFT/CLICK. */
export function kbd(label: string, extra = ''): HTMLElement {
  const wide = label.length > 2;
  return el('kbd', `key${wide ? ' wide' : ''}${extra ? ` ${extra}` : ''}`, label);
}

/** Petite ligne « touches + texte » : parts = chaînes (texte, '·' = séparateur) ou tableaux de touches. */
export function keyLine(parts: (string | string[])[], cls = ''): HTMLSpanElement {
  const line = el('span', `keyline ${cls}`.trim());
  for (const part of parts) {
    if (Array.isArray(part)) {
      const group = el('span', 'keygroup');
      for (const k of part) group.append(kbd(k));
      line.append(group);
    } else if (part === '·') {
      line.append(el('span', 'keysep', '·'));
    } else {
      line.append(el('span', 'keytext', part));
    }
  }
  return line;
}
