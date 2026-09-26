// Nombres flottants (dégâts) projetés à une position monde, façon bagarre-de-taverne/src/core/ui.js (floaterAt).
import * as THREE from 'three';
import type { Ctx, Vec3 } from '../core/types';
import { worldToScreen } from './dom';
import { LOCAL_TOKENS } from './theme';

export interface Floaters {
  root: HTMLDivElement;
  spawnWorld(pos: Vec3, text: string, cls?: string): void;
  dispose(): void;
}

export function createFloaters(ctx: Ctx): Floaters {
  const root = document.createElement('div');
  root.className = 'floater-layer';
  const tmp = new THREE.Vector3();
  const timers = new Set<number>();

  function spawnAt(x: number, y: number, text: string, cls: string) {
    const node = document.createElement('div');
    node.className = `floater ${cls}`.trim();
    node.textContent = text;
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    root.append(node);
    const id = window.setTimeout(
      () => {
        node.remove();
        timers.delete(id);
      },
      LOCAL_TOKENS.floaterMs + 100,
    );
    timers.add(id);
  }

  return {
    root,
    spawnWorld(pos, text, cls = '') {
      const s = worldToScreen(ctx.three.camera, pos, tmp);
      if (s.behind) return;
      spawnAt(s.x, s.y, text, cls);
    },
    dispose() {
      for (const id of timers) window.clearTimeout(id);
      root.remove();
    },
  };
}
