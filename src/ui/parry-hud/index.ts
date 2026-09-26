import * as THREE from 'three';
import type { Ctx, PlayerId } from '../../core/types';
import { PARRY_KEY_CODE } from '../../gameplay/tuning';

export function installParryHud(ctx: Ctx, root: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.className = 'parry-hud-overlay';
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '100'; // above others
  root.appendChild(overlay);

  const cues: Map<PlayerId, HTMLDivElement> = new Map();
  const v = new THREE.Vector3();

  function project(pos: [number, number, number], offsetY: number, el: HTMLElement) {
    v.set(pos[0], pos[1] + offsetY, pos[2]);
    v.project(ctx.three.camera);
    if (v.z > 1) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (v.y * -0.5 + 0.5) * window.innerHeight;
    el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }

  // BRO Gauge per player
  const broBars: HTMLDivElement[] = [];
  for (let i = 0; i < 2; i++) {
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    wrap.style.bottom = '100px';
    wrap.style[i === 0 ? 'left' : 'right'] = '20px';
    wrap.style.width = '180px';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.alignItems = i === 0 ? 'flex-start' : 'flex-end';

    const bar = document.createElement('div');
    bar.style.width = '100%';
    bar.style.height = '18px';
    bar.style.border = 'var(--b-trait) solid var(--b-encre)';
    bar.style.backgroundColor = 'var(--b-carton)';
    bar.style.borderRadius = 'var(--b-rayon)';
    bar.style.boxShadow = 'var(--b-sticker-shadow)';
    bar.style.overflow = 'hidden';
    bar.style.display = 'flex';
    
    const fill = document.createElement('div');
    fill.style.width = '0%';
    fill.style.height = '100%';
    fill.style.backgroundColor = 'var(--b-alerte)';
    fill.style.transition = 'width 0.2s';
    bar.appendChild(fill);
    
    const text = document.createElement('div');
    text.className = 'stroke';
    text.style.fontSize = '18px';
    text.innerText = 'BRO';
    
    wrap.appendChild(bar);
    wrap.appendChild(text);
    overlay.appendChild(wrap);
    broBars.push(wrap);
  }

  let streakCount = 0;
  let parrySuccesses = 0;
  let parryMisses = 0;
  let showHelper = true;

  ctx.bus.on('bro:gauge', ({ player, value }) => {
    const bar = broBars[player].children[0] as HTMLElement;
    const fill = bar.children[0] as HTMLElement;
    fill.style.width = `${Math.min(100, Math.max(0, value * 100))}%`;
  });

  ctx.bus.on('super:ready', ({ player }) => {
    const text = broBars[player].children[1] as HTMLElement;
    text.innerText = 'SUPER READY!';
    text.style.color = 'var(--b-lumiere)';
  });

  ctx.bus.on('parry:streak', ({ streak }) => {
    streakCount = streak;
  });

  ctx.bus.on('parry:cue', ({ defender }) => {
    let el = cues.get(defender);
    if (!el) {
      el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.textAlign = 'center';
      overlay.appendChild(el);
      cues.set(defender, el);
    }
    
    const key = PARRY_KEY_CODE[defender] === 'Space' ? 'SPACE' : 'ENTER';
    
    el.innerHTML = `
      <div class="stroke" style="font-size: 40px; color: var(--b-alerte);">!!</div>
      ${showHelper ? `<div style="font-family: var(--b-body); font-weight: 800; font-size: 14px; background: var(--b-vinyle); border: var(--b-trait) solid var(--b-encre); border-radius: var(--b-rayon); padding: 4px 10px; color: var(--b-encre); margin-top: -5px; box-shadow: var(--b-sticker-shadow);">PRESS ${key}</div>` : ''}
    `;
    el.style.display = 'block';
  });

  ctx.bus.on('parry:result', ({ player, grade, deltaMs }) => {
    let el = cues.get(player);
    if (!el) return;
    
    let text = '';
    let color = 'white';
    
    if (grade === 'perfect') {
      text = streakCount > 1 ? `PERFECT! ×${streakCount}` : 'PERFECT!';
      color = 'var(--b-alerte)';
      parrySuccesses++;
      if (parrySuccesses >= 5) showHelper = false;
    } else if (grade === 'good') {
      text = 'GOOD';
      color = '#A3E4D7';
      parrySuccesses++;
      if (parrySuccesses >= 5) showHelper = false;
    } else {
      parrySuccesses = 0;
      parryMisses++;
      if (parryMisses >= 2) showHelper = true;
      if (Math.abs(deltaMs) < 20 && deltaMs >= 0) {
        text = 'TOO LATE';
      } else if (deltaMs < 0) {
        text = `TOO EARLY ${Math.round(deltaMs)} ms`;
      } else {
        text = `TOO LATE +${Math.round(deltaMs)} ms`;
      }
      color = 'var(--b-p1-fonce)';
    }

    el.innerHTML = `
      <div class="stroke" style="font-size: 32px; color: ${color}; transform: rotate(calc(var(--b-inclinaison) * -2)); background: var(--b-papier); border: var(--b-trait) solid var(--b-encre); border-radius: var(--b-rayon); padding: 4px 12px; box-shadow: var(--b-sticker-shadow);">
        ${text}
      </div>
    `;

    setTimeout(() => {
      if (el) el.style.display = 'none';
    }, 1500);
  });

  ctx.loop.addSystem('parry-hud-update', () => {
    for (const [player, el] of cues.entries()) {
      if (el.style.display !== 'none') {
        const pos = ctx.state.players[player].pos;
        project(pos, 2.0, el);
      }
    }
  }, 1000);
}
