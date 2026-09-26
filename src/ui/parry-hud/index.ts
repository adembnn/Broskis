import type { Ctx } from '../../core/types';
import { el } from '../dom';
import { ui, palette } from '../../art/tokens';

export function installParryHud(ctx: Ctx, root: HTMLElement): void {
  const container = el('div', 'parry-hud-layer');
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.overflow = 'hidden';
  root.appendChild(container);

  const texts: HTMLElement[] = [];
  let successes = 0;
  let misses = 0;

  // Jauges BRO
  const gauges = [
    el('div', 'bro-gauge p1'),
    el('div', 'bro-gauge p2')
  ];
  
  gauges.forEach((g, i) => {
    g.style.position = 'absolute';
    g.style.top = '20px';
    g.style.width = '200px';
    g.style.height = '20px';
    g.style.backgroundColor = ui.carton;
    g.style.border = `${ui.trait}px solid ${ui.encre}`;
    g.style.borderRadius = `${ui.rayon}px`;
    if (i === 0) g.style.left = '20px';
    else g.style.right = '20px';
    
    const fill = el('div', 'fill');
    fill.style.width = '0%';
    fill.style.height = '100%';
    fill.style.backgroundColor = ui.alerte;
    fill.style.transition = 'width 0.2s ease-out';
    g.appendChild(fill);
    
    const text = el('div', 'super-text');
    text.textContent = 'SUPER READY!';
    text.style.display = 'none';
    text.style.position = 'absolute';
    text.style.top = '100%';
    text.style.left = '0';
    text.style.color = ui.alerte;
    text.style.fontFamily = 'Lilita One, sans-serif';
    text.style.textShadow = `2px 2px 0 ${ui.encre}, -2px -2px 0 ${ui.encre}, 2px -2px 0 ${ui.encre}, -2px 2px 0 ${ui.encre}`;
    g.appendChild(text);
    
    container.appendChild(g);
  });

  const createVinylText = (text: string, color: string = palette.lumiere) => {
    const elNode = el('div', 'parry-text');
    elNode.textContent = text;
    elNode.style.position = 'absolute';
    elNode.style.left = '50%';
    elNode.style.top = '40%';
    elNode.style.transform = 'translate(-50%, -50%)';
    elNode.style.fontFamily = 'Lilita One, sans-serif';
    elNode.style.fontSize = '48px';
    elNode.style.color = color;
    elNode.style.textShadow = `3px 3px 0 ${ui.encre}, -3px -3px 0 ${ui.encre}, 3px -3px 0 ${ui.encre}, -3px 3px 0 ${ui.encre}`;
    elNode.style.padding = `${ui.marge}px`;
    elNode.style.backgroundColor = ui.vinyle;
    elNode.style.borderRadius = `${ui.rayon}px`;
    elNode.style.border = `${ui.trait}px solid ${ui.encre}`;
    elNode.style.animation = 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    return elNode;
  };

  const showFloatingText = (text: string, color?: string) => {
    const node = createVinylText(text, color);
    container.appendChild(node);
    texts.push(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translate(-50%, -100%)';
      node.style.transition = 'all 0.3s ease-in';
      setTimeout(() => {
        if (node.parentElement) node.parentElement.removeChild(node);
        const idx = texts.indexOf(node);
        if (idx !== -1) texts.splice(idx, 1);
      }, 300);
    }, 1000);
  };

  const helperText = el('div', 'helper-text');
  helperText.textContent = 'PRESS SPACE TO PARRY';
  helperText.style.position = 'absolute';
  helperText.style.bottom = '20%';
  helperText.style.left = '50%';
  helperText.style.transform = 'translateX(-50%)';
  helperText.style.fontFamily = 'Nunito, sans-serif';
  helperText.style.fontSize = '24px';
  helperText.style.color = ui.vinyle;
  helperText.style.textShadow = `1px 1px 0 ${ui.encre}, -1px -1px 0 ${ui.encre}, 1px -1px 0 ${ui.encre}, -1px 1px 0 ${ui.encre}`;
  helperText.style.display = 'none';
  container.appendChild(helperText);

  ctx.bus.on('parry:cue', ({ defender }) => {
    const key = defender === 0 ? 'SPACE' : 'ENTER';
    showFloatingText(`!! ${key} !!`, palette.danger);
    if (successes < 5 || misses >= 2) {
      helperText.textContent = `PRESS ${key} TO PARRY`;
      helperText.style.display = 'block';
    }
  });

  ctx.bus.on('parry:result', ({ grade, deltaMs }) => {
    helperText.style.display = 'none';
    if (grade === 'perfect') {
      showFloatingText('PERFECT!', palette.lumiere);
      successes++;
      misses = 0;
    } else if (grade === 'good') {
      showFloatingText('GOOD', palette.joueur);
      successes++;
      misses = 0;
    } else {
      if (deltaMs < 0) {
        showFloatingText(`TOO EARLY ${deltaMs}ms`, palette.danger);
      } else {
        showFloatingText(`TOO LATE`, palette.danger);
      }
      misses++;
    }
  });

  ctx.bus.on('parry:streak', ({ multiplier }) => {
    if (multiplier > 1) {
      showFloatingText(`x${multiplier}`, palette.lumiere);
    }
  });

  ctx.bus.on('bro:gauge', ({ player, value }) => {
    const fill = gauges[player].querySelector('.fill') as HTMLElement;
    if (fill) fill.style.width = `${Math.min(100, value * 100)}%`;
  });

  ctx.bus.on('super:ready', ({ player }) => {
    const text = gauges[player].querySelector('.super-text') as HTMLElement;
    if (text) text.style.display = 'block';
  });
}
