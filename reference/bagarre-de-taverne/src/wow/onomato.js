// Onomatopées 3D : lettres en relief (BOUM, SPLASH, BZZT, CRAC, FSHHH…) qui jaillissent, tombent, rebondissent puis fondent.
// Chaque lettre est un corps Rapier ; géométries mises en cache par caractère (police : sous-ensemble A–Z + « ! » de
// helvetiker_bold, three/examples/fonts, licence MAGENTA Ltd., redistribution libre avec la notice).
// Rendu : toutes les lettres vivantes sont recopiées chaque image dans DEUX maillages dynamiques (remplissage toon à
// couleurs par sommet + contour encre) → 2 draw calls quel que soit le nombre de lettres (budget GAME_SPEC §7 : ≤ 150).
//   wow.onomato.spawn(word, pos) · alive() : nombre de lettres en vie
import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { toon } from '../scene.js';
import { instancedOutlineMaterial, smoothed } from '../ai/toonInstanced.js';
import fontData from './onomato-font.json';

const SIZE = 0.52;
const COLORS = { BOUM: '#F2A541', SPLASH: '#5aa8e6', BZZT: '#FFE94A', CRAC: '#C68B4E', FSHHH: '#cfe9ee', PAF: '#F3E3C3', POUF: '#F3E3C3', WOUF: '#FF6A1F', CLONG: '#d9a441', GLOU: '#b8d4a0' };
const MAX_LETTERS = 18;
const LIFE = 1.9;

export function installOnomato(ctx, wow) {
  const { scene, RAPIER } = ctx;
  // Monde physique séparé : les lettres rebondissent sur le sol et les murs sans jamais gêner le jeu (lustre, projectiles…)
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
  {
    const g = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.5, 8).setTranslation(0, -0.5, 0.5).setFriction(0.8), g);
    world.createCollider(RAPIER.ColliderDesc.cuboid(12, 5, 0.5).setTranslation(0, 5, -5.5), g);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 8).setTranslation(-11.5, 5, 0.5), g);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 8).setTranslation(11.5, 5, 0.5), g);
    world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.3, 8).setTranslation(0, 7.5, 0.5), g); // plafond (loi de gravité inversée)
  }
  const font = new Font(fontData);
  const geos = new Map();
  const letters = [];
  const api = { spawn, alive: () => letters.length, letters };
  wow.onomato = api;

  function glyph(ch) {
    if (!geos.has(ch)) {
      const g = new TextGeometry(ch, { font, size: SIZE, depth: 0.16, curveSegments: 3, bevelEnabled: false });
      g.computeBoundingBox();
      const b = g.boundingBox;
      g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
      g.computeBoundingBox();
      const size = new THREE.Vector3(); g.boundingBox.getSize(size);
      const fill = g.index ? g.toNonIndexed() : g;
      const line = smoothed(g).toNonIndexed();
      geos.set(ch, {
        size, adv: (font.data.glyphs[ch]?.ha ?? 700) / font.data.resolution * SIZE,
        fp: fill.attributes.position.array, fn: fill.attributes.normal.array,
        lp: line.attributes.position.array, ln: line.attributes.normal.array,
      });
    }
    return geos.get(ch);
  }

  // ---------- Deux maillages dynamiques partagés ----------
  function dynMesh(material, withColor) {
    const g = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false; mesh.visible = false;
    mesh.userData.noOutline = true; mesh.raycast = () => {};
    const buf = { g, mesh, cap: 0, withColor, pos: null, nor: null, col: null };
    scene.add(mesh);
    return buf;
  }
  const fillBuf = dynMesh(toon('#ffffff', { vertexColors: true }), true);
  const lineBuf = dynMesh(instancedOutlineMaterial(3.2), false);
  lineBuf.mesh.userData.isOutline = true;
  function ensure(buf, n) {
    if (n <= buf.cap) return;
    buf.cap = Math.ceil(n * 1.5);
    const mk = (k) => { const a = new THREE.BufferAttribute(new Float32Array(buf.cap * 3), 3); a.setUsage(THREE.DynamicDrawUsage); buf.g.setAttribute(k, a); return a; };
    buf.pos = mk('position'); buf.nor = mk('normal');
    if (buf.withColor) buf.col = mk('color');
  }
  const M = new THREE.Matrix4(), NM = new THREE.Matrix3(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
  function write(buf, src, nsrc, offset, color) {
    const P = buf.pos.array, N = buf.nor.array, C = buf.col?.array;
    const e = M.elements, ne = NM.elements;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2], o = offset * 3 + i;
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = nsrc[i], ny = nsrc[i + 1], nz = nsrc[i + 2];
      N[o] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      N[o + 1] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      N[o + 2] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      if (C) { C[o] = color.r; C[o + 1] = color.g; C[o + 2] = color.b; }
    }
    return offset + src.length / 3;
  }
  function rebuild() {
    let nf = 0, nl = 0;
    for (const l of letters) { nf += l.g.fp.length / 3; nl += l.g.lp.length / 3; }
    fillBuf.mesh.visible = lineBuf.mesh.visible = letters.length > 0;
    if (!letters.length) return;
    ensure(fillBuf, nf); ensure(lineBuf, nl);
    let of = 0, ol = 0;
    for (const l of letters) {
      M.compose(V.copy(l.mesh.position), Q.copy(l.mesh.quaternion), S.copy(l.mesh.scale));
      NM.getNormalMatrix(M);
      of = write(fillBuf, l.g.fp, l.g.fn, of, l.color);
      ol = write(lineBuf, l.g.lp, l.g.ln, ol, null);
    }
    for (const b of [fillBuf, lineBuf]) {
      b.g.setDrawRange(0, b === fillBuf ? of : ol);
      b.pos.needsUpdate = true; b.nor.needsUpdate = true;
      if (b.col) b.col.needsUpdate = true;
    }
  }

  const last = new Map();
  let lastAny = -9;
  function spawn(word, pos, { force = false } = {}) {
    word = String(word).toUpperCase().replace(/[^A-Z!]/g, '');
    if (!word || !pos) return false;
    const now = ctx.realTime;
    if (!force && (now - lastAny < 0.3 || now - (last.get(word) ?? -9) < 0.9)) return false;
    lastAny = now; last.set(word, now);
    const color = COLORS[word] || '#F3E3C3';
    const chars = [...word];
    const advs = chars.map((c) => glyph(c).adv * 0.92);
    const width = advs.reduce((a, b) => a + b, 0);
    let x = -width / 2;
    const high = pos.y > 3;
    const base = new THREE.Vector3(pos.x, high ? pos.y - 0.3 : Math.max(1.2, pos.y + 0.9), pos.z + 0.6);
    const tilt = (Math.random() - 0.5) * 0.25;
    chars.forEach((ch, i) => {
      const { size } = glyph(ch);
      const cx = x + advs[i] / 2; x += advs[i];
      const mesh = new THREE.Object3D(); // transformation seule : le rendu passe par les maillages partagés
      mesh.scale.setScalar(0.01);
      const p = base.clone().add(new THREE.Vector3(cx, cx * tilt, 0));
      mesh.position.copy(p);
      mesh.rotation.z = tilt;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
        .setRotation(mesh.quaternion)
        .setLinvel(cx * 1.6 + (Math.random() - 0.5), high ? Math.random() : 4 + Math.random() * 2.5, 0.6 + Math.random() * 0.8)
        .setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 5 })
        .setCcdEnabled(true));
      world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.08, size.x / 2), Math.max(0.08, size.y / 2), size.z / 2).setDensity(0.4).setRestitution(0.55).setFriction(0.6), body);
      letters.push({ mesh, body, t: -i * 0.03, born: ctx.realTime, g: glyph(ch), color: new THREE.Color(color) });
    });
    while (letters.length > MAX_LETTERS) kill(letters[0]);
    ctx.events.emit('wow:onomato', { word, pos: base.clone() });
    return true;
  }
  function kill(l) {
    const i = letters.indexOf(l); if (i >= 0) letters.splice(i, 1);
    world.removeRigidBody(l.body);
  }

  // Synchronisation + apparition élastique + fonte (temps réel : les lettres restent vivantes pendant l'arrêt sur image)
  let acc = 0;
  ctx.addSystem('wow-onomato', (dt, real) => {
    if (letters.length && dt > 0) {
      const gy = ctx.world.gravity.y; // les lettres suivent la loi de la gravité en vigueur
      if (world.gravity.y !== gy) world.gravity = new RAPIER.Vector3(0, gy, 0);
      acc += dt;
      let n = 0;
      while (acc >= 1 / 60 && n < 4) { world.timestep = 1 / 60; world.step(); acc -= 1 / 60; n++; }
      if (n === 4) acc = 0;
    }
    for (const l of [...letters]) {
      l.t += real;
      const t = l.body.translation(), r = l.body.rotation();
      l.mesh.position.set(t.x, t.y, t.z);
      l.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      let s;
      if (l.t < 0) s = 0.01;
      else if (l.t < 0.18) { const k = l.t / 0.18; s = 0.01 + k * 1.25; }
      else if (l.t < 0.3) s = 1.26 - ((l.t - 0.18) / 0.12) * 0.26;
      else if (l.t < LIFE) s = 1;
      else s = Math.max(0, 1 - (l.t - LIFE) / 0.3);
      l.mesh.scale.setScalar(Math.max(0.01, s));
      if (l.t > LIFE + 0.3 || t.y < -2 || t.y > 12) kill(l);
    }
    if (letters.length || fillBuf.mesh.visible) rebuild();
  }, 62);

  // ---------- Déclencheurs ----------
  const posOf = (e) => (e?.kind === 'fighter' ? e.chestPos() : e?.pos ? e.pos(new THREE.Vector3()).clone() : null);
  const REACT_WORD = { court_jus: 'BZZT', ch_huile: 'BZZT', court_circuit: 'BZZT', flambee: 'BOUM', huile_feu: 'WOUF', vapeur: 'FSHHH', extinction: 'FSHHH', etouffe: 'FSHHH', gel: 'CRAC', eclatement: 'CRAC', attise: 'WOUF' };
  ctx.events.on('chem:reaction', (r) => {
    const w = REACT_WORD[r.id];
    if (!w) return;
    const p = r.pos || posOf(r.entityRef || ctx.entities.get(r.entity));
    if (p) spawn(w, p);
  });
  ctx.events.on('prop:action', ({ prop, verb }) => {
    if (verb === 'explode') ctx.later(0.05, () => spawn('BOUM', prop.pieces?.[0]?.mesh?.position?.clone() || posOf(prop)));
    if (verb === 'collapse') ctx.later(1.4, () => spawn('CRAC', posOf(prop)));
  });
  ctx.events.on('prop:break', ({ prop }) => { const p = posOf(prop); if (p) spawn(prop.material === 'glass' ? 'SPLASH' : 'CRAC', p); });
  ctx.events.on('surface:spawn', ({ surface }) => { if (!wow.weather?.quiet && ['water', 'beer', 'soup'].includes(surface.liquid)) spawn('SPLASH', surface.center.clone()); });
  ctx.events.on('damage', (d) => {
    if (d.amount < 18 || d.kind === 'burn') return;
    const f = ctx.fighters[d.target];
    if (!f) return;
    spawn(d.kind === 'blast' ? 'BOUM' : d.element === 'lightning' ? 'BZZT' : d.kind === 'prop' ? 'PAF' : 'BOUM', f.chestPos());
  });
  ctx.events.on('spell:impact', ({ spell, pos }) => { if (spell.form === 'meteore') spawn('BOUM', pos); });
}
