import * as THREE from 'three';
import { el } from '../../ui/dom';
import type { Ctx, PlayerId } from '../../core/types';
import { playBark } from '../../audio/barks';

export function installTauntBubble(_ctx: Ctx) {
  // Rien de spécial à l'installation.
}

export function showTauntBubble(ctx: Ctx, aiId: PlayerId, text: string) {
  const root = ctx.three.uiRoot;
  const player = ctx.state.players[aiId];
  
  // Bulle HTML style "Vinyle" (style ui)
  const bubble = el('div', 'taunt-bubble');
  bubble.textContent = text;
  
  root.appendChild(bubble);
  let timeAlive = 0;
  
  ctx.loop.tick((dt) => {
    timeAlive += dt;
    if (timeAlive >= 2.5) {
      bubble.remove();
      return false; // Stop the tick
    }
    
    const pos3d = player.pos;
    const v = new THREE.Vector3(pos3d[0], pos3d[1] + 2.5, pos3d[2]);
    v.project(ctx.three.camera);
    const x = (v.x * .5 + .5) * window.innerWidth;
    const y = (v.y * -.5 + .5) * window.innerHeight;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    bubble.style.transform = `translate(-50%, -100%)`;
    
    return true; // Keep ticking
  });

  // Lot LVOX (une seule voix) : avant, ceci émettait `commentary:line`, ce qui faisait passer la provocation
  // de l'IA pour de l'animateur (mauvaise voix, mauvaise carte HUD). Le son vient maintenant d'un bark du
  // perso IA lui-même (voix pré-générée, src/audio/barks.ts) ; le texte Gemini reste affiché dans la bulle
  // ci-dessus, seule la source du SON a changé.
  playBark(ctx, aiId, 'taunt_turn');
}
