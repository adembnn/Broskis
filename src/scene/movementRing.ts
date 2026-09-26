// Anneau de déplacement (contrat LA §5) : "ruban adhésif couleur joueur, bord vinyle" (tokens.js `rendu.ruban`),
// qui se vide en camembert selon moveLeft/MOVE_BUDGET. Visible seulement pour le joueur actif en phase 'move'.
import * as THREE from 'three';
import { rendu } from '../art/tokens.js';
import { MOVE_BUDGET } from '../core/state';
import type { Ctx } from '../core/types';
import { LOCAL_TOKENS } from './localTokens';
import { excludeFromOcclusion } from './registry';
import { teamColor } from './team';

const SEGMENTS = 48;
const START_ANGLE = -Math.PI / 2;

function arcGeometry(innerR: number, outerR: number, fraction: number): THREE.RingGeometry {
  return new THREE.RingGeometry(innerR, outerR, SEGMENTS, 1, START_ANGLE, Math.max(0.001, fraction) * Math.PI * 2);
}

export function installMovementRing(ctx: Ctx): void {
  const r = LOCAL_TOKENS.movementRing.radius;
  const tapeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const tape = new THREE.Mesh(arcGeometry(r, r + rendu.ruban.largeur, 1), tapeMat);
  tape.rotation.x = -Math.PI / 2;
  tape.visible = false;
  tape.raycast = () => {};
  ctx.three.scene.add(tape);
  excludeFromOcclusion(tape);

  const border = new THREE.Mesh(
    arcGeometry(r + rendu.ruban.largeur, r + rendu.ruban.largeur + rendu.ruban.bord, 1),
    new THREE.MeshBasicMaterial({ color: rendu.contour.vinyle, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }),
  );
  border.rotation.x = -Math.PI / 2;
  border.visible = false;
  border.raycast = () => {};
  ctx.three.scene.add(border);
  excludeFromOcclusion(border);

  let fraction = 1;

  function setFraction(f: number): void {
    fraction = THREE.MathUtils.clamp(f, 0, 1);
    tape.geometry.dispose();
    tape.geometry = arcGeometry(r, r + rendu.ruban.largeur, fraction);
    border.geometry.dispose();
    border.geometry = arcGeometry(r + rendu.ruban.largeur, r + rendu.ruban.largeur + rendu.ruban.bord, fraction);
  }

  ctx.bus.on('move:update', ({ player, moveLeft }) => {
    tapeMat.color.set(teamColor(player));
    setFraction(moveLeft / MOVE_BUDGET);
  });

  ctx.bus.on('turn:start', () => setFraction(1));

  ctx.loop.addSystem('la-move-ring', () => {
    const show = ctx.state.phase === 'move';
    tape.visible = show;
    border.visible = show;
    if (!show) return;
    const pos = ctx.state.players[ctx.state.active].pos;
    tape.position.set(pos[0], 0.02, pos[2]);
    border.position.set(pos[0], 0.021, pos[2]);
  }, 310);
}
