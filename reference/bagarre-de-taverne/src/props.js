// Registre des accessoires interactifs + physique Rapier.
// Chaque accessoire est AUSSI une entité chimique (voir src/core/entities.js) :
//   { id, name, aliases, affordances, pieces, live (utilisable par l'Oracle), group, where(),
//     kind:'prop', material, fuel, radius, height, tags, pos(), onCharred(), onFlambee() }
// Les accessoires commencent fixes ; une action les rend dynamiques. Le moteur calcule seul les vitesses :
// l'IA ne choisit qu'un id, un verbe et une cible.
//
// Extension (souris, agents « wow ») :
//   props.grabbables()            : accessoires attrapables (tag 'grabbable') encore en place
//   props.launch(prop, vel, by)   : rend l'accessoire dynamique et le lance (vitesse monde)
//   props.throwAt(prop, target, by) : lancer balistique auto-visé
//   props.reset()                 : reconstruit tout le décor (entre deux manches)
//   ctx.entityByCollider(handle)  : entité (prop ou combattant) derrière un collider
//   props.define / addPiece / makeDynamic / removePiece : créer un accessoire à la volée (src/wow/summon.js)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, addOutline as outline, fadeOutlineMaterial, bakeGroup } from './scene.js';
import { sfx } from './audio.js';
import { propNode } from './kaykit.js';

// Libellés courts pour l'interface (VERBS, plus détaillés, vont dans le prompt de l'IA).
export const VERB_LABELS = {
  drop: 'se décroche !', explode: 'éclate !', flip: 'valse dans les airs !', throw: 'livraison express !',
  topple: 's\'effondre !', spill: 'se renverse !', collapse: 's\'écroule !',
};

export const VERBS = {
  drop: 'se décroche et tombe sur la cible',
  explode: 'éclate (souffle de zone ; bière : flaque mouillée sous la cible ; huile : flambée en feu)',
  flip: 'est renversée et projetée sur la cible',
  throw: 'est lancé(e) sur la cible (bouteille : flaque d\'alcool inflammable ; chope : bière)',
  topple: 'toute la pile s\'effondre vers la cible',
  spill: 'se renverse : flaque sous la cible (marmite : soupe bouillante ; tonneau d\'huile : huile glissante)',
  collapse: 's\'écroule et tombe vers la cible',
};

const G = 9.81;
// Vitesse initiale pour relier a à b en T secondes (tir balistique déterministe).
function ballistic(a, b, T) {
  return { x: (b.x - a.x) / T, y: (b.y - a.y) / T + 0.5 * G * T, z: (b.z - a.z) / T };
}

function labelTexture(text, { bg = '#F3E3C3', ink = '#2B1D14', w = 256, h = 128 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const draw = () => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = ink; g.beginPath(); g.roundRect(0, 0, w, h, 18); g.fill();
  g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 12); g.fill();
  // goutte
  g.fillStyle = ink; g.beginPath(); g.moveTo(44, 30); g.bezierCurveTo(60, 58, 66, 70, 66, 80); g.arc(44, 80, 22, 0, Math.PI); g.bezierCurveTo(22, 70, 28, 58, 44, 30); g.fill();
  g.fillStyle = ink; g.font = '64px "Lilita One", "Trebuchet MS", sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 80, h / 2 + 4);
  t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw).catch(() => {});
  return t;
}

// Fusionne d'abord les meshes du groupe par matériau, puis pose le contour (1 contour par matériau au lieu d'1 par pièce).
function addOutline(g, opts) { if (g.isGroup) bakeGroup(g); outline(g, opts); }

export function createProps(ctx) {
  const { scene, world, RAPIER } = ctx;
  const registry = [];
  const pieces = new Map(); // collider handle -> piece
  const dynamics = [];      // pièces dynamiques à synchroniser { mesh, body, fadeAt, ... }
  const extras = [];        // meshes annexes (corde…) à retirer au reset

  const wood = toon('#9a6234');
  const darkWood = toon('#5b3620');
  const oilWood = toon('#4a3b2c');
  const iron = toon('#4a4440');
  const brass = toon('#d9a441');
  const rope = toon('#ecd29a');

  function addPiece(mesh, body, { dmg = 10, ref = 6 } = {}) {
    const p = { mesh, body, dmg, ref, armed: false, fadeAt: Infinity, fading: 0, colliders: [], dead: false, owner: null };
    for (let i = 0; i < body.numColliders(); i++) {
      const c = body.collider(i);
      c.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      pieces.set(c.handle, p);
      p.colliders.push(c);
    }
    return p;
  }
  function makeDynamic(p, fadeAfter = 9) {
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    p.armed = true;
    p.fadeAt = ctx.time + fadeAfter;
    if (!dynamics.includes(p)) dynamics.push(p);
  }
  function syncMesh(p) {
    const t = p.body.translation(), r = p.body.rotation();
    p.mesh.position.set(t.x, t.y, t.z);
    p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
  function removePiece(p) {
    if (p.dead) return;
    p.dead = true;
    for (const c of p.colliders) pieces.delete(c.handle);
    world.removeRigidBody(p.body);
    p.mesh.removeFromParent();
    const i = dynamics.indexOf(p); if (i >= 0) dynamics.splice(i, 1);
    // si c'était la dernière pièce d'un accessoire, l'entité chimique disparaît
    if (p.prop && p.prop.pieces.every((q) => q.dead)) { p.prop.live = false; ctx.entities.remove(p.prop); }
  }
  function fixedBody(x, y, z) { return world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z).setCanSleep(true).setCcdEnabled(true)); }
  function shadow(o, cast = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = true; } }); return o; }
  // Visuel KayKit (props.glb) posé dans le groupe d'un accessoire : seul le rendu change, la physique reste celle d'origine.
  function kk(g, name, { x = 0, y = 0, z = 0, s = 1, sx, sy, sz, ry = 0 } = {}) {
    const n = propNode(name);
    if (!n) return false;
    n.position.set(x, y, z); n.rotation.y = ry; n.scale.set(sx ?? s, sy ?? s, sz ?? s);
    g.add(n);
    return true;
  }

  // Déclare un accessoire : registre Oracle + entité chimique.
  function define(p) {
    p.kind = 'prop';
    p.live ??= true;
    for (const pc of p.pieces) pc.prop = p;
    const v = new THREE.Vector3();
    p.pos ||= (out = v) => out.copy(p.where());
    registry.push(p);
    ctx.entities.add(p);
    return p;
  }

  // ---------- Sol et murs (une seule fois) ----------
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 0.5, 8).setTranslation(0, -0.5, 0.5).setFriction(0.8), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 5, 0.5).setTranslation(0, 5, -5.5), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 8).setTranslation(-11.5, 5, 0.5), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 5, 8).setTranslation(11.5, 5, 0.5), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(12, 5, 0.5).setTranslation(0, 5, 7), ground);
  // Comptoir (fixe, sert d'appui aux chopes)
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.2, 0.66, 0.5).setTranslation(4.6, 0.66, -4.2), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.1, 0.05, 0.2).setTranslation(4.6, 2.5, -4.75), ground);

  // ---------- Géométries partagées ----------
  const barrelGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.42 + Math.sin(t * Math.PI) * 0.08, t * 1.1 - 0.55)); }
    return new THREE.LatheGeometry(pts, 14);
  })();
  const hoopGeo = new THREE.TorusGeometry(0.47, 0.03, 6, 20);
  const lidGeo = new THREE.CircleGeometry(0.42, 14);
  const crateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const slatGeo = new THREE.BoxGeometry(0.84, 0.12, 0.84);
  const bottleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.12, 0.45, 8).translate(0, 0, 0),
    new THREE.CylinderGeometry(0.04, 0.06, 0.2, 6).translate(0, 0.32, 0),
  ]);
  const mugGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.13, 0.12, 0.28, 10),
    new THREE.TorusGeometry(0.08, 0.025, 5, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.14, 0, 0),
  ]);
  const seatGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12).translate(0, 0.32, 0);
  const legsGeo = mergeGeometries([0, 1, 2].map((i) => { const a = i * 2.1; return new THREE.CylinderGeometry(0.05, 0.06, 0.72, 6).translate(Math.cos(a) * 0.28, -0.04, Math.sin(a) * 0.28); }));
  const oilLabel = new THREE.MeshBasicMaterial({ map: labelTexture('HUILE'), transparent: true });
  const mugMat = toon('#d9c7a0');

  function build() {
    // ---------- Lustre : corps en métal + corde en tissu ----------
    {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.09, 8, 24), brass); ring.rotation.x = Math.PI / 2; g.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.35, 10), brass); g.add(hub);
      const flamesMat = new THREE.MeshBasicMaterial({ color: '#ffcf5a' });
      const candleMat = toon('#f3ead2');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.05), brass); arm.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42); arm.rotation.y = -a; g.add(arm);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), candleMat); candle.position.set(Math.cos(a) * 0.85, 0.22, Math.sin(a) * 0.85); g.add(candle);
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), flamesMat); fl.position.set(Math.cos(a) * 0.85, 0.45, Math.sin(a) * 0.85); fl.userData.noOutline = true; g.add(fl);
      }
      shadow(g); addOutline(g);
      const pos = new THREE.Vector3(0, 4.9, 0.4);
      g.position.copy(pos);
      scene.add(g);
      const body = fixedBody(pos.x, pos.y, pos.z);
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.2, 0.95).setDensity(2.5).setRestitution(0.1), body);
      const piece = addPiece(g, body, { dmg: 26, ref: 7 });
      piece.heavy = true;
      const lustre = define({
        id: 'lustre', name: 'le lustre', aliases: ['lustre', 'chandelier', 'suspension', 'bougies', 'plafonnier'],
        affordances: ['drop'], pieces: [piece], anchor: pos.clone(), sway: 0,
        where: () => g.position, material: 'metal', radius: 0.95, height: 0.6, tags: ['conductive', 'heavy'],
      });
      // Corde (tissu) : si elle brûle jusqu'au bout, le lustre tombe sur l'adversaire de l'incendiaire.
      const ropeLen = 7.2 - (pos.y + 0.15);
      const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), rope);
      ropeMesh.scale.y = ropeLen; ropeMesh.position.set(pos.x, pos.y + 0.15 + ropeLen / 2, pos.z);
      ropeMesh.castShadow = true;
      addOutline(ropeMesh);
      scene.add(ropeMesh); extras.push(ropeMesh);
      const ropeCenter = ropeMesh.position.clone();
      const ropeBody = fixedBody(ropeCenter.x, ropeCenter.y, ropeCenter.z);
      world.createCollider(RAPIER.ColliderDesc.cylinder(ropeLen / 2, 0.08).setSensor(true), ropeBody);
      const ropePiece = addPiece(ropeMesh, ropeBody, { dmg: 0 });
      const cord = define({
        id: 'lustre_corde', name: 'la corde du lustre', aliases: ['corde', 'cordage', 'filin', 'attache'],
        affordances: [], pieces: [ropePiece], where: () => ropeCenter, material: 'cloth', fuel: 10, radius: 0.12, height: ropeLen, tags: ['flammable'],
        aimPos: (out = new THREE.Vector3()) => out.set(ropeCenter.x, pos.y + 0.7, ropeCenter.z),
      });
      cord.onCharred = (info) => {
        if (!lustre.live) return;
        removePiece(ropePiece);
        ctx.events.emit('prop:break', { prop: cord, cause: 'charred', by: info?.by });
        const by = info?.by ? ctx.fighters[info.by] : null;
        const target = by ? ctx.foe(by) : nearestFighter(lustre.where());
        ctx.floaterAt?.(lustre.where().clone().add(new THREE.Vector3(0, 0.6, 0)), 'CRAC !', 'react');
        dropLustre(lustre, target, info?.by);
      };
      lustre.rope = cord;
    }

    // ---------- Tonneaux (2 de bière, 1 d'huile marqué) ----------
    [[-6.1, -1.5, 'beer'], [5.9, -0.7, 'oil'], [1.9, -3.7, 'beer']].forEach(([x, z, kind], i) => {
      const g = new THREE.Group();
      const oilK = kind === 'oil';
      // bière : petit tonneau KayKit ; huile : fût couché sur son chevalet (keg), étiquette HUILE sur le fond
      const ok = oilK ? kk(g, 'keg', { y: -0.55, sx: 0.56, sy: 0.54, sz: 0.52 }) : kk(g, 'barrel_small', { y: -0.55, sx: 1.0, sy: 1.08, sz: 1.0 });
      if (!ok) {
        g.add(new THREE.Mesh(barrelGeo, oilK ? oilWood : wood));
        for (const y of [-0.33, 0.33]) { const h = new THREE.Mesh(hoopGeo, iron); h.rotation.x = Math.PI / 2; h.position.y = y; h.scale.setScalar(y ? 1.04 : 1); g.add(h); }
      }
      if (oilK) {
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), oilLabel); lab.position.set(0, ok ? 0.05 : 0.02, ok ? 0.545 : 0.52); lab.userData.noOutline = true; g.add(lab);
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon('#3a3326')); drip.scale.set(1, 1.4, 0.6); drip.position.set(0.22, -0.3, 0.42); drip.userData.noOutline = true; g.add(drip);
      } else {
        const mark = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), toon('#f2b440')); mark.position.set(0, 0.05, 0.515); mark.userData.noOutline = true; g.add(mark);
        const foam = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), toon('#fff4d6')); foam.position.set(0.02, 0.1, 0.52); foam.userData.noOutline = true; g.add(foam);
      }
      shadow(g); addOutline(g);
      g.position.set(x, 0.55, z);
      scene.add(g);
      const body = fixedBody(x, 0.55, z);
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.55, 0.47).setDensity(1.2), body);
      const piece = addPiece(g, body, { dmg: 12, ref: 6 });
      const oil = kind === 'oil';
      const prop = define({
        id: oil ? 'tonneau_huile' : `tonneau_${i + 1}`,
        name: oil ? 'le tonneau d\'huile' : `le tonneau de bière ${['de gauche', '', 'du fond'][i]}`.trim(),
        aliases: oil ? ['huile', 'tonneau d\'huile', 'baril d\'huile', 'graisse'] : ['tonneau', 'baril', 'barrique', 'fût', 'bière', 'barrel'],
        affordances: oil ? ['explode', 'spill'] : ['explode'], pieces: [piece], group: oil ? 'tonneau_huile' : 'tonneau',
        where: () => g.position, material: 'wood', fuel: 36, radius: 0.5, height: 1.1,
        tags: oil ? ['oil_barrel', 'liquid:oil'] : ['beer_barrel', 'liquid:beer'], liquid: oil ? 'oil' : 'beer',
      });
      if (oil) {
        prop.states.set('oily', Infinity);
        prop.onFlambee = (info) => explodeBarrel(prop, info?.by, { burning: true });
      }
      prop.onCharred = (info) => burstBarrel(prop, null, info?.by);
    });

    // ---------- Table ----------
    {
      const g = new THREE.Group();
      if (kk(g, 'table_medium', { y: -0.43, sx: 1.15, sy: 0.93, sz: 0.6 })) {
        kk(g, 'plate_food', { x: -0.45, y: 0.5, z: -0.05, s: 0.42, ry: 0.4 });
        kk(g, 'candle_triple', { x: 0.55, y: 0.5, z: 0.05, s: 0.45 });
        shadow(g);
      } else {
        const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.2), wood); top.position.y = 0.43; g.add(top);
        for (const [lx, lz] of [[-1, -0.48], [1, -0.48], [-1, 0.48], [1, 0.48]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.86, 0.14), darkWood); l.position.set(lx, 0, lz); g.add(l); }
        shadow(g);
      }
      addOutline(g);
      const y = 0.43;
      g.position.set(-0.2, y, -2.7);
      scene.add(g);
      const body = fixedBody(-0.2, y, -2.7);
      world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.07, 0.6).setTranslation(0, 0.43, 0).setDensity(0.9), body);
      for (const [lx, lz] of [[-1, -0.48], [1, -0.48], [-1, 0.48], [1, 0.48]]) world.createCollider(RAPIER.ColliderDesc.cuboid(0.07, 0.43, 0.07).setTranslation(lx, 0, lz).setDensity(0.9), body);
      const piece = addPiece(g, body, { dmg: 18, ref: 7 });
      const table = define({ id: 'table', name: 'la table', aliases: ['table', 'tablée', 'meuble'], affordances: ['flip'], pieces: [piece], where: () => g.position, material: 'wood', fuel: 40, radius: 1.2, height: 0.9, tags: ['shield'] });
      table.onCharred = () => shatterProp(table);
    }

    // ---------- Pile de caisses ----------
    {
      const crateMat = toon('#c08a4e');
      const diagGeo = new THREE.BoxGeometry(0.1, 1.0, 0.02);
      const crates = [];
      const base = new THREE.Vector3(-3.2, 0, -3.4);
      const center = new THREE.Vector3(-3.2, 1.0, -3.4);
      const layout = [[-0.85, 0], [0, 0], [0.85, 0], [-0.42, 1], [0.42, 1], [0, 2]];
      layout.forEach(([dx, row], i) => {
        const g = new THREE.Group();
        // (caisses procédurales conservées : la box_small KayKit, claire, lisait mal devant la cheminée)
        g.add(new THREE.Mesh(crateGeo, crateMat));
        for (const y of [-0.32, 0.32]) { const s = new THREE.Mesh(slatGeo, darkWood); s.position.y = y; s.userData.noOutline = true; g.add(s); }
        const diag = new THREE.Mesh(diagGeo, darkWood); diag.rotation.z = Math.PI / 4; diag.position.z = 0.41; diag.userData.noOutline = true; g.add(diag);
        shadow(g, false); addOutline(g);
        const p = new THREE.Vector3(base.x + dx, 0.4 + row * 0.8, base.z + (i % 2) * 0.05);
        g.position.copy(p); g.rotation.y = (i * 0.37) % 0.2 - 0.1;
        scene.add(g);
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation(g.quaternion).setCcdEnabled(true));
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4).setDensity(0.7).setFriction(0.7), body);
        crates.push(addPiece(g, body, { dmg: 9, ref: 7 }));
      });
      const pile = define({
        id: 'caisses', name: 'la pile de caisses', aliases: ['caisse', 'caisses', 'carton', 'boîte', 'boites', 'cageot', 'pile'],
        affordances: ['throw', 'topple'], pieces: crates, where: () => base, pos: (out = new THREE.Vector3()) => out.copy(center),
        material: 'wood', fuel: 40, radius: 1.3, height: 2.4, tags: ['grabbable'],
      });
      pile.onCharred = () => shatterProp(pile);
    }

    // ---------- Marmite ----------
    {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), iron);
      pot.material = toon('#3b3532', { side: THREE.DoubleSide }); pot.position.y = 0.2; g.add(pot);
      const soup = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), toon('#d6912c', { emissive: '#4a2200' })); soup.rotation.x = -Math.PI / 2; soup.position.y = 0.56; soup.userData.noOutline = true; soup.userData.keep = true; g.add(soup);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), iron); l.position.set(Math.cos(a) * 0.4, -0.3, Math.sin(a) * 0.4); g.add(l); }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 6, 18), iron); rim.rotation.x = Math.PI / 2; rim.position.y = 0.6; g.add(rim);
      shadow(g); addOutline(g);
      const pos = new THREE.Vector3(3.3, 0.55, -3.0);
      g.position.copy(pos);
      scene.add(g);
      const body = fixedBody(pos.x, pos.y, pos.z);
      world.createCollider(RAPIER.ColliderDesc.ball(0.6).setTranslation(0, 0.1, 0), body);
      const piece = addPiece(g, body, { dmg: 0 });
      define({
        id: 'marmite', name: 'la marmite', aliases: ['marmite', 'chaudron', 'soupe', 'ragoût', 'potage', 'cuve'], affordances: ['spill'], pieces: [piece], soup,
        where: () => pos, material: 'metal', radius: 0.6, height: 1.1, tags: ['conductive', 'hot', 'liquid:soup'], liquid: 'soup',
      });
    }

    // ---------- Piliers ----------
    [[-7.6, -0.6, 'gauche'], [7.6, -0.3, 'droite']].forEach(([x, z, side]) => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.6, 0.55), darkWood); g.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.85), wood); cap.position.y = 3.15; g.add(cap);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.8), wood); foot.position.y = -3.12; g.add(foot);
      for (const y of [-1.2, 1.4]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), iron); band.position.y = y; g.add(band); }
      shadow(g); addOutline(g);
      g.position.set(x, 3.3, z);
      scene.add(g);
      const body = fixedBody(x, 3.3, z);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.28, 3.3, 0.28).setDensity(1.4), body);
      const piece = addPiece(g, body, { dmg: 30, ref: 6 });
      piece.heavy = true;
      const pillar = define({
        id: `pilier_${side[0]}`, name: `le pilier de ${side}`, aliases: ['pilier', 'poutre', 'colonne', 'poteau', 'support'], affordances: ['collapse'], pieces: [piece], group: 'pilier',
        where: () => g.position, material: 'wood', fuel: 60, radius: 0.4, height: 6.6,
      });
      pillar.onCharred = (info) => { if (pillar.live) execute(pillar, 'collapse', nearestFighter(pillar.where()), null); };
    });

    // ---------- Étagère de bouteilles (verre, alcool inflammable) ----------
    ['#3f7d3a', '#8a4a1c', '#c9a13b', '#3f7d3a', '#a33b2a', '#c9a13b'].forEach((c, i) => {
      let m = new THREE.Group();
      if (!kk(m, ['bottle_A', 'bottle_B', 'bottle_A', 'bottle_C', 'bottle_B', 'bottle_A'][i], { y: -0.225, s: i === 3 ? 0.5 : 0.62, ry: i })) m = new THREE.Mesh(bottleGeo, toon(c));
      const p = new THREE.Vector3(4.6 - 1.75 + i * 0.7, 2.78, -4.75);
      m.position.copy(p);
      shadow(m, false); addOutline(m);
      scene.add(m);
      const body = fixedBody(p.x, p.y, p.z);
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.26, 0.12).setTranslation(0, 0.04, 0).setDensity(1.5).setRestitution(0.1), body);
      const piece = addPiece(m, body, { dmg: 8, ref: 8 });
      const bottle = define({
        id: `bouteille_${i + 1}`, name: 'une bouteille d\'eau-de-vie', aliases: ['bouteille', 'alcool', 'gnôle', 'eau-de-vie', 'rhum', 'flasque'],
        affordances: ['throw'], pieces: [piece], group: 'bouteille', where: () => m.position, material: 'glass', radius: 0.12, height: 0.6,
        tags: ['grabbable', 'liquid:alcohol', 'fragile'], liquid: 'alcohol',
      });
      piece.onImpact = (pt, by) => shatterGlass(bottle, pt, by, { liquid: 'alcohol', radius: 0.9 });
    });

    // ---------- Chopes sur le comptoir ----------
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(mugGeo, mugMat);
      const p = new THREE.Vector3(4.6 - 1.2 + i * 0.9, 1.46, -4.1);
      m.position.copy(p); m.rotation.y = -0.6 + i * 0.5;
      m.receiveShadow = true; m.castShadow = false; addOutline(m);
      scene.add(m);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z).setRotation(m.quaternion).setCcdEnabled(true));
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.14, 0.13).setDensity(1.2), body);
      const piece = addPiece(m, body, { dmg: 7, ref: 8 });
      const mug = define({
        id: `chope_${i + 1}`, name: 'une chope de bière', aliases: ['chope', 'choppe', 'verre', 'pinte', 'bock'],
        affordances: ['throw'], pieces: [piece], group: 'chope', where: () => m.position, material: 'glass', radius: 0.15, height: 0.3,
        tags: ['grabbable', 'liquid:beer', 'fragile'], liquid: 'beer',
      });
      piece.onImpact = (pt, by) => shatterGlass(mug, pt, by, { liquid: 'beer', radius: 0.7 });
    }

    // ---------- Tabourets (attrapables) ----------
    [[-8.2, 3.6], [8.4, 3.2]].forEach(([x, z], i) => {
      const g = new THREE.Group();
      if (!kk(g, 'stool', { y: -0.4, sx: 1.1, sy: 1.56, sz: 1.1, ry: i * 0.7 })) g.add(new THREE.Mesh(seatGeo, wood), new THREE.Mesh(legsGeo, darkWood));
      shadow(g, false); addOutline(g);
      g.position.set(x, 0.4, z);
      scene.add(g);
      const body = fixedBody(x, 0.4, z);
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.4, 0.4).setDensity(0.6).setRestitution(0.3), body);
      const piece = addPiece(g, body, { dmg: 12, ref: 7 });
      const stool = define({
        id: `tabouret_${i + 1}`, name: `le tabouret ${i ? 'de droite' : 'de gauche'}`, aliases: ['tabouret', 'chaise', 'siège', 'banc'],
        affordances: ['throw'], pieces: [piece], group: 'tabouret', where: () => g.position, material: 'wood', fuel: 24, radius: 0.42, height: 0.8, tags: ['grabbable'],
      });
      stool.onCharred = () => shatterProp(stool);
    });
  }

  // ---------- Débris : morceaux éphémères ----------
  const staveGeo = new THREE.BoxGeometry(0.16, 0.9, 0.06);
  const shardGeo = new THREE.TetrahedronGeometry(0.09, 0);
  function spawnDebris(pos, n, { color = '#9a6234', geo = staveGeo, speed = 7, life = 3.5, half = [0.08, 0.45, 0.03] } = {}) {
    for (let i = 0; i < n; i++) {
      const mat = toon(color, { transparent: true });
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      scene.add(m);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x + Math.cos(a) * 0.3, pos.y + Math.random() * 0.4, pos.z + Math.sin(a) * 0.3)
        .setLinvel(Math.cos(a) * speed * (0.6 + Math.random() * 0.6), 4 + Math.random() * 5, Math.sin(a) * speed * (0.6 + Math.random() * 0.6))
        .setAngvel({ x: Math.random() * 20 - 10, y: Math.random() * 20 - 10, z: Math.random() * 20 - 10 }));
      world.createCollider(RAPIER.ColliderDesc.cuboid(...half).setDensity(0.5).setRestitution(0.3), body);
      const p = { mesh: m, body, dmg: 0, armed: false, fadeAt: ctx.time + life, fading: 0, colliders: [body.collider(0)], dead: false, mats: [mat], debris: true };
      dynamics.push(p);
    }
  }

  // ---------- Requêtes ----------
  const live = () => registry.filter((p) => p.live && p.affordances.length);
  const byId = (id) => registry.find((p) => p.id === id);
  function nearest(group, target) {
    const tp = target.root ? target.root.position : target.pos();
    let best = null, bd = Infinity;
    for (const p of registry) {
      if (!p.live || !p.affordances.length || (p.group || p.id) !== group) continue;
      const w = p.where(); const d = Math.hypot(w.x - tp.x, w.z - tp.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function nearestFighter(pos) {
    let best = null, bd = Infinity;
    for (const f of Object.values(ctx.fighters)) { if (f.ko) continue; const d = Math.hypot(f.root.position.x - pos.x, f.root.position.z - pos.z); if (d < bd) { bd = d; best = f; } }
    return best || ctx.fighters.p1;
  }
  function describe(fighters) {
    return live().map((p) => {
      const w = p.where();
      const dist = (f) => Math.hypot(w.x - f.root.position.x, w.z - f.root.position.z).toFixed(1);
      return { id: p.id, nom: p.name, matiere: p.material, etats: [...p.states.keys()], alias: p.aliases.slice(0, 4), verbes: p.affordances, distance_p1: +dist(fighters.p1), distance_p2: +dist(fighters.p2) };
    });
  }
  const grabbables = () => registry.filter((p) => p.live && p.tags.has('grabbable') && p.pieces.some((q) => !q.dead && !q.used));

  // ---------- Casses ----------
  function shatterProp(prop, { color = '#3a2a20' } = {}) {
    if (!prop.alive && !prop.live) return;
    prop.live = false;
    const c = prop.pos(new THREE.Vector3());
    for (const p of prop.pieces) if (!p.dead) removePiece(p);
    ctx.entities.remove(prop);
    spawnDebris(c, 7, { color, speed: 3 });
    ctx.fx.dust(c, 14);
    sfx.crack();
    ctx.events.emit('prop:break', { prop, cause: 'charred' });
  }
  function shatterGlass(prop, pt, by, { liquid, radius }) {
    if (!prop.alive) return;
    const p = prop.pieces[0];
    const at = pt ? pt.clone() : p.mesh.position.clone();
    removePiece(p);
    prop.live = false;
    ctx.entities.remove(prop);
    ctx.fx.sparks.burst(at.x, at.y, at.z, ['#f2fdff', '#cfe9ee', '#ffffff'], 18, 3, 0.18, { grav: -9, life: 0.6 });
    sfx.shatter();
    ctx.surfaces.spawn({ liquid, pos: at.setY(0), radius, by });
    ctx.floaterAt?.(at.clone().setY(0.8), liquid === 'alcohol' ? 'GLOU !' : 'SPLASH !', 'react');
    ctx.events.emit('prop:break', { prop, cause: 'shatter', by });
  }

  // ---------- Actions (déterministes) ----------
  function dropLustre(prop, target, by) {
    if (!prop.live) return Promise.resolve();
    prop.live = false;
    const p = prop.pieces[0];
    const w = prop.where();
    sfx.clang();
    ctx.fx.dust(prop.anchor.clone().setY(7.1), 14);
    ctx.events.emit('prop:action', { prop, verb: 'drop', by });
    if (prop.rope?.alive) { removePiece(prop.rope.pieces[0]); prop.rope.live = false; ctx.entities.remove(prop.rope); }
    return ctx.wait(0.35).then(() => {
      const aim = target.headPos().setY(2.4);
      makeDynamic(p, 14);
      p.fadeAt = Infinity; // le lustre reste au sol (métal conducteur pour les combos)
      p.body.setLinvel(ballistic(p.body.translation(), aim, 0.7), true);
      p.body.setAngvel({ x: 0, y: 4, z: (aim.x - w.x) > 0 ? -2 : 2 }, true);
      p.onHit = () => { sfx.clang(); };
      p.by = by;
      return ctx.wait(1.6);
    });
  }

  function throwPiece(prop, piece, target, by, T) {
    piece.used = true;
    makeDynamic(piece);
    piece.by = by;
    piece.flying = true; piece.launchedAt = ctx.time;
    const from = piece.body.translation();
    const aim = target.chestPos ? target.chestPos() : target.clone();
    const d = Math.hypot(aim.x - from.x, aim.z - from.z);
    T ??= THREE.MathUtils.clamp(d / 11, 0.5, 0.95);
    piece.body.setLinvel(ballistic(from, aim, T), true);
    piece.body.setAngvel({ x: 6, y: 3, z: 5 }, true);
    sfx.whoosh();
    return T;
  }
  // API souris : lancer libre (vitesse monde). `piece` (optionnel) : la pièce tenue par la souris
  // (déjà marquée used pendant la prise, ex. la caisse du haut de la pile).
  function launch(prop, vel, by, piece = prop.pieces.find((q) => !q.dead && !q.used)) {
    if (!piece || piece.dead) return false;
    piece.used = true; piece.by = by; piece.flying = true; piece.launchedAt = ctx.time;
    makeDynamic(piece);
    piece.body.setLinvel(vel, true);
    if (prop.pieces.every((q) => q.used || q.dead)) prop.live = false;
    return true;
  }
  async function throwAt(prop, target, by) {
    const piece = prop.pieces.find((q) => !q.dead && !q.used);
    if (!piece) return;
    const T = throwPiece(prop, piece, target, by);
    if (prop.pieces.every((q) => q.used || q.dead)) prop.live = false;
    await ctx.wait(T + 0.6);
  }

  async function execute(prop, verb, target, caster) {
    const tgt = target.chestPos();
    const w = prop.where();
    const by = caster?.id;
    ctx.events.emit('prop:action', { prop, verb, by, target: target.id });
    switch (verb) {
      case 'drop': {
        await dropLustre(prop, target, by);
        break;
      }
      case 'explode': {
        if (prop.id === 'tonneau_huile') await explodeBarrel(prop, by, { burning: true });
        else await burstBarrel(prop, target, by);
        await ctx.wait(1.2);
        break;
      }
      case 'flip': {
        prop.live = false;
        const p = prop.pieces[0];
        sfx.crack();
        makeDynamic(p);
        const from = p.body.translation();
        p.body.setTranslation({ x: from.x, y: from.y + 0.3, z: from.z }, true);
        const dir = new THREE.Vector3(tgt.x - from.x, 0, tgt.z - from.z).normalize();
        const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
        p.body.setLinvel(ballistic({ x: from.x, y: from.y + 0.3, z: from.z }, tgt.clone().setY(1.2), 0.8), true);
        p.body.setAngvel({ x: axis.x * 7, y: 1.5, z: axis.z * 7 }, true);
        p.by = by;
        ctx.fx.dust(new THREE.Vector3(from.x, 0.2, from.z), 16);
        await ctx.wait(1.8);
        break;
      }
      case 'throw': {
        if (prop.id !== 'caisses') { await throwAt(prop, target, by); break; }
        const remaining = prop.pieces.filter((c) => !c.used && !c.dead).sort((a, b) => b.body.translation().y - a.body.translation().y);
        const batch = remaining.slice(0, 2);
        for (let i = 0; i < batch.length; i++) {
          const c = batch[i];
          c.used = true;
          makeDynamic(c);
          c.by = by;
          const from = c.body.translation();
          const aim = tgt.clone().add(new THREE.Vector3(0, 0.2 * i, (i - 0.5) * 0.3));
          c.body.setLinvel(ballistic(from, aim, 0.75), true);
          c.body.setAngvel({ x: 6 - i * 12, y: 3, z: 5 }, true);
          sfx.whoosh();
          await ctx.wait(0.28);
        }
        // Les caisses du dessous perdent leur appui : elles deviennent dynamiques (sans dégâts)
        for (const c of prop.pieces) if (!c.used && !c.dead) { c.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); if (!dynamics.includes(c)) dynamics.push(c); }
        if (prop.pieces.every((c) => c.used || c.dead)) prop.live = false;
        prop.affordances = prop.live ? ['throw'] : [];
        await ctx.wait(1.4);
        break;
      }
      case 'topple': {
        prop.live = false;
        const dir = new THREE.Vector3(tgt.x - w.x, 0, tgt.z - w.z).normalize();
        prop.pieces.forEach((c, i) => {
          if (c.used || c.dead) return;
          c.used = true;
          makeDynamic(c);
          c.by = by;
          const from = c.body.translation();
          const reach = Math.min(0.95, 0.35 + from.y * 0.25);
          c.body.setLinvel(ballistic(from, tgt.clone().setY(0.9).addScaledVector(dir, -1.2 + i * 0.25), reach), true);
          c.body.setAngvel({ x: dir.z * 5, y: 1, z: -dir.x * 5 }, true);
        });
        sfx.crack();
        await ctx.wait(2);
        break;
      }
      case 'spill': {
        if (prop.id === 'tonneau_huile') { await spillOil(prop, target, by); break; }
        prop.live = false;
        const p = prop.pieces[0];
        const dir = new THREE.Vector3(tgt.x - w.x, 0, tgt.z - w.z).normalize();
        const q0 = p.mesh.quaternion.clone();
        const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
        const q1 = new THREE.Quaternion().setFromAxisAngle(axis, 1.25).multiply(q0);
        sfx.clang();
        await ctx.tween(0.35, (k) => { p.mesh.quaternion.slerpQuaternions(q0, q1, k * k); });
        prop.soup.visible = false;
        prop.tags.delete('hot'); prop.tags.delete('liquid:soup');
        sfx.splash();
        ctx.fx.soupWave(w.clone().setY(0.9), target.root.position.clone());
        await ctx.wait(0.7);
        ctx.surfaces.spawn({ liquid: 'soup', pos: target.root.position.clone().setY(0), radius: 1.35, by, hot: 20 });
        ctx.damage(target, 10, { from: w, kind: 'soup', by });
        ctx.bubble?.(target, 'Aïe, c\'est bouillant !', 1.8);
        await ctx.wait(1.0);
        break;
      }
      case 'collapse': {
        prop.live = false;
        const p = prop.pieces[0];
        const from = p.body.translation();
        const dir = new THREE.Vector3(tgt.x - from.x, 0, tgt.z - from.z).normalize();
        const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
        sfx.crack();
        ctx.fx.dust(new THREE.Vector3(from.x, 6.9, from.z), 24);
        ctx.addShake(0.25);
        // Charnière au pied du pilier : il bascule exactement vers la cible.
        const hinge = world.createImpulseJoint(
          RAPIER.JointData.revolute({ x: from.x, y: 0.28, z: from.z }, { x: 0, y: 0.28 - from.y, z: 0 }, { x: axis.x, y: axis.y, z: axis.z }),
          ground, p.body, true);
        hinge.setContactsEnabled(false);
        makeDynamic(p, 10);
        p.by = by;
        p.body.setAngvel({ x: axis.x * 1.5, y: 0, z: axis.z * 1.5 }, true);
        let freed = false;
        const free = () => { if (freed || p.dead) return; freed = true; world.removeImpulseJoint(hinge, true); };
        p.onHit = () => ctx.later(0.12, free);
        ctx.later(3, free);
        await ctx.wait(2.4);
        break;
      }
    }
  }

  // Tonneau de bière : éclate, souffle léger, vague de bière → flaque mouillée sous la cible.
  async function burstBarrel(prop, target, by) {
    if (!prop.alive) return;
    prop.live = false;
    const p = prop.pieces[0];
    const c = p.mesh.position.clone();
    removePiece(p);
    blast(c, { radius: 2.6, damage: 16, force: 10, by, colors: ['#f2b440', '#fff4d6', '#d99a2b'], fire: false });
    spawnDebris(c, 8);
    sfx.splash();
    if (target) {
      ctx.fx.soupWave(c.clone().setY(0.9), target.root.position.clone(), ['#d99a2b', '#f7d774', '#fff4d6']);
      await ctx.wait(0.6);
      ctx.surfaces.spawn({ liquid: 'beer', pos: target.root.position.clone().setY(0), radius: 1.3, by });
    }
    ctx.surfaces.spawn({ liquid: 'beer', pos: c.setY(0), radius: 1.1, by });
  }

  // Tonneau d'huile : explosion + flaque d'huile en feu (la « Flambée »).
  async function explodeBarrel(prop, by, { burning = true } = {}) {
    if (!prop.alive) return;
    prop.live = false;
    const p = prop.pieces[0];
    const c = p.mesh.position.clone();
    removePiece(p);
    blast(c, { radius: 3.6, damage: 26, force: 14, by, fire: burning });
    spawnDebris(c, 9, { color: '#4a3b2c' });
    const s = ctx.surfaces.spawn({ liquid: 'oil', pos: c.clone().setY(0), radius: 2.2, by });
    if (burning && s) ctx.chem.addState(s, 'burning', { by, silent: true });
  }

  async function spillOil(prop, target, by) {
    prop.affordances = ['explode'];
    const w = prop.where();
    sfx.splash();
    ctx.fx.soupWave(w.clone().setY(0.9), target.root.position.clone(), ['#3a3326', '#8a7a3a', '#5a4a2a']);
    await ctx.wait(0.7);
    ctx.surfaces.spawn({ liquid: 'oil', pos: target.root.position.clone().setY(0), radius: 1.4, by });
    ctx.floaterAt?.(target.headPos(), 'GLISSANT !', 'react');
    await ctx.wait(0.6);
  }

  function blastImpulse(c, radius = 2, force = 6) {
    for (const p of dynamics) {
      if (p.dead || !p.body.isDynamic()) continue;
      const t = p.body.translation();
      const d = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z);
      if (d > radius || d < 1e-3) continue;
      const k = (1 - d / radius) * force * p.body.mass();
      p.body.applyImpulse({ x: (t.x - c.x) / d * k, y: k * 0.6, z: (t.z - c.z) / d * k }, true);
    }
  }

  // Souffle : particules, secousse, impulsion radiale, dégâts dégressifs ; fire=true enflamme tout dans le rayon.
  function blast(c, { radius = 3, damage = 20, force = 10, by = null, fire = true, colors = ['#ffb03a', '#ff5a1f', '#fff1a8'] } = {}) {
    ctx.fx.explosion(c, colors, radius);
    sfx.boom(radius / 3);
    ctx.addShake(0.75);
    blastImpulse(c, radius, force);
    const crates = byId('caisses');
    if (crates?.live && crates.where().distanceTo(c) < radius + 0.5) {
      crates.live = false;
      for (const cr of crates.pieces) if (!cr.used && !cr.dead) { cr.used = true; cr.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); cr.fadeAt = ctx.time + 9; if (!dynamics.includes(cr)) dynamics.push(cr); const t = cr.body.translation(); const d = Math.max(0.5, Math.hypot(t.x - c.x, t.z - c.z)); cr.body.applyImpulse({ x: (t.x - c.x) / d * 3, y: 2, z: (t.z - c.z) / d * 3 }, true); }
    }
    for (const f of Object.values(ctx.fighters)) {
      const fp = f.chestPos();
      const d = Math.hypot(fp.x - c.x, fp.z - c.z);
      if (d < radius) ctx.damage(f, Math.round(damage * (1 - (d / radius) * 0.6)), { from: c, kind: 'blast', element: fire ? 'fire' : null, by });
    }
    if (fire) for (const e of ctx.entities.near(c, radius * 0.8)) if (e.kind !== 'surface') ctx.chem.apply(e, 'fire', { by, power: 6, pos: c });
  }

  // ---------- Pas de simulation ----------
  const eventQueue = new RAPIER.EventQueue(true);
  const hitPt = new THREE.Vector3();
  function step(dt) {
    world.timestep = dt;
    for (const p of dynamics) if (p.armed && !p.dead) { const v = p.body.linvel(); p.preSpeed = Math.hypot(v.x, v.y, v.z); }
    world.step(eventQueue);
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const fighter = ctx.fighterByCollider(h1) || ctx.fighterByCollider(h2);
      const piece = pieces.get(h1) || pieces.get(h2);
      if (!piece || piece.dead) return;
      const other = pieces.get(h1) === piece ? pieces.get(h2) : pieces.get(h1);
      if (piece.flying && piece.onImpact && other !== piece && ctx.time - piece.launchedAt > 0.12) {
        piece.flying = false;
        const t = piece.body.translation(); hitPt.set(t.x, t.y, t.z);
        const by = piece.by;
        if (fighter && piece.dmg) ctx.damage(fighter, piece.dmg, { from: hitPt.clone(), kind: 'prop', by });
        ctx.later(0, () => piece.onImpact(hitPt.clone(), by));
        return;
      }
      if (!fighter) {
        const v = piece.body.linvel(); const s = Math.hypot(v.x, v.y, v.z);
        const s2 = Math.max(s, piece.preSpeed || 0);
        if (s2 > 4 && (!piece.lastThud || ctx.time - piece.lastThud > 0.3)) { piece.lastThud = ctx.time; sfx.thud(); ctx.fx.dust(piece.mesh.position.clone().setY(0.2), 6); ctx.addShake(Math.min(0.3, s * 0.025)); }
        return;
      }
      if (!piece.armed || !piece.dmg) return;
      const v = piece.body.linvel();
      const speed = Math.max(piece.preSpeed || 0, Math.hypot(v.x, v.y, v.z));
      if (speed < 2.2) return;
      piece.armed = false;
      const dmg = Math.round(piece.dmg * THREE.MathUtils.clamp(speed / piece.ref, 0.5, 1.25));
      piece.onHit?.();
      ctx.damage(fighter, dmg, { from: piece.mesh.position.clone(), kind: 'prop', by: piece.by });
      if (piece.heavy) fighter.flatten?.(0.55);
    });
    for (const p of dynamics) if (!p.dead) syncMesh(p);
  }

  function update(dt, time) {
    const l = byId('lustre');
    if (l?.live) { l.pieces[0].mesh.rotation.z = Math.sin(time * 1.1) * 0.03; l.pieces[0].mesh.rotation.x = Math.sin(time * 0.8) * 0.02; }
    for (let i = dynamics.length - 1; i >= 0; i--) {
      const p = dynamics[i];
      if (time < p.fadeAt) continue;
      if (!p.mats) {
        p.mats = [];
        p.mesh.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.material = o.material.clone(); o.material.transparent = true; p.mats.push(o.material); } });
        p.outlineMats = fadeOutlineMaterial(p.mesh);
      }
      p.fading += dt;
      const a = Math.max(0, 1 - p.fading / 0.8);
      for (const m of p.mats) m.opacity = a;
      for (const m of p.outlineMats || []) m.uniforms.uOpacity.value = a;
      p.mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      if (a <= 0) removePiece(p);
    }
  }

  function reset() {
    for (const p of [...dynamics]) removePiece(p);
    for (const pr of registry) for (const p of pr.pieces) removePiece(p);
    for (const m of extras) m.removeFromParent();
    extras.length = 0;
    for (const pr of registry) ctx.entities.remove(pr);
    registry.length = 0;
    dynamics.length = 0;
    build();
  }

  const entityByCollider = (h) => pieces.get(h)?.prop || null;

  build();
  return {
    registry, live, byId, nearest, nearestFighter, describe, execute, blast, blastImpulse, explodeBarrel, burstBarrel, dropLustre,
    step, update, dynamics, reset, grabbables, launch, throwAt, entityByCollider, spawnDebris, shatterProp,
    // fabrique (invocations, possession) : accessoires créés hors de build(), effacés au reset
    define, addPiece, makeDynamic, removePiece, syncMesh, shatterGlass,
  };
}
