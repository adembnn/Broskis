// Moteur commun des maps (lot LM, plan/lots/LM-maps.md §Moteur commun).
// Charge une définition de map (types.ts), pose les colliders Rapier (fixes pour les tuiles/le sol,
// dynamiques une fois "réveillés" pour les props), écoute les tirs pour déclencher le décor, gère les
// 3 zones de KO/vide, place les joueurs, exécute les événements périodiques + la mort subite, et habille
// chaque map avec la direction « Vinyle » (tokens.maps.<id> : ciel, brouillard, lumières, teinte du décor).
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Category, Ctx, MapId, PlayerId, Vec3, Weapon } from '../../core/types';
import { buildArchipelDef } from './archipel';
import { buildCuisineDef } from './cuisine';
import { buildGalionDef } from './galion';
import { instantiate, instantiateNode, localBounds } from './loader';
import { flatToon, hazardDecal, outlineTree, type Grade } from './toon';
import {
  archipelTokens, cuisineTokens, galionTokens, LOCAL_TOKENS, palette, rendu,
  type ArchipelTokens, type CuisineTokens, type GalionTokens, type MapPalette,
} from './tokens';
import type {
  ColliderSpec, GroundPiece, MapDef, PropBuild, PropKind, PropSpec, StaticCollider, TileSpec,
} from './types';

// ---------------------------------------------------------------------------
// Réglages du moteur (algorithmes, pas des valeurs visuelles -> pas dans les tokens).
// ---------------------------------------------------------------------------
const MAX_TRIGGERS_PER_SHOT = 3;
const RAY_STEP = 0.05;       // s, pas d'échantillonnage de la trajectoire simulée
const RAY_MAX_TIME = 3;      // s, résolution "3 s maximum" du lot
const GRAVITY = 9.81;

type Vector3Like = { x: number; y: number; z: number };
const v3 = (v: Vec3): Vector3Like => ({ x: v[0], y: v[1], z: v[2] });

interface TileRuntime {
  index: number;
  islandId: string;
  ring: number;
  crumble?: { hitsRequired: number; requireCategory?: Category };
  hits: number;
  dead: boolean;
  fallen: boolean;
  body: RAPIER.RigidBody;
  colliderHandle: number;
  topY: number;
  pos: Vec3;
}

interface PropRuntime {
  id: string;
  spec: PropSpec;
  kind: PropKind;
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody;
  colliderHandle: number;
  worldPos: THREE.Vector3;
  dead: boolean;
  hits: number;
  cooldownUntil: number;
  launchIdx: number;
  animT: number;
  animPhase: 'idle' | 'active';
  restYaw: number;
}

interface Transient { mesh: THREE.Object3D; body: RAPIER.RigidBody; expiresAt: number }

interface LoadedMap {
  def: MapDef;
  group: THREE.Group;
  center: THREE.Vector3;
  mapPalette: MapPalette;
  grade: Grade;
  tileMesh: THREE.InstancedMesh | null;
  tiles: TileRuntime[];
  props: Map<string, PropRuntime>;
  triggerByCollider: Map<number, { kind: 'tile' | 'prop'; id: string }>;
  groundColliders: Set<number>;
  transient: Transient[];
  ringLevel: number;          // prochain anneau (archipel) à faire tomber ; <1 = plus rien à faire tomber
  hazardDecals: Map<number, THREE.Mesh>; // tuile -> rayures d'alerte (permanent pour les fêlées, temporaire pour l'anneau)
  crows: THREE.Group[];
  lights: THREE.Light[];
  practical?: { light: THREE.PointLight; base: number; vacillement: number };
  tiltCurrent: number;        // gîte du galion en cours (radians)
  camRollApplied: number;     // ce que CE système a ajouté à camera.rotation.z (pour un retrait propre)
  waveRings: THREE.Mesh[];
  announceWave: THREE.Mesh | null;
  lightningNextAt: number;
  lightningLight: THREE.PointLight | null;
  projectileInFlightUntil: number;
  spongeMesh: THREE.Group | null;
  spongeShadow: THREE.Mesh | null;
  spongeAnim: { t: number; dur: number; from: THREE.Vector3; to: THREE.Vector3 } | null;
  suddenDeathActive: boolean;
  safeRadius: number;
  pendingDropXZ: [number, number] | null;
  safeRing: THREE.Mesh | null;
  killed: Set<PlayerId>;
}

let current: LoadedMap | null = null;
let ctxRef: Ctx | null = null;

// ---------------------------------------------------------------------------
// Ciel, brouillard, lumières — lus depuis tokens.maps.<id> (direction « Vinyle »).
// ---------------------------------------------------------------------------
function buildSkyDome(haut: string, horizon: string, bas: string): THREE.Mesh {
  const geo = new THREE.SphereGeometry(220, 20, 14);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const cHaut = new THREE.Color(haut), cHor = new THREE.Color(horizon), cBas = new THREE.Color(bas);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 220; // -1..1
    if (y >= 0) c.copy(cHor).lerp(cHaut, THREE.MathUtils.smoothstep(y, 0, 1));
    else c.copy(cHor).lerp(cBas, THREE.MathUtils.smoothstep(-y, 0, 1));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.userData.noOutline = true;
  return mesh;
}

interface CommonTokens {
  ciel: { haut: string; horizon: string; bas: string };
  brouillard: { couleur: string; debut: number; fin: number };
  hemi: { ciel: string; sol: string; intensite: number };
  principale: ArchipelTokens['principale'] | CuisineTokens['principale'];
  pratique: { couleur: string; intensite: number; portee: number; decroissance: number; vacillement: number };
  palette: MapPalette;
  decor: { saturation: number; teinte: string };
}

function tokensFor(mapId: MapId): CommonTokens {
  if (mapId === 'galion') return galionTokens();
  if (mapId === 'cuisine') return cuisineTokens();
  return archipelTokens();
}

function buildLights(ctx: Ctx, map: LoadedMap, tk: CommonTokens) {
  const hemi = new THREE.HemisphereLight(tk.hemi.ciel, tk.hemi.sol, tk.hemi.intensite);
  map.group.add(hemi);
  map.lights.push(hemi);

  const p = tk.principale;
  let key: THREE.Light;
  if (p.type === 'spot') {
    const spot = new THREE.SpotLight(p.couleur, p.intensite, 0, p.angle, p.penombre, p.decroissance);
    spot.position.set(p.position[0], p.position[1], p.position[2]);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    map.group.add(spot, spot.target);
    key = spot;
  } else {
    const dir = new THREE.DirectionalLight(p.couleur, p.intensite);
    dir.position.set(p.position[0], p.position[1], p.position[2]);
    dir.target.position.set(0, 0, 0);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const camSize = 26; // couvre les 3 maps (archipel ~13, galion ~7, cuisine ~21 de demi-largeur)
    Object.assign(dir.shadow.camera, { left: -camSize, right: camSize, top: camSize, bottom: -camSize, near: 1, far: 80 });
    map.group.add(dir, dir.target);
    key = dir;
  }
  map.lights.push(key);

  const pt = new THREE.PointLight(tk.pratique.couleur, tk.pratique.intensite, tk.pratique.portee, tk.pratique.decroissance);
  pt.position.set(0, 2.4, 0);
  map.group.add(pt);
  map.practical = { light: pt, base: tk.pratique.intensite, vacillement: tk.pratique.vacillement };
  map.lights.push(pt);

  ctx.three.scene.fog = new THREE.Fog(tk.brouillard.couleur, tk.brouillard.debut, tk.brouillard.fin);
  ctx.three.scene.background = new THREE.Color(tk.brouillard.couleur);
  const dome = buildSkyDome(tk.ciel.haut, tk.ciel.horizon, tk.ciel.bas);
  map.group.add(dome);
}

// ---------------------------------------------------------------------------
// Construction procédurale (aucun modèle correspondant dans les packs disponibles).
// Couleurs = la palette de LA map courante (jamais de teinte inventée hors tokens).
// ---------------------------------------------------------------------------
function darkenHex(hex: string, factor: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(factor).getHexString()}`;
}

function buildProcedural(shape: Exclude<PropBuild, { kind: 'model' }>['shape'], mp: MapPalette, grade: Grade, override?: string): THREE.Group {
  const g = new THREE.Group();
  const main = flatToon(override ?? mp.accent, grade);
  const dark = flatToon(darkenHex(mp.matiere, 0.6), grade);
  const hot = flatToon(palette.danger, {}); // jamais désaturé : c'est un signal, pas du décor
  switch (shape) {
    case 'catapult': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), dark);
      base.position.y = 0.2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.22), main);
      arm.position.set(0, 0.9, 0);
      arm.rotation.x = -0.5;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), dark);
      cup.position.set(0, 1.7, -0.75);
      g.add(base, arm, cup);
      break;
    }
    case 'toaster': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 1.8), flatToon(mp.matiere, grade));
      body.position.y = 1;
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.2), hot);
      lever.position.set(1.1, 1.9, 0.7);
      g.add(body, lever);
      break;
    }
    case 'rollingPin': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 12), main);
      const handleGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 8);
      const h1 = new THREE.Mesh(handleGeo, dark); h1.position.y = 1.9;
      const h2 = new THREE.Mesh(handleGeo, dark); h2.position.y = -1.9;
      g.add(body, h1, h2);
      break;
    }
    case 'axisStripe': {
      const plane = hazardDecal(1, 1);
      g.add(plane);
      break;
    }
    case 'giantFallback': {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), flatToon(override ?? mp.matiere, grade));
      g.add(rock);
      break;
    }
  }
  return g;
}

async function buildVisual(build: PropBuild, mp: MapPalette, grade: Grade): Promise<THREE.Object3D> {
  if (build.kind === 'model') {
    const obj = build.node ? await instantiateNode(build.url, build.node, grade) : await instantiate(build.url, grade);
    return obj ?? buildProcedural('giantFallback', mp, grade);
  }
  return buildProcedural(build.shape, mp, grade, build.color);
}

function firstMesh(obj: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  obj.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
  return found;
}

// ---------------------------------------------------------------------------
// Colliders
// ---------------------------------------------------------------------------
function colliderDesc(RAPIER_NS: typeof RAPIER, spec: ColliderSpec, scale: number): RAPIER.ColliderDesc {
  const off = spec.offset;
  const desc = spec.type === 'box'
    ? RAPIER_NS.ColliderDesc.cuboid(spec.hx * scale, spec.hy * scale, spec.hz * scale)
    : RAPIER_NS.ColliderDesc.cylinder(spec.halfHeight * scale, spec.radius * scale);
  if (off) desc.setTranslation(off[0] * scale, off[1] * scale, off[2] * scale);
  if (spec.type === 'cylinder' && spec.rollAxisZ) {
    // Couché : bascule le collider de 90° autour de Z, EXACTEMENT comme le mesh (`lieOnSide` sur le
    // PropSpec fait `obj.rotation.z = PI/2`) — sinon le collider et le visuel roulent sur des axes
    // différents. À yaw 0, l'axe long devient X, ce qui correspond à la formule de roulis de wakeProp().
    const half = Math.SQRT1_2;
    desc.setRotation({ x: 0, y: 0, z: half, w: half });
  }
  return desc;
}

function makeFixedBody(ctx: Ctx, pos: Vec3, yawRad = 0): RAPIER.RigidBody {
  const RAPIER_NS = ctx.physics.RAPIER;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRad);
  const desc = RAPIER_NS.RigidBodyDesc.fixed().setTranslation(pos[0], pos[1], pos[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  return ctx.physics.world.createRigidBody(desc);
}

// ---------------------------------------------------------------------------
// Chargement d'une map
// ---------------------------------------------------------------------------
function pickBuilder(mapId: MapId): () => MapDef {
  if (mapId === 'galion') return buildGalionDef;
  if (mapId === 'cuisine') return buildCuisineDef;
  return buildArchipelDef;
}

function unloadMap(ctx: Ctx) {
  if (!current) return;
  const world = ctx.physics.world;
  for (const t of current.tiles) world.removeRigidBody(t.body);
  for (const p of current.props.values()) world.removeRigidBody(p.body);
  for (const tr of current.transient) world.removeRigidBody(tr.body);
  ctx.three.scene.remove(current.group);
  ctx.three.scene.fog = null;
  current = null;
}

async function buildTiles(ctx: Ctx, map: LoadedMap, def: MapDef) {
  if (!def.tiles.length || !def.tileModel || !def.tileHalfExtents) return;
  const template = await buildVisual(def.tileModel, map.mapPalette, map.grade);
  const mesh = firstMesh(template);
  if (!mesh) return;
  const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, def.tiles.length);
  im.castShadow = false;
  im.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const [hx, hy, hz] = def.tileHalfExtents;
  def.tiles.forEach((tile: TileSpec, i: number) => {
    m4.makeTranslation(tile.pos[0], tile.pos[1], tile.pos[2]);
    im.setMatrixAt(i, m4);
    const body = makeFixedBody(ctx, tile.pos);
    const desc = ctx.physics.RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, -hy, 0).setFriction(0.9);
    const collider = ctx.physics.world.createCollider(desc, body);
    const rt: TileRuntime = {
      index: i, islandId: tile.islandId, ring: tile.ring, crumble: tile.crumble, hits: 0,
      dead: false, fallen: false, body, colliderHandle: collider.handle, topY: tile.pos[1], pos: tile.pos,
    };
    map.tiles.push(rt);
    map.groundColliders.add(collider.handle);
    if (tile.crumble) {
      map.triggerByCollider.set(collider.handle, { kind: 'tile', id: `tile:${i}` });
      const decal = hazardDecal(hx * 1.9, hz * 1.9);
      decal.position.set(tile.pos[0], tile.pos[1] + 0.02, tile.pos[2]);
      map.group.add(decal);
      map.hazardDecals.set(i, decal);
    }
  });
  map.group.add(im);
  map.tileMesh = im;
}

async function buildGround(ctx: Ctx, map: LoadedMap, pieces: GroundPiece[]) {
  for (const piece of pieces) {
    const obj = await buildVisual(piece.build, map.mapPalette, map.grade);
    obj.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
    if (piece.yaw) obj.rotation.y = piece.yaw;
    if (piece.scale) obj.scale.setScalar(piece.scale);
    if (piece.outline) outlineTree(obj);
    map.group.add(obj);
    if (piece.collider) {
      const body = makeFixedBody(ctx, piece.pos, piece.yaw ?? 0);
      const desc = colliderDesc(ctx.physics.RAPIER, piece.collider, piece.scale ?? 1);
      const collider = ctx.physics.world.createCollider(desc, body);
      map.groundColliders.add(collider.handle);
    }
  }
}

function buildStatic(ctx: Ctx, map: LoadedMap, colliders: StaticCollider[]) {
  for (const sc of colliders) {
    const body = makeFixedBody(ctx, sc.pos);
    const desc = colliderDesc(ctx.physics.RAPIER, sc.collider, 1);
    const collider = ctx.physics.world.createCollider(desc, body);
    map.groundColliders.add(collider.handle);
  }
}

async function buildProps(ctx: Ctx, map: LoadedMap, specs: PropSpec[]) {
  for (const spec of specs) {
    const obj = await buildVisual(spec.build, map.mapPalette, map.grade);
    obj.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    const yaw = spec.yaw ?? 0;
    obj.rotation.y = yaw;
    if (spec.lieOnSide) obj.rotation.z = Math.PI / 2;
    if (spec.scale) obj.scale.setScalar(spec.scale);
    if (spec.kind !== 'decor') outlineTree(obj);
    if (spec.kind === 'cannon' && spec.cannonAxis && spec.cannonRange) {
      const dir = new THREE.Vector3(spec.cannonAxis[0], 0, spec.cannonAxis[2]).normalize();
      const stripe = hazardDecal(0.6, spec.cannonRange);
      stripe.position.set(dir.x * spec.cannonRange * 0.5, 0.02, dir.z * spec.cannonRange * 0.5);
      stripe.rotation.y = Math.atan2(dir.x, dir.z);
      obj.add(stripe);
    }
    map.group.add(obj);
    const isSensor = spec.kind === 'launcher' || spec.kind === 'sweeper';
    const body = makeFixedBody(ctx, spec.pos, yaw);
    const desc = colliderDesc(ctx.physics.RAPIER, spec.collider, spec.scale ?? 1);
    if (isSensor) desc.setSensor(true);
    const collider = ctx.physics.world.createCollider(desc, body);
    const rt: PropRuntime = {
      id: spec.id, spec, kind: spec.kind, mesh: obj, body, colliderHandle: collider.handle,
      worldPos: new THREE.Vector3(spec.pos[0], spec.pos[1], spec.pos[2]), dead: false, hits: 0,
      cooldownUntil: 0, launchIdx: 0, animT: 0, animPhase: 'idle', restYaw: yaw,
    };
    map.props.set(spec.id, rt);
    map.triggerByCollider.set(collider.handle, { kind: 'prop', id: spec.id });
    if (spec.kind !== 'decor') map.groundColliders.add(collider.handle);
  }
}

// ---------------------------------------------------------------------------
// Archipel : corbeaux d'encre + îles lointaines en silhouette (sans contour, dans la brume).
// ---------------------------------------------------------------------------
function buildCrowSilhouette(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = flatToon(color, {});
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), mat);
  body.scale.set(1, 0.7, 1.6);
  const wingGeo = new THREE.ConeGeometry(0.22, 0.05, 3);
  const wL = new THREE.Mesh(wingGeo, mat); wL.rotation.z = Math.PI / 2; wL.position.set(-0.22, 0.02, 0);
  const wR = new THREE.Mesh(wingGeo, mat); wR.rotation.z = -Math.PI / 2; wR.position.set(0.22, 0.02, 0);
  g.add(body, wL, wR);
  g.traverse((o) => { (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).userData.noOutline = true); });
  return g;
}

function buildCrows(map: LoadedMap, tk: ArchipelTokens) {
  const outer = map.tiles.filter((t) => t.ring === map.ringLevel);
  const n = Math.min(tk.corbeaux.nombre, outer.length || tk.corbeaux.nombre);
  for (let i = 0; i < n; i++) {
    // Répartis sur l'anneau entier (les deux grandes îles), pas juste les premières tuiles trouvées.
    const t = outer[Math.floor((i / n) * outer.length)];
    const crow = buildCrowSilhouette(tk.corbeaux.couleur);
    const [x, y, z] = t ? t.pos : [0, 0, 0];
    crow.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.18, z + (Math.random() - 0.5) * 0.6);
    crow.rotation.y = Math.random() * Math.PI * 2;
    map.group.add(crow);
    map.crows.push(crow);
  }
}

async function flyCrows(ctx: Ctx, map: LoadedMap, envolMs: number) {
  const crows = map.crows.splice(0, map.crows.length);
  if (!crows.length) return;
  const dur = envolMs / 1000;
  await ctx.loop.tween(dur, (k) => {
    for (const c of crows) {
      c.position.y += 0.06;
      c.position.x += Math.sin(k * 6 + c.id) * 0.02;
      c.position.z -= 0.05;
      c.scale.setScalar(Math.max(0, 1 - k));
    }
  });
  for (const c of crows) c.removeFromParent();
}

function buildDistantIslands(map: LoadedMap, tk: ArchipelTokens) {
  const mat = flatToon(tk.palette.matiere, {});
  const { debut, fin } = tk.brouillard;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = debut + (fin - debut) * (0.45 + Math.random() * 0.35); // dans la brume, jamais noyées ni nettes
    const m = new THREE.Mesh(new THREE.ConeGeometry(3 + Math.random() * 2, 2 + Math.random(), 6), mat);
    m.position.set(Math.cos(a) * r, -1.5, Math.sin(a) * r);
    m.userData.noOutline = true;
    map.group.add(m);
  }
}

// ---------------------------------------------------------------------------
// Galion : mer de théâtre (3 couronnes découpées), vague d'annonce, éclairs, voiles ferlées.
// ---------------------------------------------------------------------------
function ringCrownGeometry(radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const teeth = 10;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = radius + (i % 2 === 0 ? 1.2 : 0);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * (radius - 1.4), y = Math.sin(a) * (radius - 1.4);
    if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 24);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function buildWaveRings(map: LoadedMap, tk: GalionTokens) {
  const mat = flatToon(tk.mer.ecume, {});
  tk.mer.couronnes.forEach((r) => {
    const mesh = new THREE.Mesh(ringCrownGeometry(r), mat);
    mesh.position.y = -0.3;
    mesh.userData.noOutline = true;
    map.group.add(mesh);
    map.waveRings.push(mesh);
  });
}

function updateWaveRings(map: LoadedMap, tk: GalionTokens, t: number) {
  map.waveRings.forEach((mesh, i) => {
    const speed = tk.mer.vitesses[i] ?? 0.03;
    mesh.rotation.y = t * speed;
    // La gîte incline "la mer" (pas la coque, dont le collider reste fixe) : même angle que la caméra.
    mesh.rotation.z = map.tiltCurrent;
    mesh.position.y = -0.3 + Math.sin(t * 0.8 + i * 2) * tk.mer.houle * 0.3;
  });
}

async function animateAnnounceWave(ctx: Ctx, map: LoadedMap, tk: GalionTokens) {
  const shape = new THREE.Shape();
  shape.moveTo(-4, 0);
  shape.quadraticCurveTo(0, tk.vague.hauteur * 0.7, 4, 0);
  shape.lineTo(4, -1); shape.lineTo(-4, -1); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 16);
  const mesh = new THREE.Mesh(geo, flatToon(tk.mer.ecume, {}));
  mesh.userData.noOutline = true;
  mesh.position.set(0, 0, -14);
  map.group.add(mesh);
  await ctx.loop.tween(1.6, (k) => {
    const s = Math.sin(k * Math.PI);
    mesh.scale.setScalar(0.4 + s * 0.8);
    mesh.position.z = -14 + k * 10;
    (mesh.material as THREE.Material).opacity = s;
  });
  mesh.removeFromParent();
}

function furlSails(hull: THREE.Object3D) {
  for (const name of ['sail-a', 'sail-b']) {
    const n = hull.getObjectByName(name);
    if (n) n.visible = false;
  }
}

function updateLightning(ctx: Ctx, map: LoadedMap, tk: GalionTokens, dt: number) {
  if (!map.lightningLight) return;
  // Décroissance calée sur `eclair.duree` (ms) : l'éclair s'éteint à peu près dans ce temps-là.
  map.lightningLight.intensity *= Math.max(0, 1 - dt / (tk.eclair.duree / 1000));
  const blocked = ctx.state.phase === 'aim' || ctx.loop.time < map.projectileInFlightUntil;
  if (blocked || ctx.loop.time < map.lightningNextAt) return;
  const [minMs, maxMs] = tk.eclair.intervalle;
  map.lightningNextAt = ctx.loop.time + (minMs + Math.random() * (maxMs - minMs)) / 1000;
  map.lightningLight.color.set(tk.eclair.fond);
  const peak = (map.practical?.base ?? 4) * tk.eclair.facteur;
  map.lightningLight.intensity = peak;
  // `flashs` éclairs rapprochés (simplifié : re-déclenchements espacés de `duree`, pas de minuterie dédiée).
  for (let i = 1; i < tk.eclair.flashs; i++) {
    ctx.loop.later((tk.eclair.duree / 1000) * i * 1.6, () => { if (map.lightningLight) map.lightningLight.intensity = peak; });
  }
}

// ---------------------------------------------------------------------------
// Cuisine : auréole de café (cercle d'encre au sol) + tasse géante fumante en fond.
// ---------------------------------------------------------------------------
function buildCoffeeRing(map: LoadedMap, tk: CuisineTokens) {
  const geo = new THREE.RingGeometry(Math.max(0.1, tk.cafe.rayon - tk.cafe.epaisseur), tk.cafe.rayon, 40).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: tk.cafe.couleur, transparent: true, opacity: tk.cafe.opacite, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  mesh.userData.noOutline = true;
  map.group.add(mesh);
}

function buildSteamingCup(map: LoadedMap, tk: CuisineTokens) {
  const mat = flatToon(tk.palette.matiere, {});
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.4, 4, 16), mat);
  cup.position.set(-40, 2, -30);
  cup.userData.noOutline = true;
  map.group.add(cup);
  const steamMat = flatToon(palette.matiere, {});
  (steamMat as THREE.MeshToonMaterial & { transparent: boolean; opacity: number }).transparent = true;
  (steamMat as THREE.MeshToonMaterial & { transparent: boolean; opacity: number }).opacity = 0.35;
  for (let i = 0; i < 3; i++) {
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.9 - i * 0.15, 6, 5), steamMat);
    wisp.position.set(-40, 5 + i * 1.4, -30);
    wisp.userData.noOutline = true;
    wisp.userData.steamPhase = i * 1.4;
    map.group.add(wisp);
    map.crows.push(wisp as unknown as THREE.Group); // réutilise la liste d'animables "flottants" (voir tick)
  }
}

// ---------------------------------------------------------------------------
// Réveil / comportements (tirs, contacts)
// ---------------------------------------------------------------------------
function wakeTile(ctx: Ctx, map: LoadedMap, t: TileRuntime) {
  if (t.fallen) return;
  t.fallen = true;
  t.body.setBodyType(ctx.physics.RAPIER.RigidBodyType.Dynamic, true);
  t.body.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: -1, z: (Math.random() - 0.5) * 1.5 }, true);
  t.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 3 }, true);
  map.groundColliders.delete(t.colliderHandle);
  const decal = map.hazardDecals.get(t.index);
  if (decal) { decal.removeFromParent(); map.hazardDecals.delete(t.index); }
}

function wakeProp(ctx: Ctx, prop: PropRuntime, opts: { impulse: number; dir?: THREE.Vector3; up?: number; rolling?: boolean }) {
  prop.body.setBodyType(ctx.physics.RAPIER.RigidBodyType.Dynamic, true);
  const dir = opts.dir ?? new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  prop.body.setLinvel({ x: dir.x * opts.impulse, y: opts.up ?? 3, z: dir.z * opts.impulse }, true);
  if (opts.rolling) {
    const axis = new THREE.Vector3(Math.cos(prop.restYaw), 0, -Math.sin(prop.restYaw));
    prop.body.setAngvel({ x: axis.x * opts.impulse * 2, y: 0, z: axis.z * opts.impulse * 2 }, true);
  } else {
    prop.body.setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 }, true);
  }
}

function nearestPlayer(ctx: Ctx, pos: THREE.Vector3, radius: number): PlayerId | null {
  let best: PlayerId | null = null;
  let bestD = radius;
  for (const p of ctx.state.players) {
    const d = Math.hypot(p.pos[0] - pos.x, p.pos[2] - pos.z);
    if (d <= bestD) { bestD = d; best = p.id; }
  }
  return best;
}

async function animateLaunch(ctx: Ctx, playerId: PlayerId, target: Vec3, duration: number, arc: number) {
  const player = ctx.state.players[playerId];
  const from: Vec3 = [...player.pos];
  await ctx.loop.tween(duration, (k) => {
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    player.pos = [
      from[0] + (target[0] - from[0]) * ease,
      from[1] + (target[1] - from[1]) * ease + Math.sin(k * Math.PI) * arc,
      from[2] + (target[2] - from[2]) * ease,
    ];
  });
}

function triggerLauncher(ctx: Ctx, prop: PropRuntime, playerHint?: PlayerId) {
  if (ctx.loop.time < prop.cooldownUntil) return;
  const pid = playerHint ?? nearestPlayer(ctx, prop.worldPos, prop.spec.triggerRadius ?? 1.2);
  if (pid == null) return;
  const dur = prop.spec.launchDuration ?? 0.6;
  prop.cooldownUntil = ctx.loop.time + dur + 0.4;
  const targets = prop.spec.launchTargets ?? [];
  if (!targets.length) return;
  const target = targets[prop.launchIdx % targets.length]!;
  prop.launchIdx += 1;
  void animateLaunch(ctx, pid, target, dur, prop.spec.launchArcHeight ?? 2.5);
  ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'launcher' });
}

function spawnCannonBall(ctx: Ctx, map: LoadedMap, prop: PropRuntime) {
  const axis = prop.spec.cannonAxis ?? [0, 0, 1];
  const dir = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const speed = 22;
  const start = prop.worldPos.clone().addScaledVector(dir, 1.4).add(new THREE.Vector3(0, 0.6, 0));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), flatToon(rendu.contour.encre, {}));
  mesh.castShadow = true;
  map.group.add(mesh);
  const RAPIER_NS = ctx.physics.RAPIER;
  const desc = RAPIER_NS.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z)
    .setLinvel(dir.x * speed, dir.y * speed, dir.z * speed).setCcdEnabled(true);
  const body = ctx.physics.world.createRigidBody(desc);
  ctx.physics.world.createCollider(RAPIER_NS.ColliderDesc.ball(0.22).setDensity(3), body);
  map.transient.push({ mesh, body, expiresAt: ctx.loop.time + 3 });
}

function triggerProp(ctx: Ctx, map: LoadedMap, prop: PropRuntime, weapon?: Weapon) {
  if (prop.dead) return;
  if (prop.kind === 'cannon') map.projectileInFlightUntil = ctx.loop.time + 1.4;
  switch (prop.kind) {
    case 'explosive': {
      prop.dead = true;
      map.groundColliders.delete(prop.colliderHandle);
      const dir = new THREE.Vector3(prop.mesh.position.x - map.center.x, 0, prop.mesh.position.z - map.center.z);
      wakeProp(ctx, prop, { impulse: prop.spec.impulse ?? 8, dir: dir.lengthSq() > 0 ? dir.normalize() : undefined, up: 5 });
      ctx.bus.emit('slowmo', { factor: 0.4, ms: 90 });
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'explosive' });
      break;
    }
    case 'knockable': {
      prop.dead = true;
      map.groundColliders.delete(prop.colliderHandle);
      wakeProp(ctx, prop, { impulse: prop.spec.impulse ?? 5, up: prop.spec.lieOnSide ? 0.5 : 2.5, rolling: prop.spec.lieOnSide });
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'knockable' });
      break;
    }
    case 'sweeper': {
      if (ctx.loop.time < prop.cooldownUntil) return;
      prop.cooldownUntil = ctx.loop.time + (prop.spec.sweepDuration ?? 1) * 2 + 1.2;
      prop.animT = 0;
      prop.animPhase = 'active';
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'sweeper' });
      break;
    }
    case 'cannon': {
      if (ctx.loop.time < prop.cooldownUntil) return;
      prop.cooldownUntil = ctx.loop.time + 1.4;
      spawnCannonBall(ctx, map, prop);
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'cannon' });
      break;
    }
    case 'launcher': {
      triggerLauncher(ctx, prop);
      break;
    }
    case 'decor': break;
  }
  void weapon;
}

function triggerTile(ctx: Ctx, map: LoadedMap, t: TileRuntime, weapon?: Weapon) {
  if (t.fallen || !t.crumble) return;
  if (t.crumble.requireCategory && weapon?.category !== t.crumble.requireCategory) return;
  t.hits += 1;
  if (t.hits < t.crumble.hitsRequired) {
    ctx.bus.emit('prop:triggered', { propId: `tile:${t.index}`, kind: 'crumble' });
    return;
  }
  wakeTile(ctx, map, t);
  ctx.bus.emit('prop:triggered', { propId: `tile:${t.index}`, kind: 'crumble' });
}

// ---------------------------------------------------------------------------
// Écoute des tirs : raycasts le long de la trajectoire simulée (au plus 3 objets réveillés / tir).
// ---------------------------------------------------------------------------
function resolveTargetByHandle(map: LoadedMap, handle: number): { tile?: TileRuntime; prop?: PropRuntime } | null {
  const t = map.tiles.find((x) => x.colliderHandle === handle);
  if (t) return { tile: t };
  const ref = map.triggerByCollider.get(handle);
  if (ref?.kind === 'prop') { const p = map.props.get(ref.id); return p ? { prop: p } : null; }
  return null;
}

function fireAt(ctx: Ctx, map: LoadedMap, target: { tile?: TileRuntime; prop?: PropRuntime }, weapon?: Weapon) {
  if (target.prop) triggerProp(ctx, map, target.prop, weapon);
  else if (target.tile) triggerTile(ctx, map, target.tile, weapon);
}

function simulateProjectile(ctx: Ctx, map: LoadedMap, weapon: Weapon, from: Vec3, vel: Vec3) {
  map.projectileInFlightUntil = ctx.loop.time + RAY_MAX_TIME;
  const RAPIER_NS = ctx.physics.RAPIER;
  const world = ctx.physics.world;
  const pos = v3(from);
  const v = v3(vel);
  const already = new Set<string>();
  let triggered = 0;
  for (let t = 0; t < RAY_MAX_TIME && triggered < MAX_TRIGGERS_PER_SHOT; t += RAY_STEP) {
    const next = { x: pos.x + v.x * RAY_STEP, y: pos.y + v.y * RAY_STEP, z: pos.z + v.z * RAY_STEP };
    v.y -= GRAVITY * RAY_STEP;
    const dx = next.x - pos.x, dy = next.y - pos.y, dz = next.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 1e-5) {
      const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
      const ray = new RAPIER_NS.Ray(pos, dir);
      const hit = world.castRay(ray, dist, true, undefined, undefined, undefined, undefined,
        (c) => map.triggerByCollider.has(c.handle));
      if (hit) {
        const ref = map.triggerByCollider.get(hit.collider.handle);
        if (ref && !already.has(ref.id)) {
          already.add(ref.id);
          const target = resolveTargetByHandle(map, hit.collider.handle);
          if (target) { fireAt(ctx, map, target, weapon); triggered++; }
        }
      }
    }
    pos.x = next.x; pos.y = next.y; pos.z = next.z;
    if (pos.y < map.def.voidY - 3) break;
  }
}

function proximityTrigger(ctx: Ctx, map: LoadedMap, pos: Vec3, weapon?: Weapon) {
  let triggered = 0;
  for (const prop of map.props.values()) {
    if (triggered >= MAX_TRIGGERS_PER_SHOT) break;
    if (prop.dead || prop.kind === 'decor') continue;
    const r = prop.spec.triggerRadius ?? 1.5;
    const dx = prop.worldPos.x - pos[0], dz = prop.worldPos.z - pos[2];
    if (dx * dx + dz * dz <= r * r) { triggerProp(ctx, map, prop, weapon); triggered++; }
  }
  // Éclat de zone (grenade) sur une dalle fêlée proche, même sans tir direct dessus.
  for (const t of map.tiles) {
    if (triggered >= MAX_TRIGGERS_PER_SHOT) break;
    if (t.fallen || !t.crumble) continue;
    const dx = t.pos[0] - pos[0], dz = t.pos[2] - pos[2];
    if (dx * dx + dz * dz <= 2.5 * 2.5) { triggerTile(ctx, map, t, weapon); triggered++; }
  }
}

// ---------------------------------------------------------------------------
// Événements périodiques (map:warn / map:event) + mort subite
// ---------------------------------------------------------------------------
function handleWarn(ctx: Ctx, map: LoadedMap, kind: string) {
  if (kind === 'ring' && map.tileMesh) {
    const [hx, , hz] = map.def.tileHalfExtents ?? [1, 0.5, 1.1547];
    map.tiles.forEach((t) => {
      if (t.fallen || t.ring !== map.ringLevel || map.hazardDecals.has(t.index)) return;
      const decal = hazardDecal(hx * 1.9, hz * 1.9);
      decal.position.set(t.pos[0], t.pos[1] + 0.02, t.pos[2]);
      map.group.add(decal);
      map.hazardDecals.set(t.index, decal);
    });
    if (map.crows.length) void flyCrows(ctx, map, archipelTokens().corbeaux.envol);
  } else if (kind === 'sponge' && map.spongeShadow) {
    const mat = map.spongeShadow.material as THREE.MeshToonMaterial;
    mat.opacity = 0.55;
    map.spongeAnim = { t: 0, dur: 1.1, from: new THREE.Vector3(-18, 0, 0), to: new THREE.Vector3(18, 0, 0) };
  } else if (kind === 'wave') {
    void animateAnnounceWave(ctx, map, galionTokens());
  } else if (kind === 'suddendeath-drop') {
    spawnSuddenDeathShadow(ctx, map);
  }
}

function handleEvent(ctx: Ctx, map: LoadedMap, kind: string) {
  if (kind === 'ring') {
    const level = map.ringLevel;
    map.tiles.filter((t) => !t.fallen && t.ring === level).forEach((t) => wakeTile(ctx, map, t));
    map.ringLevel = Math.max(0, level - 1);
    ctx.bus.emit('slowmo', { factor: 0.5, ms: 200 });
  } else if (kind === 'wave') {
    void animateWave(ctx, map);
  } else if (kind === 'sponge') {
    void animateSponge(ctx, map);
  } else if (kind === 'suddendeath') {
    map.suddenDeathActive = true;
    buildSafeRing(map);
  } else if (kind === 'suddendeath-shrink') {
    map.safeRadius = Math.max(4, map.safeRadius - 3);
    if (map.safeRing) map.safeRing.scale.setScalar(map.safeRadius);
  } else if (kind === 'suddendeath-drop') {
    if (map.pendingDropXZ) void dropAt(ctx, map, map.pendingDropXZ[0], map.pendingDropXZ[1]);
  }
}

async function animateWave(ctx: Ctx, map: LoadedMap) {
  const tk = galionTokens();
  const peak = THREE.MathUtils.degToRad(LOCAL_TOKENS.galion.tiltDeg);
  const dur = 2.6;
  await ctx.loop.tween(dur, (k) => {
    const s = Math.sin(k * Math.PI);
    map.tiltCurrent = peak * s;
    for (const p of ctx.state.players) p.pos = [p.pos[0] + Math.sin(map.tiltCurrent) * 0.05, p.pos[1], p.pos[2]];
  });
  map.tiltCurrent = 0;
  void tk;
}

async function animateSponge(ctx: Ctx, map: LoadedMap) {
  if (!map.spongeMesh || !map.spongeAnim) return;
  const anim = map.spongeAnim;
  if (map.spongeShadow) (map.spongeShadow.material as THREE.MeshToonMaterial).opacity = 0;
  await ctx.loop.tween(anim.dur, (k) => {
    map.spongeMesh!.position.set(
      anim.from.x + (anim.to.x - anim.from.x) * k,
      2,
      anim.from.z + (anim.to.z - anim.from.z) * k,
    );
    for (const p of ctx.state.players) {
      const dx = p.pos[0] - map.spongeMesh!.position.x;
      if (Math.abs(dx) < 3 && Math.abs(p.pos[2] - map.spongeMesh!.position.z) < 2.5) {
        p.pos = [p.pos[0], p.pos[1], p.pos[2] + (p.pos[2] >= 0 ? 1 : -1) * 0.4];
      }
    }
  });
  map.spongeMesh.position.z = -60;
  map.spongeAnim = null;
}

function buildSafeRing(map: LoadedMap) {
  if (map.safeRing) return;
  const geo = new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: palette.danger, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.y = 0.05;
  ring.scale.setScalar(map.safeRadius);
  map.group.add(ring);
  map.safeRing = ring;
}

function spawnSuddenDeathShadow(ctx: Ctx, map: LoadedMap) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * map.safeRadius * 0.7;
  const x = map.center.x + Math.cos(angle) * r;
  const z = map.center.z + Math.sin(angle) * r;
  map.pendingDropXZ = [x, z];
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), flatToon(rendu.contour.encre, {}));
  const mat = shadow.material as THREE.MeshToonMaterial;
  mat.transparent = true; mat.opacity = rendu.ombres.tache;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, 0.03, z);
  shadow.userData.noOutline = true;
  map.group.add(shadow);
  ctx.loop.later(1.6, () => shadow.removeFromParent());
}

function pickSuddenDeathSticker(ctx: Ctx): { url?: string; category: Category } {
  for (const p of ctx.state.players) {
    for (const w of p.weapons) if (w.stickerUrl) return { url: w.stickerUrl, category: w.category };
  }
  return { category: 'throwable' };
}

async function dropAt(ctx: Ctx, map: LoadedMap, x: number, z: number) {
  const { url } = pickSuddenDeathSticker(ctx);
  let obj: THREE.Object3D;
  if (url) {
    const mod = await import('../sticker');
    obj = await mod.makeSticker(url, { height: 3 });
  } else {
    obj = buildProcedural('giantFallback', map.mapPalette, map.grade, map.mapPalette.matiere);
    obj.scale.setScalar(1.6);
  }
  obj.position.set(x, 14, z);
  map.group.add(obj);
  const RAPIER_NS = ctx.physics.RAPIER;
  const desc = RAPIER_NS.RigidBodyDesc.dynamic().setTranslation(x, 14, z).setCcdEnabled(true);
  const body = ctx.physics.world.createRigidBody(desc);
  ctx.physics.world.createCollider(RAPIER_NS.ColliderDesc.ball(1.4).setDensity(4), body);
  map.transient.push({ mesh: obj, body, expiresAt: ctx.loop.time + 6 });
  await ctx.loop.wait(1.2);
  ctx.bus.emit('prop:triggered', { propId: 'suddendeath-drop', kind: 'suddendeath-drop' });
  ctx.bus.emit('slowmo', { factor: 0.35, ms: 260 });
}

async function loadMap(ctx: Ctx, mapId: MapId) {
  unloadMap(ctx);
  const def = pickBuilder(mapId)();
  const tk = tokensFor(mapId);
  const group = new THREE.Group();
  group.name = `map-${mapId}`;
  ctx.three.scene.add(group);

  const map: LoadedMap = {
    def, group, center: new THREE.Vector3(0, 0, 0), mapPalette: tk.palette,
    grade: { steps: rendu.paliers.decor, saturation: tk.decor.saturation, tint: tk.decor.teinte },
    tileMesh: null, tiles: [], props: new Map(), triggerByCollider: new Map(), groundColliders: new Set(),
    transient: [], ringLevel: 2, hazardDecals: new Map(), crows: [], lights: [], tiltCurrent: 0, camRollApplied: 0,
    waveRings: [], announceWave: null, lightningNextAt: ctx.loop.time + 9, lightningLight: null, projectileInFlightUntil: 0,
    spongeMesh: null, spongeShadow: null, spongeAnim: null, suddenDeathActive: false, safeRadius: 30, safeRing: null,
    pendingDropXZ: null, killed: new Set(),
  };
  current = map;

  buildLights(ctx, map, tk);

  if (mapId === 'archipel') {
    map.ringLevel = Math.max(...def.tiles.map((t) => t.ring), 1);
  }

  await buildTiles(ctx, map, def);
  await buildGround(ctx, map, def.ground);
  buildStatic(ctx, map, def.extraColliders);
  await buildProps(ctx, map, def.props);

  if (mapId === 'archipel') {
    buildCrows(map, tk as ArchipelTokens);
    buildDistantIslands(map, tk as ArchipelTokens);
  } else if (mapId === 'galion') {
    buildWaveRings(map, tk as GalionTokens);
    const hull = map.group.getObjectByName('ship-pirate-large') ?? map.group;
    furlSails(hull);
    map.lightningLight = new THREE.PointLight((tk as GalionTokens).eclair.fond, 0, 60);
    map.lightningLight.position.set(0, 20, 0);
    map.group.add(map.lightningLight);
  } else if (mapId === 'cuisine') {
    buildSpongeActor(map);
    buildCoffeeRing(map, tk as CuisineTokens);
    buildSteamingCup(map, tk as CuisineTokens);
  }

  const half = Math.max(...def.crateSpots.map((c) => Math.hypot(c[0], c[2])), 12);
  map.safeRadius = half + 6;
}

function buildSpongeActor(map: LoadedMap) {
  const sponge = buildProcedural('giantFallback', map.mapPalette, map.grade, map.mapPalette.accent);
  sponge.scale.set(3, 1.2, 2);
  sponge.position.set(0, 2, -60);
  map.group.add(sponge);
  map.spongeMesh = sponge;
  // Ombre = toute la BANDE qui va être balayée (l'éponge traverse tout le plan de travail en X), pas un
  // simple point : sinon "annoncée par son ombre" ne prévient que la moitié du danger.
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), flatToon(rendu.contour.encre, {}));
  const mat = shadow.material as THREE.MeshToonMaterial;
  mat.transparent = true;
  mat.opacity = 0;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.03, 0);
  shadow.userData.noOutline = true;
  map.group.add(shadow);
  map.spongeShadow = shadow;
}

// ---------------------------------------------------------------------------
// Boucle par image : synchronise les corps dynamiques, l'habillage vivant (lumière, mer, éclairs…).
// ---------------------------------------------------------------------------
const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const vec = new THREE.Vector3();

function tick(ctx: Ctx, dt: number) {
  const map = current;
  if (!map) return;

  if (map.tileMesh) {
    let dirty = false;
    for (const t of map.tiles) {
      if (!t.fallen) continue;
      const tr = t.body.translation();
      const rot = t.body.rotation();
      vec.set(tr.x, tr.y, tr.z);
      quat.set(rot.x, rot.y, rot.z, rot.w);
      m4.compose(vec, quat, new THREE.Vector3(1, 1, 1));
      map.tileMesh.setMatrixAt(t.index, m4);
      dirty = true;
    }
    if (dirty) map.tileMesh.instanceMatrix.needsUpdate = true;
  }

  for (const prop of map.props.values()) {
    if (prop.body.isDynamic()) {
      const tr = prop.body.translation();
      const rot = prop.body.rotation();
      prop.mesh.position.set(tr.x, tr.y, tr.z);
      prop.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      prop.worldPos.set(tr.x, tr.y, tr.z);
    }
    if (prop.kind === 'launcher') {
      const pid = nearestPlayer(ctx, prop.worldPos, prop.spec.triggerRadius ?? 1.2);
      if (pid != null) triggerLauncher(ctx, prop, pid);
    }
    if (prop.kind === 'sweeper' && prop.animPhase === 'active') {
      const dur = prop.spec.sweepDuration ?? 1;
      prop.animT += dt;
      const total = dur * 2;
      const k = Math.min(1, prop.animT / total);
      const swing = Math.sin(k * Math.PI) * THREE.MathUtils.degToRad(prop.spec.sweepDegrees ?? 120);
      prop.mesh.rotation.y = prop.restYaw + swing;
      for (const p of ctx.state.players) {
        const dx = p.pos[0] - prop.worldPos.x, dz = p.pos[2] - prop.worldPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < (prop.spec.triggerRadius ?? 1.8) + 2 && dist > 0.01) {
          p.pos = [p.pos[0] + (dx / dist) * dt * 1.5, p.pos[1], p.pos[2] + (dz / dist) * dt * 1.5];
        }
      }
      if (k >= 1) { prop.animPhase = 'idle'; prop.mesh.rotation.y = prop.restYaw; }
    }
  }

  for (let i = map.transient.length - 1; i >= 0; i--) {
    const tr = map.transient[i]!;
    const t = tr.body.translation();
    tr.mesh.position.set(t.x, t.y, t.z);
    if (ctx.loop.time >= tr.expiresAt) {
      ctx.physics.world.removeRigidBody(tr.body);
      tr.mesh.removeFromParent();
      map.transient.splice(i, 1);
    }
  }

  // flottants divers (fumée de la tasse géante, cuisine)
  for (const c of map.crows) {
    if ((c as unknown as THREE.Mesh).userData?.steamPhase !== undefined) {
      const phase = (c as unknown as THREE.Mesh).userData.steamPhase as number;
      c.position.y += Math.sin(ctx.loop.time * 0.6 + phase) * 0.002 + 0.003;
    }
  }

  if (map.practical) {
    const flick = 1 + (Math.sin(ctx.loop.time * 11) * 0.5 + Math.sin(ctx.loop.time * 23) * 0.5) * map.practical.vacillement;
    map.practical.light.intensity = map.practical.base * flick;
  }

  if (map.def.id === 'galion') {
    updateWaveRings(map, galionTokens(), ctx.loop.time);
    updateLightning(ctx, map, galionTokens(), dt);
  }

  const target = map.tiltCurrent;
  ctx.three.camera.rotation.z += target - map.camRollApplied;
  map.camRollApplied = target;

  for (const p of ctx.state.players) {
    if (p.pos[1] < map.def.voidY && !map.killed.has(p.id)) {
      map.killed.add(p.id);
      ctx.bus.emit('ringout', { player: p.id });
    }
  }
}

// ---------------------------------------------------------------------------
// API publique du moteur (consommée par index.ts / api.ts / map-events)
// ---------------------------------------------------------------------------
export function currentMapId(): MapId | null { return current?.def.id ?? null; }
export function currentMapDef(): MapDef | null { return current?.def ?? null; }

export function getSpawnPoints(): [Vec3, Vec3] | null {
  if (!current) return null;
  return [current.def.spawns[0].pos, current.def.spawns[1].pos];
}

export function getCrateSpots(): Vec3[] {
  return current?.def.crateSpots ?? [];
}

export function isOverVoid(pos: Vec3): boolean {
  if (!current || !ctxRef) return true;
  if (current.suddenDeathActive) {
    const d = Math.hypot(pos[0] - current.center.x, pos[2] - current.center.z);
    if (d > current.safeRadius) return true;
  }
  const RAPIER_NS = ctxRef.physics.RAPIER;
  const ray = new RAPIER_NS.Ray({ x: pos[0], y: pos[1] + 0.5, z: pos[2] }, { x: 0, y: -1, z: 0 });
  const map = current;
  const hit = ctxRef.physics.world.castRay(ray, 6, true, undefined, undefined, undefined, undefined,
    (c) => map.groundColliders.has(c.handle));
  return !hit;
}

export async function install(ctx: Ctx): Promise<void> {
  ctxRef = ctx;
  ctx.bus.on('match:start', ({ mapId }) => {
    void loadMap(ctx, mapId).then(() => {
      const spawns = getSpawnPoints();
      if (spawns) { ctx.state.players[0].pos = spawns[0]; ctx.state.players[1].pos = spawns[1]; }
    });
  });
  ctx.bus.on('projectile:spawn', ({ weapon, from, vel }) => {
    if (current) simulateProjectile(ctx, current, weapon, from, vel);
  });
  ctx.bus.on('hit', ({ pos, weapon }) => {
    if (current) proximityTrigger(ctx, current, pos, weapon);
  });
  ctx.bus.on('map:warn', ({ kind, mapId }) => {
    if (current && current.def.id === mapId) handleWarn(ctx, current, kind);
  });
  ctx.bus.on('map:event', ({ kind, mapId }) => {
    if (current && current.def.id === mapId) handleEvent(ctx, current, kind);
  });
  ctx.loop.addSystem('maps', (dt) => tick(ctx, dt), 200);

  window.__mapTest = (mapId: MapId) => {
    void loadMap(ctx, mapId).then(() => {
      const spawns = getSpawnPoints();
      if (spawns) { ctx.state.players[0].pos = spawns[0]; ctx.state.players[1].pos = spawns[1]; }
      const b = localBounds(current!.group);
      const size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 10);
      ctx.three.camera.position.set(0, size * 0.55, size * 0.8);
      ctx.three.camera.lookAt(0, 0, 0);
    });
  };
}

declare global { interface Window { __mapTest?: (mapId: MapId) => void } }
