// Effets visuels : explosions, poussière, vague de soupe, flaques, bulles de bouclier.
import * as THREE from 'three';
import { Particles, toon } from './scene.js';

export function createFx(scene) {
  const sparks = new Particles(1400, true);
  const smoke = new Particles(700, false);
  scene.add(sparks.points, smoke.points);
  const flashes = [];
  const flashGeo = new THREE.SphereGeometry(1, 16, 12);

  function explosion(c, colors, radius = 3) {
    sparks.burst(c.x, c.y + 0.3, c.z, [...colors, '#ffffff'], 110, radius * 3.4, 0.6, { grav: -8, life: 1.0 });
    sparks.burst(c.x, c.y + 0.3, c.z, colors, 40, radius * 1.3, 1.4, { grav: 2, life: 0.55, drag: 4 });
    // boule de feu « cartoon » : disques opaques orange puis fumée claire
    smoke.burst(c.x, c.y + 0.5, c.z, ['#ff8a1f', '#ffb938', '#ffd76a'], 26, radius * 1.0, 1.1, { grav: 2.5, life: 0.5, drag: 3.5, grow: 1.6 });
    smoke.burst(c.x, c.y + 0.6, c.z, ['#8f7b69', '#a8927a', '#6f5f52'], 36, radius * 1.1, 1.0, { grav: 1.8, life: 1.7, drag: 2.5, grow: 2.4 });
    const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: colors[1] || '#fff1a8', transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(c); m.position.y += 0.4;
    scene.add(m);
    flashes.push({ m, t: 0, dur: 0.3, r: radius * 1.0 });
  }
  function dust(p, n = 10) {
    smoke.burst(p.x, p.y, p.z, ['#c9ae8a', '#a88d6c', '#e0cda8'], n, 1.8, 0.6, { grav: -1.5, life: 1.3, drag: 2, grow: 1.6 });
  }
  function soupWave(from, to, cols = ['#e0922a', '#e0922a', '#f7cf5e']) {
    const T = 0.6;
    for (let i = 0; i < 120; i++) {
      const dx = to.x - from.x + (Math.random() - 0.5) * 1.4, dz = to.z - from.z + (Math.random() - 0.5) * 1.2, dy = 0.2 - from.y;
      const t = T * (0.8 + Math.random() * 0.4);
      smoke.emit(from.x, from.y, from.z, {
        vx: dx / t, vy: dy / t + 0.5 * 9.81 * t, vz: dz / t, spread: 0.15,
        color: cols[i % cols.length], size: 0.5, life: t + 0.5, grav: -9.81, drag: 0,
      });
    }
  }
  // Arc électrique en zigzag (tube plein, lisible), disparaît en 0,3 s.
  const arcs = [];
  const arcMats = [new THREE.MeshBasicMaterial({ color: '#FFE94A', transparent: true }), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true })];
  function arc(a, b, delay = 0) {
    const pts = [a.clone()];
    const n = 6;
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.x += (Math.random() - 0.5) * 0.5; p.y += (Math.random() - 0.5) * 0.5 + 0.15; p.z += (Math.random() - 0.5) * 0.5;
      pts.push(p);
    }
    pts.push(b.clone());
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const outer = new THREE.Mesh(new THREE.TubeGeometry(path, 28, 0.07, 4, false), arcMats[0].clone());
    const inner = new THREE.Mesh(new THREE.TubeGeometry(path, 28, 0.03, 4, false), arcMats[1].clone());
    outer.add(inner);
    outer.visible = delay <= 0;
    outer.renderOrder = 6;
    scene.add(outer);
    arcs.push({ m: outer, inner, t: -delay, dur: 0.32 });
  }
  // Éclats de glace (petits tétraèdres opaques qui tombent)
  const shardGeo = new THREE.TetrahedronGeometry(0.12, 0);
  const shardMat = new THREE.MeshBasicMaterial({ color: '#cdefff' });
  const shards = [];
  function iceShards(p, n = 14) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.position.copy(p);
      const a = Math.random() * 6.28, s = 2 + Math.random() * 4;
      shards.push({ m, vx: Math.cos(a) * s, vy: 2 + Math.random() * 4, vz: Math.sin(a) * s, t: 0 });
      scene.add(m);
    }
  }
  function update(dt) {
    sparks.update(dt); smoke.update(dt);
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.t += dt;
      a.m.visible = a.t >= 0;
      const k = a.t / a.dur;
      a.m.material.opacity = a.inner.material.opacity = Math.max(0, 1 - Math.max(0, k));
      if (k >= 1) { a.m.removeFromParent(); a.m.geometry.dispose(); a.inner.geometry.dispose(); a.m.material.dispose(); a.inner.material.dispose(); arcs.splice(i, 1); }
    }
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.t += dt; s.vy -= 14 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y = Math.max(0.05, s.m.position.y + s.vy * dt); s.m.position.z += s.vz * dt;
      s.m.rotation.x += dt * 8; s.m.rotation.y += dt * 6;
      if (s.t > 1.2) { s.m.removeFromParent(); shards.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.m.scale.setScalar(0.3 + k * f.r);
      f.m.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { f.m.removeFromParent(); f.m.material.dispose(); flashes.splice(i, 1); }
    }
  }
  return { sparks, smoke, explosion, dust, soupWave, arc, iceShards, update };
}

export function makePuddle(scene, pos) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), toon('#d68a26', { emissive: '#5a2a00', transparent: true, opacity: 0.92 }));
  disc.rotation.x = -Math.PI / 2; disc.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), toon('#f2c14e', { transparent: true, opacity: 0.9 }));
  inner.rotation.x = -Math.PI / 2; inner.position.set(0.25, 0.005, -0.1);
  g.add(disc, inner);
  g.position.set(pos.x, 0.025, pos.z);
  g.scale.setScalar(0.01);
  scene.add(g);
  return g;
}

export function makeShieldBubble(color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 }));
  m.add(rim);
  m.position.y = 1.1;
  return m;
}
