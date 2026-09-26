// Petits utilitaires DOM partagés par tous les écrans du lot LU. Aucune valeur visuelle ici : seulement de la
// construction d'éléments ; les couleurs/tailles vivent dans theme.ts (LOCAL_TOKENS) ou en CSS (classes b-*).
import type * as THREE from 'three';
import type { Vec3 } from '../core/types';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function button(text: string, cls = 'b-btn', onClick?: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Overlay modal PENDANT le match (voile assombri sur la scène 3D) : SNAP TIME! uniquement. */
export function overlay(cardCls = ''): { root: HTMLDivElement; card: HTMLDivElement } {
  const root = el('div', 'b-overlay');
  const card = el('div', `b-panel b-card ${cardCls}`.trim());
  root.append(card);
  return { root, card };
}

/** Écran de menu (titre, perso, arsenal, présentation, map, fin) : fond carton plein écran, pas de voile. */
export function menuScreen(cardCls = ''): { root: HTMLDivElement; card: HTMLDivElement } {
  const root = el('div', 'b-menu');
  const card = el('div', `b-panel b-card ${cardCls}`.trim());
  root.append(card);
  return { root, card };
}

/** "12s" — le chrono du jeu affiche des secondes entières, jamais de décimales. */
export function fmtSeconds(n: number): string {
  return `${Math.max(0, Math.ceil(n))}s`;
}

/** Nombre en police d'affichage avec contour (dégâts, chronos, scores). */
export function strokeNum(text: string, cls = ''): HTMLSpanElement {
  return el('span', `stroke num ${cls}`.trim(), text);
}

export interface Bar {
  root: HTMLDivElement;
  /** k dans [0,1]. La barre fantôme (hearth) suit avec 300 ms de retard (CSS), sauf onEnd (montée en soin). */
  set(k: number): void;
}

/** Barre segmentée (1 segment ~10%) avec barre fantôme qui rattrape la vraie valeur. `kind` = 'hp' | 'mini'. */
export function makeBar(kind: 'hp' | 'mini', teamCls = ''): Bar {
  const root = el('div', `b-bar ${kind} ${teamCls}`.trim());
  const ghost = el('s');
  const fill = el('i');
  root.append(ghost, fill);
  return {
    root,
    set(k) {
      const v = Math.max(0, Math.min(1, k));
      fill.style.transform = `scaleX(${v})`;
      ghost.style.transform = `scaleX(${v})`;
    },
  };
}

/** Ligne étiquette + barre mini, pour les 3 stats d'un perso ou d'une arme (HP/Power/Agility, ou a/b/c nommées). */
export function statRow(label: string, value: number, max: number): HTMLDivElement {
  const row = el('div', 'stat-row');
  const top = el('div', 'stat-row-top');
  top.append(el('span', 'stat-label', label), el('span', 'num stat-value', String(value)));
  const bar = makeBar('mini');
  bar.set(value / max);
  row.append(top, bar.root);
  return row;
}

/** Projection monde → écran (pixels), pour poser une bulle/un nombre flottant au-dessus d'un combattant. */
export function worldToScreen(camera: THREE.Camera, pos: Vec3, tmp: THREE.Vector3): { x: number; y: number; behind: boolean } {
  tmp.set(pos[0], pos[1], pos[2]).project(camera);
  return {
    x: (tmp.x * 0.5 + 0.5) * window.innerWidth,
    y: (-tmp.y * 0.5 + 0.5) * window.innerHeight,
    behind: tmp.z > 1,
  };
}
