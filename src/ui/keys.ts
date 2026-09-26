// Touches affichées à l'écran, dessinées comme des touches de clavier (<kbd class="key">). Les libellés sont LUS
// dans les réglages du gameplay (src/gameplay/tuning.ts) : si le lot règles change une touche, l'aide ne ment pas.
// Lecture défensive (`as` + repli) : un export renommé ailleurs ne doit pas casser l'interface.
import * as tuning from '../gameplay/tuning';
import type { PlayerId } from '../core/types';
import { el } from './dom';

const T = tuning as unknown as Record<string, unknown>;

const LABELS: Record<string, string> = {
  Space: 'SPACE',
  Enter: 'ENTER',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  KeyF: 'F',
};

/** 'KeyW' → 'W', 'Digit1' → '1', 'Space' → 'SPACE'. */
export function keyLabel(code: string): string {
  if (LABELS[code]) return LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}

export function jumpKey(): string {
  return keyLabel(typeof T.JUMP_KEY === 'string' ? T.JUMP_KEY : 'ShiftLeft');
}

export function parryKey(player: PlayerId): string {
  const codes = T.PARRY_KEY_CODE as Record<number, string> | undefined;
  return keyLabel(codes?.[player] ?? (player === 0 ? 'Space' : 'Enter'));
}

/** Une touche de clavier dessinée ; `wide` pour SPACE/ENTER/SHIFT/CLICK. */
export function kbd(label: string, extra = ''): HTMLElement {
  const wide = label.length > 2;
  return el('kbd', `key${wide ? ' wide' : ''}${extra ? ` ${extra}` : ''}`, label);
}

/** Petite ligne « touches + texte » : parts = chaînes (texte) ou tableaux de touches. */
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
