// Aide contextuelle permanente (lot LUX) : une ligne de touches au-dessus de la barre d'armes, qui change avec la
// phase (déplacement → visée → charge), l'invite géante de parade du défenseur (anneau 2D qui se ferme pile à
// l'impact, calé sur `parry:window` comme l'anneau 3D de LK2), la flèche au-dessus du joueur actif et « EDGE! »
// au-dessus d'un joueur au bord du vide (`teeter`). Les touches viennent des réglages du gameplay (keys.ts).
import * as THREE from 'three';
import type { Ctx, PlayerId, Vec3 } from '../core/types';
import { getFighterObject, worldToScreen as sceneToScreen } from '../scene/api';
import { el, worldToScreen } from './dom';
import { jumpKey, kbd, keyLine, parryKey } from './keys';

/** Hauteur (m) au-dessus des pieds où poser la flèche : perso KayKit ≈ 2,5 m (tokens.js, rendu.contour). */
const HEAD_H = 2.2;
const EDGE_H = 2.9;

export interface Help {
  root: HTMLDivElement;
  defend: HTMLDivElement;
  world: HTMLDivElement;
  dispose(): void;
}

export function mountHelp(ctx: Ctx): Help {
  const root = el('div', 'help-bar');
  const defend = el('div', 'defend');
  defend.hidden = true;
  const world = el('div', 'world-layer');
  const arrow = el('div', 'parrow');
  const arrowTag = el('span', 'parrow-tag');
  arrow.append(arrowTag, el('span', 'parrow-tip'));
  const edges = [el('div', 'edge-warn'), el('div', 'edge-warn')];
  edges.forEach((e) => {
    e.hidden = true;
    e.append(el('span', '', 'EDGE!'));
  });
  world.append(arrow, ...edges);

  let charging = false;
  let moveLeft = 0;
  const teeter: [boolean, boolean] = [false, false];
  let parry: { defender: PlayerId; tImpact: number; until: number } | null = null;
  let parryTimer = 0;

  const isAI = (p: PlayerId) => ctx.state.vsAI && p === 1;
  const inTurn = () => ['move', 'aim'].includes(ctx.state.phase);

  function render() {
    const phase = ctx.state.phase;
    const active = ctx.state.active;
    const ps = ctx.state.players[active];
    root.replaceChildren();
    root.className = `help-bar p${active + 1}`;
    if (parry) {
      root.hidden = true;
      return;
    }
    const edge = teeter[active] && inTurn() && !isAI(active);
    const turnChip = el('span', 'help-turn', isAI(active) ? "AI'S TURN" : `P${active + 1}'S TURN`);
    if (edge) root.append(el('span', 'help-edge', 'EDGE!'));
    if (isAI(active) && (inTurn() || phase === 'turn-intro')) {
      root.append(turnChip, el('span', 'keytext', 'The AI is thinking…'));
    } else if (phase === 'turn-intro' && ps.onLedge) {
      root.append(turnChip, el('span', 'keytext strong', 'Climb back up!'));
    } else if (phase === 'move') {
      root.append(
        turnChip,
        keyLine([['W', 'A', 'S', 'D'], 'Move', '·', [jumpKey()], 'Jump', '·', ['1', '2', '3'], 'Pick weapon']),
        el('span', 'help-chip', `${Math.max(0, moveLeft).toFixed(1)} m`),
      );
    } else if (phase === 'aim' && charging) {
      root.append(turnChip, el('span', 'keytext fire', 'Release to FIRE!'));
    } else if (phase === 'aim') {
      root.append(turnChip, keyLine([['1', '2', '3'], 'Weapon', '·', 'Hold', ['CLICK'], 'or', ['F'], '→ release to FIRE']));
    }
    root.hidden = root.childElementCount === 0;
  }

  // ---------- Invite de parade ----------
  function showDefend(defender: PlayerId, tImpact: number) {
    window.clearTimeout(parryTimer);
    parry = { defender, tImpact, until: tImpact + 400 };
    render();
    if (isAI(defender)) return;
    defend.className = `defend p${defender + 1}`;
    const key = parryKey(defender);
    const ring = el('span', 'defend-ring');
    const cap = el('span', 'defend-key');
    cap.append(kbd(key, 'huge'), ring);
    const head = el('div', 'defend-head', `P${defender + 1} DEFEND!`);
    const line = el('div', 'defend-line');
    line.append(el('span', '', 'Press'), cap, el('span', '', 'when the ring closes!'));
    defend.replaceChildren(head, line);
    const ms = Math.max(120, tImpact - performance.now());
    ring.style.animationDuration = `${ms}ms`;
    defend.hidden = false;
    parryTimer = window.setTimeout(hideDefend, ms + 1400); // filet si parry:result n'arrive jamais
  }
  function hideDefend() {
    window.clearTimeout(parryTimer);
    parry = null;
    defend.hidden = true;
    render();
  }

  const canvas = ctx.three.canvas;
  const onDown = (e: MouseEvent) => {
    if (e.button === 0 && inTurn()) {
      charging = true;
      render();
    }
  };
  const onUp = (e: MouseEvent) => {
    if (e.button === 0 && charging) {
      charging = false;
      render();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyF' || e.repeat) return;
    const down = e.type === 'keydown';
    if (down && !inTurn()) return;
    if (charging !== down) {
      charging = down;
      render();
    }
  };
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  const offs = [
    ctx.bus.on('phase:change', () => {
      if (!inTurn()) charging = false;
      render();
    }),
    ctx.bus.on('turn:start', ({ active }) => {
      charging = false;
      moveLeft = ctx.state.players[active].moveLeft;
      hideDefend();
    }),
    ctx.bus.on('move:update', ({ player, moveLeft: m }) => {
      if (player !== ctx.state.active) return;
      const changed = Math.abs(m - moveLeft) >= 0.1;
      moveLeft = m;
      if (changed && ctx.state.phase === 'move') render();
    }),
    ctx.bus.on('weapon:pick', () => render()),
    ctx.bus.on('fire', () => {
      charging = false;
      render();
    }),
    ctx.bus.on('parry:window', ({ defender, tImpact }) => showDefend(defender, tImpact)),
    ctx.bus.on('parry:result', () => {
      window.clearTimeout(parryTimer);
      parryTimer = window.setTimeout(hideDefend, 350);
    }),
    ctx.bus.on('teeter', ({ player, on }) => {
      teeter[player] = on;
      render();
    }),
    ctx.bus.on('ledge:grab', () => render()),
    ctx.bus.on('ledge:climb', () => render()),
    ctx.bus.on('match:start', () => {
      teeter[0] = teeter[1] = false;
      hideDefend();
    }),
  ];

  // Projection monde → écran à chaque image : flèche du joueur actif, « EDGE! » au-dessus d'un joueur au bord.
  // Ancrée sur le perso VISIBLE (API du lot LA : racine du perso + caméra réellement utilisée), repli sur l'état.
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  function above(player: PlayerId, h: number): { x: number; y: number; behind: boolean } {
    const obj = getFighterObject(player);
    const base: Vec3 = obj ? (obj.getWorldPosition(tmp), [tmp.x, tmp.y, tmp.z]) : ctx.state.players[player].pos;
    const point: Vec3 = [base[0], base[1] + h, base[2]];
    const cam = ctx.three.camera;
    cam.getWorldDirection(camDir);
    tmp.set(point[0] - cam.position.x, point[1] - cam.position.y, point[2] - cam.position.z);
    const behind = tmp.dot(camDir) <= 0;
    const s = sceneToScreen(point);
    return s ? { x: s.x, y: s.y, behind } : worldToScreen(cam, point, tmp);
  }
  ctx.loop.addSystem(
    'ui-world-markers',
    () => {
      const phase = ctx.state.phase;
      const show = ['turn-intro', 'move', 'aim'].includes(phase);
      const active = ctx.state.active;
      const p = ctx.state.players[active];
      if (show && p.fighter) {
        const s = above(active, HEAD_H);
        arrow.hidden = s.behind;
        // Au bord : la flèche du joueur actif devient elle-même « EDGE! » (pas deux étiquettes empilées).
        arrow.className = `parrow p${active + 1}${teeter[active] ? ' edge' : ''}`;
        arrowTag.textContent = teeter[active] ? 'EDGE!' : isAI(active) ? 'AI' : `P${active + 1}`;
        arrow.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      } else {
        arrow.hidden = true;
      }
      ([0, 1] as PlayerId[]).forEach((i) => {
        const edge = edges[i];
        const q = ctx.state.players[i];
        if (!teeter[i] || !q.fighter || phase === 'end' || (show && i === active)) {
          edge.hidden = true;
          return;
        }
        const s = above(i, EDGE_H);
        edge.hidden = s.behind;
        edge.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px)`;
      });
    },
    950,
  );

  render();
  return {
    root,
    defend,
    world,
    dispose() {
      for (const off of offs) off();
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.clearTimeout(parryTimer);
    },
  };
}
