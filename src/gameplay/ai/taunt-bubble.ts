// Provocation du bot : bulle au-dessus de sa tête (texte de Gemini, posture en tête) + bark de voix de son rôle
// (voix pré-générée, src/audio/barks.ts). Jamais `commentary:line` : ce n'est pas l'animateur (lot LVOX).
import * as THREE from 'three';
import { playBark } from '../../audio/barks';
import type { Ctx, PlayerId } from '../../core/types';
import { el } from '../../ui/dom';

const LIFE_S = 2.8;
let current: HTMLElement | null = null;
let styled = false;

/** Petite étiquette de posture dans la bulle (couleurs et polices du thème, aucune valeur en dur). */
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = '.taunt-bubble .taunt-tag{font:400 .72em/1 var(--b-display);letter-spacing:.06em;color:var(--b-p2-fonce);margin-right:.4em}';
  document.head.append(s);
}

export function showTauntBubble(ctx: Ctx, aiId: PlayerId, text: string, tag?: string): void {
  ensureStyle();
  current?.remove();
  const bubble = el('div', 'taunt-bubble');
  if (tag) bubble.append(el('span', 'taunt-tag', tag.toUpperCase()));
  bubble.append(document.createTextNode(text));
  bubble.style.visibility = 'hidden';
  ctx.three.uiRoot.appendChild(bubble);
  current = bubble;
  const v = new THREE.Vector3();
  let alive = 0;
  ctx.loop.tick((dt) => {
    alive += dt;
    if (alive >= LIFE_S || current !== bubble || ctx.state.phase !== 'fight') {
      bubble.remove();
      if (current === bubble) current = null;
      return false;
    }
    const p = ctx.state.players[aiId].pos;
    v.set(p[0], p[1] + 2.4, p[2]).project(ctx.three.camera);
    const behind = v.z > 1;
    bubble.style.visibility = behind ? 'hidden' : 'visible';
    bubble.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    bubble.style.top = `${(v.y * -0.5 + 0.5) * window.innerHeight}px`;
    bubble.style.transform = 'translate(-50%, -100%)';
    return true;
  });
  playBark(ctx, aiId, 'taunt_turn');
}
