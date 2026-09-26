// Aides de visée en 3D (contrat LA §4) : trajectoire en pointillés, cercle d'impact (couleur d'équipe du
// joueur qui vise), flèche de recul — rayures alerte/encre si elle éjecte (règle 5 de la DA : jamais rouge,
// le rouge est à J1). Écoute `aim:update` ; utilise `path`/`impact`/`knockback` du gameplay quand ils
// existent, sinon calcule une parabole simple (LOCAL_TOKENS.aimFallback) pour rester lisible avant que le
// lot LG ne soit branché.
import * as THREE from 'three';
import { ui } from '../art/tokens.js';
import type { Category, Ctx, PlayerId } from '../core/types';
import { LOCAL_TOKENS } from './localTokens';
import { excludeFromOcclusion } from './registry';
import { teamColor } from './team';

function fallbackPath(from: THREE.Vector3, dir: THREE.Vector3, power: number, category: Category): THREE.Vector3[] {
  const segments = LOCAL_TOKENS.aimFallback.segments;
  const gravity = LOCAL_TOKENS.aimFallback.gravity[category] ?? 9;
  const dt = 0.09;
  const v = dir.clone().normalize().multiplyScalar(4 + power * 10);
  const p = from.clone();
  const pts: THREE.Vector3[] = [p.clone()];
  for (let i = 0; i < segments; i++) {
    v.y -= gravity * dt;
    p.addScaledVector(v, dt);
    if (p.y <= 0.02) { pts.push(p.clone().setY(0.02)); break; }
    pts.push(p.clone());
  }
  return pts;
}

export function installAimHelpers(ctx: Ctx): void {
  const group = new THREE.Group();
  group.name = 'la-aim-helpers';
  group.visible = false;
  ctx.three.scene.add(group);
  excludeFromOcclusion(group);

  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineDashedMaterial({ color: ui.encre, dashSize: 0.18, gapSize: 0.12 });
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;
  line.raycast = () => {};
  group.add(line);

  const ringMat = new THREE.MeshBasicMaterial({ color: ui.encre, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const impactRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), ringMat);
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.raycast = () => {};
  group.add(impactRing);

  // Note (règle 5 non complète) : la flèche devrait être rayée alerte/encre quand `ejects`, pas seulement
  // recolorée en plat — THREE.ArrowHelper n'a pas d'UV exploitables le long de sa hampe pour un vrai motif
  // de rayures. Solution provisoire : couleur pleine `ui.alerte` (jamais rouge), signalé dans le rendu.
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1.2, ui.encre, 0.35, 0.22);
  arrow.line.raycast = () => {};
  arrow.cone.raycast = () => {};
  arrow.visible = false;
  group.add(arrow);

  let activePlayer: PlayerId | null = null;

  ctx.bus.on('weapon:pick', () => { group.visible = false; });

  ctx.bus.on('aim:update', ({ player, dir, power, path, impact, knockback, ejects }) => {
    activePlayer = player;
    group.visible = true;
    const color = teamColor(player);
    lineMat.color.set(color);
    ringMat.color.set(color);

    const ps = ctx.state.players[player];
    const origin = new THREE.Vector3(ps.pos[0], ps.pos[1] + 1.1, ps.pos[2]);
    const dirV = new THREE.Vector3(dir[0], dir[1], dir[2]);
    const category = ps.weapons[ps.selected]?.category ?? 'blaster';
    const points = path && path.length > 1
      ? path.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      : fallbackPath(origin, dirV, power, category);
    lineGeo.setFromPoints(points);
    line.computeLineDistances();

    const impactPt = impact ? new THREE.Vector3(impact[0], impact[1], impact[2]) : points[points.length - 1];
    impactRing.position.set(impactPt.x, 0.03, impactPt.z);

    if (knockback) {
      const kb = new THREE.Vector3(knockback[0], knockback[1], knockback[2]);
      const len = THREE.MathUtils.clamp(kb.length() || 1, 0.6, 2.4);
      arrow.position.set(impactPt.x, 0.5, impactPt.z);
      if (kb.lengthSq() > 1e-6) arrow.setDirection(kb.normalize());
      arrow.setLength(len, len * 0.3, len * 0.18);
      const arrowColor = ejects ? ui.alerte : color;
      (arrow.line.material as THREE.LineBasicMaterial).color.set(arrowColor);
      (arrow.cone.material as THREE.MeshBasicMaterial).color.set(arrowColor);
      arrow.visible = true;
    } else {
      arrow.visible = false;
    }
  });

  ctx.bus.on('fire', ({ player }) => { if (player === activePlayer) group.visible = false; });

  ctx.loop.addSystem('la-aim', () => {
    if (ctx.state.phase !== 'aim') { group.visible = false; return; }
    const pulse = 1 + 0.12 * Math.sin(ctx.loop.time * 8);
    impactRing.scale.setScalar(pulse);
  }, 320);
}
