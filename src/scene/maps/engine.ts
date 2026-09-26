// Moteur commun des maps (lots LM puis LMAP2). Charge une MapDef (types.ts) en deux temps :
//  1. la PHYSIQUE, en synchrone dès `match:start` (sinon le sol de secours du gameplay se crée à la place
//     de l'arène et ferme le vide : c'était le « mur invisible » des arènes fermées) ;
//  2. les VISUELS, en asynchrone (modèles glTF, décor lointain instancié).
// Il gère aussi les plateformes traversables (one-way), le danger périodique de chaque map (annoncé par
// une zone d'alerte qui clignote), les accessoires déclenchés par les tirs et la mort subite.
// Lumières, ciel, brouillard et post-traitement : PAS ici (src/scene/render/**, lot LDA2).
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ctx, MapId, PlayerId, Vec3 } from '../../core/types';
import { excludeFromOcclusion } from '../registry';
import { buildArchipelDef } from './archipel';
import { buildCuisineDef } from './cuisine';
import { buildGalionDef } from './galion';
import { HEX_R } from './hex';
import { instantiate } from './loader';
import { flatMat, hazardMaterial, hazardRect, worldStripeUVs, type Grade } from './materials';
import { archipelTokens, cuisineTokens, galionTokens, LOCAL_TOKENS, palette, rendu, type MapPalette } from './tokens';
import type {
  BackdropSpec, ColliderSpec, MapDef, OneWaySpec, PropBuild, PropKind, PropSpec, VisualPart,
} from './types';

// ---------------------------------------------------------------------------
// Réglages du moteur (algorithmes, pas des valeurs visuelles).
// ---------------------------------------------------------------------------
const MAX_TRIGGERS_PER_SHOT = 3;
const RAY_STEP = 0.05;
const RAY_MAX_TIME = 3;
const GRAVITY = 9.81;
/** One-way : marge autour de l'empreinte, seuil d'entrée « au-dessus » et hystérésis de sortie (m). */
const ONEWAY_MARGIN = 0.75;
const ONEWAY_ENTER = 0.02;
const ONEWAY_EXIT = 0.35;
/** Clignotement des zones d'alerte (Hz) et plancher d'opacité. */
const BLINK_HZ = 2.5;
const BLINK_MIN = 0.25;

type Vector3Like = { x: number; y: number; z: number };
const v3 = (v: Vec3): Vector3Like => ({ x: v[0], y: v[1], z: v[2] });

/** Effet sur un joueur, appliqué côté gameplay par src/gameplay/map-events (poussée physique ou chute). */
export type PlayerEffect =
  | { kind: 'push'; player: PlayerId; vel: Vec3; /** secondes minimum avant de rendre la main (pont qui gîte) */ hold?: number }
  | { kind: 'drop'; player: PlayerId };
let effectHandler: ((e: PlayerEffect) => void) | null = null;
export function onPlayerEffect(fn: (e: PlayerEffect) => void) { effectHandler = fn; }
function effect(e: PlayerEffect) { effectHandler?.(e); }

interface TileRuntime { index: number; ring: number; fallen: boolean; body: RAPIER.RigidBody; colliderHandle: number; pos: Vec3 }

interface PropRuntime {
  id: string;
  spec: PropSpec;
  kind: PropKind;
  holder: THREE.Group;
  body: RAPIER.RigidBody;
  colliderHandle: number;
  worldPos: THREE.Vector3;
  dead: boolean;
  cooldownUntil: number;
  launchIdx: number;
}

interface OneWayRuntime { spec: OneWaySpec; collider: RAPIER.Collider; above: [boolean, boolean] }

interface Transient { mesh: THREE.Object3D; body: RAPIER.RigidBody; expiresAt: number }

interface LoadedMap {
  def: MapDef;
  group: THREE.Group;
  /** Groupe qui gîte (galion) : pont + accessoires posés dessus. */
  deckGroup: THREE.Group;
  deckBody: RAPIER.RigidBody | null;
  mapPalette: MapPalette;
  backGrade: Grade;
  tileMesh: THREE.InstancedMesh | null;
  tiles: TileRuntime[];
  props: Map<string, PropRuntime>;
  triggerByCollider: Map<number, string>;
  groundColliders: Set<number>;
  platforms: OneWayRuntime[];
  transient: Transient[];
  ringLevel: number;
  hazard: THREE.Mesh | null;
  tilt: number;
  catapult: { root: THREE.Object3D; turret: THREE.Object3D | null; arm: THREE.Object3D | null } | null;
  sponge: THREE.Object3D | null;
  spongeBand: { z: number; dir: 1 | -1 } | null;
  sea: THREE.Mesh[];
  pendingDropXZ: [number, number] | null;
}

let current: LoadedMap | null = null;
let ctxRef: Ctx | null = null;

function tokensFor(mapId: MapId) {
  if (mapId === 'galion') return galionTokens();
  if (mapId === 'cuisine') return cuisineTokens();
  return archipelTokens();
}

function pickBuilder(mapId: MapId): () => MapDef {
  if (mapId === 'galion') return buildGalionDef;
  if (mapId === 'cuisine') return buildCuisineDef;
  return buildArchipelDef;
}

// ---------------------------------------------------------------------------
// Pièces procédurales (en attendant le kit d'arène LKIT) : couleurs = palette de LA map (tokens).
// ---------------------------------------------------------------------------
/** Petit hasard déterministe (les visuels ne consomment jamais le hasard du gameplay). */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Dessous rocheux d'une île flottante : cône à 7 pans, bosselé, sommet à y = 0. size = [rayon haut, hauteur, rayon bas]. */
function rockGeometry(size: Vec3, seed = 7): THREE.BufferGeometry {
  const [rTop, h, rBot] = size;
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, 7, 3).translate(0, -h / 2, 0);
  const pos = geo.getAttribute('position');
  const rnd = seeded(seed);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > -0.01) continue; // le bord du haut reste net (il épouse le plateau)
    const k = 0.82 + rnd() * 0.36;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, y + (rnd() - 0.5) * h * 0.08);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Planches (4 m x 2 m par tuile de texture, rangées de 0,5 m, joints décalés), couleur du pont de la map. */
const plankCache = new Map<string, THREE.CanvasTexture>();
function plankTexture(color: string): THREE.CanvasTexture {
  const cached = plankCache.get(color);
  if (cached) return cached;
  const W = 512, H = 256, rows = 4;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const rnd = seeded(5);
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * W * 0.5;
    while (x < W) {
      const len = W * (0.35 + rnd() * 0.3);
      const k = 0.9 + rnd() * 0.18;
      c.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
      c.fillRect(x, r * rowH, len, rowH);
      c.fillStyle = `#${base.clone().multiplyScalar(0.55).getHexString()}`;
      c.fillRect(x + len - 2, r * rowH, 3, rowH); // joint
      x += len;
    }
    c.fillStyle = `#${base.clone().multiplyScalar(0.5).getHexString()}`;
    c.fillRect(0, r * rowH, W, 3); // rainure
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 4, 1 / 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  plankCache.set(color, tex);
  return tex;
}

/** Coque de navire (loft entre le contour du pont et une quille plus étroite), dessus à y = 0, proue vers +X. */
function hullGeometry(len: number, depth: number, width: number): THREE.BufferGeometry {
  const N = 20;
  const halfW = width / 2;
  const ring = (bottom: boolean): THREE.Vector3[] => {
    const side = (sign: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const t = sign > 0 ? i / N : 1 - i / N;
        const bow = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1;
        const stern = t < 0.05 ? 0.86 + 0.14 * (t / 0.05) : 1;
        const x = (-len / 2 + t * len) * (bottom ? 0.84 : 1);
        const w = halfW * bow * stern * (bottom ? 0.3 : 1) * sign;
        const y = bottom ? -depth + depth * 0.35 * (2 * t - 1) ** 2 : 0;
        pts.push(new THREE.Vector3(x, y, w));
      }
      return pts;
    };
    return [...side(1), ...side(-1).slice(1, -1)];
  };
  const top = ring(false);
  const bot = ring(true);
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const M = top.length;
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    tri(top[i]!, bot[i]!, top[j]!);
    tri(top[j]!, bot[i]!, bot[j]!);
  }
  const keel = new THREE.Vector3(0, -depth, 0);
  for (let i = 0; i < M; i++) tri(bot[i]!, keel, bot[(i + 1) % M]!);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildProcedural(build: Extract<PropBuild, { kind: 'procedural' }>, mp: MapPalette, grade: Grade): THREE.Object3D {
  const g = new THREE.Group();
  const size = build.size ?? [1, 1, 1];
  switch (build.shape) {
    case 'rock': {
      const m = new THREE.Mesh(rockGeometry(size, Math.round(size[0] * 97 + size[1] * 13)), flatMat(build.color ?? mp.matiere, grade, 0.95));
      g.add(m);
      break;
    }
    case 'slab': {
      // Dalle à bords chanfreinés, dessus à y = 0.
      const [sx, sy, sz] = size;
      const bevel = Math.min(0.12, sy * 0.3);
      const shape = new THREE.Shape();
      shape.moveTo(-sx / 2 + bevel, -sz / 2);
      shape.lineTo(sx / 2 - bevel, -sz / 2);
      shape.lineTo(sx / 2, -sz / 2 + bevel);
      shape.lineTo(sx / 2, sz / 2 - bevel);
      shape.lineTo(sx / 2 - bevel, sz / 2);
      shape.lineTo(-sx / 2 + bevel, sz / 2);
      shape.lineTo(-sx / 2, sz / 2 - bevel);
      shape.lineTo(-sx / 2, -sz / 2 + bevel);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: sy - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1 });
      geo.rotateX(Math.PI / 2).translate(0, -bevel, 0);
      g.add(new THREE.Mesh(geo, flatMat(build.color ?? mp.sol, grade, 0.7)));
      break;
    }
    case 'deck': {
      // Pont : dalle chanfreinée + texture de planches (UV en mètres, cf. plankTexture).
      const slab = buildProcedural({ kind: 'procedural', shape: 'slab', size, color: build.color }, mp, grade);
      const mesh = slab.children[0] as THREE.Mesh;
      const base = mesh.material as THREE.MeshStandardMaterial;
      const mat = base.clone();
      mat.color.set('#ffffff');
      mat.map = plankTexture(build.color ?? mp.sol);
      mat.flatShading = false;
      mesh.material = mat;
      g.add(slab);
      break;
    }
    case 'hull': {
      const m = new THREE.Mesh(hullGeometry(size[0], size[1], size[2]), flatMat(build.color ?? mp.matiere, grade, 0.85).clone());
      (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(m);
      break;
    }
    case 'toaster': {
      const [sx, sy, sz] = size;
      const body = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), flatMat(build.color ?? mp.matiere, grade, 0.35));
      body.position.y = sy / 2;
      const slotMat = flatMat(rendu.contour.encre, {}, 0.9);
      for (const dx of [-sx * 0.22, sx * 0.22]) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.3, 0.06, sz * 0.62), slotMat);
        slot.position.set(dx, sy + 0.01, 0);
        g.add(slot);
      }
      const lever = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.1, sy * 0.12, sz * 0.2), flatMat(palette.danger, {}, 0.5));
      lever.position.set(sx / 2 + sx * 0.05, sy * 0.75, 0);
      g.add(body, lever);
      break;
    }
    case 'rollingPin': {
      const [r, len] = size;
      const main = flatMat(build.color ?? mp.accent, grade, 0.6);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), main);
      const handleGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, len * 0.2, 10);
      const h1 = new THREE.Mesh(handleGeo, flatMat(mp.matiere, grade)); h1.position.y = len * 0.6;
      const h2 = new THREE.Mesh(handleGeo, flatMat(mp.matiere, grade)); h2.position.y = -len * 0.6;
      g.add(body, h1, h2);
      break;
    }
    case 'giantFallback': {
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(size[0], 0), flatMat(build.color ?? mp.matiere, grade)));
      break;
    }
  }
  return g;
}

async function buildVisual(build: PropBuild, map: LoadedMap, grade: Grade, shadows: boolean): Promise<THREE.Object3D> {
  let obj: THREE.Object3D | null;
  if (build.kind === 'model') {
    obj = await instantiate(build.url, build.node, grade, shadows);
    for (const name of build.hide ?? []) { const n = obj?.getObjectByName(name); if (n) n.visible = false; }
  } else obj = buildProcedural(build, map.mapPalette, grade);
  if (!obj) obj = buildProcedural({ kind: 'procedural', shape: 'giantFallback' }, map.mapPalette, grade);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = shadows; m.receiveShadow = true; }
  });
  return obj;
}

function applyScale(obj: THREE.Object3D, s: number | Vec3 | undefined) {
  if (s == null) return;
  if (typeof s === 'number') obj.scale.setScalar(s);
  else obj.scale.set(s[0], s[1], s[2]);
}

async function addPart(map: LoadedMap, parent: THREE.Object3D, part: VisualPart, grade: Grade, shadows = true) {
  const obj = await buildVisual(part.build, map, grade, shadows);
  obj.position.set(part.offset[0], part.offset[1], part.offset[2]);
  if (part.yaw) obj.rotation.y = part.yaw;
  applyScale(obj, part.scale);
  parent.add(obj);
  return obj;
}

// ---------------------------------------------------------------------------
// Physique (synchrone)
// ---------------------------------------------------------------------------
function colliderDesc(R: typeof RAPIER, spec: ColliderSpec, scale: number): RAPIER.ColliderDesc {
  const off = spec.offset;
  const desc = spec.type === 'box'
    ? R.ColliderDesc.cuboid(spec.hx * scale, spec.hy * scale, spec.hz * scale)
    : R.ColliderDesc.cylinder(spec.halfHeight * scale, spec.radius * scale);
  if (off) desc.setTranslation(off[0] * scale, off[1] * scale, off[2] * scale);
  if (spec.type === 'cylinder' && spec.rollAxisZ) desc.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
  return desc;
}

function makeBody(ctx: Ctx, pos: Vec3, yaw = 0, kinematic = false): RAPIER.RigidBody {
  const R = ctx.physics.RAPIER;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const desc = (kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed())
    .setTranslation(pos[0], pos[1], pos[2]).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  return ctx.physics.world.createRigidBody(desc);
}

/** Prisme hexagonal (pointy-top, rayon circonscrit r) : collider exact des dalles, sans rebord invisible. */
function hexPrismDesc(R: typeof RAPIER, r: number, height: number): RAPIER.ColliderDesc {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pts.push(x, 0, z, x, -height, z);
  }
  return R.ColliderDesc.convexHull(new Float32Array(pts)) ?? R.ColliderDesc.cylinder(height / 2, r).setTranslation(0, -height / 2, 0);
}

function buildPhysics(ctx: Ctx, map: LoadedMap) {
  const { def } = map;
  const R = ctx.physics.RAPIER;
  const world = ctx.physics.world;

  if (def.tiles.length && def.tileHalfExtents) {
    const [hx, hy, hz] = def.tileHalfExtents;
    def.tiles.forEach((tile, i) => {
      const body = makeBody(ctx, tile.pos);
      const desc = def.tileShape === 'hex' ? hexPrismDesc(R, hz, hy * 2) : R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(0, -hy, 0);
      const collider = world.createCollider(desc.setFriction(0.9), body);
      map.tiles.push({ index: i, ring: tile.ring, fallen: false, body, colliderHandle: collider.handle, pos: tile.pos });
      map.groundColliders.add(collider.handle);
    });
  }

  for (const piece of def.ground) {
    if (!piece.collider) continue;
    const scale = typeof piece.scale === 'number' ? piece.scale : 1;
    const collider = world.createCollider(colliderDesc(R, piece.collider, scale), makeBody(ctx, piece.pos, piece.yaw ?? 0));
    map.groundColliders.add(collider.handle);
  }

  for (const sc of def.extraColliders) {
    const body = makeBody(ctx, sc.pos, 0, sc.id === 'deck');
    if (sc.id === 'deck') map.deckBody = body;
    const collider = world.createCollider(colliderDesc(R, sc.collider, 1).setFriction(0.8), body);
    map.groundColliders.add(collider.handle);
  }

  for (const pf of def.platforms) {
    const desc = R.RigidBodyDesc.fixed().setTranslation(pf.top[0], pf.top[1] - pf.thickness / 2, pf.top[2])
      .setUserData({ kind: 'oneway', oneWay: true, topY: pf.top[1], id: pf.id });
    const body = world.createRigidBody(desc);
    const collider = world.createCollider(R.ColliderDesc.cuboid(pf.halfX, pf.thickness / 2, pf.halfZ).setFriction(0.9), body);
    collider.setEnabled(false); // personne dessus au départ : les tirs et les sauts passent au travers
    map.platforms.push({ spec: pf, collider, above: [false, false] });
    map.groundColliders.add(collider.handle);
  }

  for (const spec of def.props) {
    const body = makeBody(ctx, spec.pos, spec.yaw ?? 0);
    const desc = colliderDesc(R, spec.collider, spec.scale ?? 1);
    if (spec.kind === 'launcher') desc.setSensor(true);
    const collider = world.createCollider(desc, body);
    const holder = new THREE.Group();
    holder.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    holder.rotation.y = spec.yaw ?? 0;
    (def.id === 'galion' ? map.deckGroup : map.group).add(holder);
    map.props.set(spec.id, {
      id: spec.id, spec, kind: spec.kind, holder, body, colliderHandle: collider.handle,
      worldPos: new THREE.Vector3(spec.pos[0], spec.pos[1], spec.pos[2]), dead: false, cooldownUntil: 0, launchIdx: 0,
    });
    map.triggerByCollider.set(collider.handle, spec.id);
    if (spec.kind !== 'launcher') map.groundColliders.add(collider.handle);
  }
}

/** Le sol de secours du gameplay (fallback-ground.ts) n'a plus lieu d'être dès qu'une vraie map existe. */
function removeFallbackGround(ctx: Ctx) {
  const doomed: RAPIER.RigidBody[] = [];
  ctx.physics.world.forEachRigidBody((b) => {
    if ((b.userData as { kind?: string } | undefined)?.kind === 'fallback-ground') doomed.push(b);
  });
  for (const b of doomed) ctx.physics.world.removeRigidBody(b);
}

// ---------------------------------------------------------------------------
// Visuels (asynchrone)
// ---------------------------------------------------------------------------
async function buildTileVisuals(map: LoadedMap) {
  const { def } = map;
  if (!def.tiles.length || !def.tileModel) return;
  const template = await buildVisual(def.tileModel, map, map.backGrade, false);
  let mesh: THREE.Mesh | null = null;
  template.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  if (!mesh) return;
  const src = mesh as THREE.Mesh;
  const im = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, def.tiles.length);
  im.castShadow = false;
  im.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  def.tiles.forEach((tile, i) => { m4.makeTranslation(tile.pos[0], tile.pos[1], tile.pos[2]); im.setMatrixAt(i, m4); });
  im.computeBoundingSphere();
  im.name = 'map-tiles';
  map.group.add(im);
  map.tileMesh = im;
  excludeFromOcclusion(im);
}

async function buildGroundVisuals(map: LoadedMap) {
  for (const piece of map.def.ground) {
    const parent = map.def.id === 'galion' ? map.deckGroup : map.group;
    const obj = await addPart(map, parent, { build: piece.build, offset: piece.pos, yaw: piece.yaw, scale: piece.scale }, map.backGrade, true);
    obj.name = piece.id;
    if (piece.id.startsWith('plateau')) excludeFromOcclusion(obj); // le sol ne s'efface jamais ; un mât, si
  }
}

async function buildPlatformVisuals(map: LoadedMap) {
  for (const pf of map.def.platforms) {
    const root = new THREE.Group();
    root.name = `oneway-${pf.id}`;
    root.position.set(pf.top[0], pf.top[1], pf.top[2]);
    map.group.add(root);
    excludeFromOcclusion(root);
    for (const part of pf.parts) await addPart(map, root, part, map.backGrade, true);
  }
}

async function buildPropVisuals(map: LoadedMap) {
  for (const prop of map.props.values()) {
    const obj = await buildVisual(prop.spec.build, map, {}, true);
    if (prop.spec.lieOnSide) obj.rotation.z = Math.PI / 2;
    if (prop.spec.scale) obj.scale.setScalar(prop.spec.scale);
    prop.holder.add(obj);
    if (prop.kind === 'cannon' && prop.spec.cannonAxis && prop.spec.cannonRange) {
      const len = prop.spec.cannonRange;
      const stripe = hazardRect(0, 0, 0.4, len, 0.035);
      // Axe peint dans le repère du canon : le holder porte déjà son orientation (yaw).
      stripe.position.set(0, 0, len / 2 + 1.2);
      stripe.material = hazardMaterial();
      (stripe.material as THREE.MeshBasicMaterial).opacity = 0.4;
      prop.holder.add(stripe);
    }
  }
}

/** Décor lointain : un InstancedMesh par mesh du modèle (1 appel de dessin par pièce, quel que soit le nombre). */
async function buildBackdrop(map: LoadedMap, spec: BackdropSpec) {
  const template = await buildVisual(spec.build, map, spec.graded === false ? {} : map.backGrade, false);
  template.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  template.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const inst = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, spec.items.length);
    spec.items.forEach((it, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw ?? 0);
      if (typeof it.scale === 'number') s.setScalar(it.scale); else if (it.scale) s.set(it.scale[0], it.scale[1], it.scale[2]); else s.setScalar(1);
      p.set(it.pos[0], it.pos[1], it.pos[2]);
      inst.compose(p, q, s).multiply(mesh.matrixWorld);
      im.setMatrixAt(i, inst);
    });
    im.castShadow = false;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    map.group.add(im);
    excludeFromOcclusion(im);
  }
}

async function buildVisuals(ctx: Ctx, map: LoadedMap) {
  await buildTileVisuals(map);
  await buildGroundVisuals(map);
  await buildPlatformVisuals(map);
  await buildPropVisuals(map);
  for (const b of map.def.backdrop) await buildBackdrop(map, b);
  if (map.def.id === 'archipel') await buildCatapult(map);
  else if (map.def.id === 'galion') buildSea(map);
  else if (map.def.id === 'cuisine') buildSponge(map);
  void ctx;
}

// ---------------------------------------------------------------------------
// Archipel : la catapulte, hors du plateau, tire sur l'anneau condamné.
// ---------------------------------------------------------------------------
async function buildCatapult(map: LoadedMap) {
  const spot = map.def.catapult;
  if (!spot) return;
  const root = await buildVisual(spot.build, map, map.backGrade, false);
  root.position.set(spot.pos[0], spot.pos[1], spot.pos[2]);
  root.rotation.y = spot.yaw ?? 0;
  applyScale(root, spot.scale);
  map.group.add(root);
  excludeFromOcclusion(root);
  map.catapult = {
    root,
    turret: root.getObjectByName('catapult_turret_blue') ?? null,
    arm: root.getObjectByName('catapult_arm_blue') ?? null,
  };
}

function aimCatapultAt(map: LoadedMap, target: THREE.Vector3) {
  const c = map.catapult;
  if (!c) return;
  const from = c.root.getWorldPosition(new THREE.Vector3());
  const yaw = Math.atan2(target.x - from.x, target.z - from.z);
  c.root.rotation.y = yaw;
}

async function fireCatapult(ctx: Ctx, map: LoadedMap, target: THREE.Vector3): Promise<void> {
  const c = map.catapult;
  const from = c ? c.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 9, 0)) : target.clone().add(new THREE.Vector3(-20, 18, -25));
  const arm = c?.arm;
  if (arm) void ctx.loop.tween(0.25, (k) => { arm.rotation.x = -k * 1.4; }).then(() => ctx.loop.tween(0.8, (k) => { arm.rotation.x = -1.4 * (1 - k); }));
  const boulder = await buildVisual(map.def.catapultAmmo ?? { kind: 'procedural', shape: 'giantFallback', size: [0.9, 0, 0] }, map, {}, true);
  applyScale(boulder, map.def.catapultAmmo ? 7 : 1);
  map.group.add(boulder);
  const dur = 1.05;
  const peak = 7;
  await ctx.loop.tween(dur, (k) => {
    boulder.position.set(
      from.x + (target.x - from.x) * k,
      from.y + (target.y - from.y) * k + Math.sin(k * Math.PI) * peak,
      from.z + (target.z - from.z) * k,
    );
    boulder.rotation.x += 0.2;
  });
  boulder.removeFromParent();
}

// ---------------------------------------------------------------------------
// Galion : mer découpée autour de la coque (rondes d'écume), gîte du pont.
// ---------------------------------------------------------------------------
const seaTime = { value: 0 };
function buildSea(map: LoadedMap) {
  const tk = galionTokens();
  const geo = new THREE.PlaneGeometry(320, 320, 90, 90).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: tk.palette.accent, roughness: 0.4, metalness: 0, flatShading: true });
  const amp = tk.mer.houle * 4; // houle de tempête (m)
  const foam = new THREE.Color(tk.mer.ecume);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seaTime;
    shader.uniforms.uFoam = { value: foam };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
varying float vWave;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 p = position;
          float h = sin(p.x * 0.16 + uTime * 1.1) * 0.9 + sin(p.z * 0.21 - uTime * 0.8) * 0.7 + sin((p.x + p.z) * 0.09 + uTime * 0.55) * 0.8;
          vWave = h / 2.4;
          transformed.y += h * ${amp.toFixed(3)} * 0.45;
        }`);
    // Crêtes d'écume : plus la vague est haute, plus elle blanchit.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uFoam;
varying float vWave;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, smoothstep(0.62, 1.0, vWave) * 0.8);`);
  };
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = map.def.seaY ?? -3;
  sea.receiveShadow = true;
  map.group.add(sea);
  excludeFromOcclusion(sea);
  map.sea.push(sea);
}

// ---------------------------------------------------------------------------
// Cuisine : éponge géante qui balaie une bande annoncée.
// ---------------------------------------------------------------------------
function buildSponge(map: LoadedMap) {
  const tk = cuisineTokens();
  const g = new THREE.Group();
  const foam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 3.2), flatMat(tk.palette.accent, {}, 0.95));
  foam.position.y = 0.65;
  const scrub = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 3.2), flatMat(darken(tk.palette.accent, 0.55), {}, 0.9));
  scrub.position.y = 1.52;
  g.add(foam, scrub);
  g.visible = false;
  map.group.add(g);
  map.sponge = g;
}

function darken(hex: string, f: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(f).getHexString()}`;
}

// ---------------------------------------------------------------------------
// Zones d'alerte (préavis d'un tour complet) : fusionnées en une géométrie, elles clignotent.
// ---------------------------------------------------------------------------
function setHazard(map: LoadedMap, mesh: THREE.Mesh | null) {
  if (map.hazard) { map.hazard.removeFromParent(); map.hazard.geometry.dispose(); }
  map.hazard = mesh;
  if (mesh) { map.group.add(mesh); excludeFromOcclusion(mesh); }
}

function ringHazard(map: LoadedMap, ring: number): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const t of map.tiles) {
    if (t.fallen || t.ring !== ring) continue;
    const g = new THREE.CircleGeometry(HEX_R * 0.97, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6);
    g.translate(t.pos[0], t.pos[1] + 0.03, t.pos[2]);
    geos.push(g.toNonIndexed());
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos);
  if (!merged) return null;
  worldStripeUVs(merged);
  const mesh = new THREE.Mesh(merged, hazardMaterial());
  mesh.renderOrder = 2;
  return mesh;
}

function updateHazardBlink(ctx: Ctx, map: LoadedMap) {
  if (!map.hazard) return;
  const k = 0.5 + 0.5 * Math.sin(ctx.loop.realTime * Math.PI * 2 * BLINK_HZ);
  (map.hazard.material as THREE.MeshBasicMaterial).opacity = BLINK_MIN + (0.9 - BLINK_MIN) * k;
}

// ---------------------------------------------------------------------------
// Tirs : trajectoire simulée -> accessoires déclenchés (au plus 3 par tir).
// ---------------------------------------------------------------------------
function triggerProp(ctx: Ctx, map: LoadedMap, prop: PropRuntime) {
  if (prop.dead || ctx.loop.time < prop.cooldownUntil) return;
  const R = ctx.physics.RAPIER;
  switch (prop.kind) {
    case 'explosive': {
      prop.dead = true;
      map.groundColliders.delete(prop.colliderHandle);
      prop.body.setBodyType(R.RigidBodyType.Dynamic, true);
      prop.body.setLinvel({ x: 0, y: 7, z: 0 }, true);
      prop.body.setAngvel({ x: 3, y: 1, z: 2 }, true);
      const r = prop.spec.blastRadius ?? 3;
      for (const p of ctx.state.players) {
        const dx = p.pos[0] - prop.worldPos.x, dz = p.pos[2] - prop.worldPos.z;
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        const f = (prop.spec.impulse ?? 8) * (1 - (d / r) * 0.5);
        const n = d > 0.01 ? [dx / d, dz / d] : [1, 0];
        effect({ kind: 'push', player: p.id, vel: [n[0]! * f, 4.5, n[1]! * f] });
      }
      ctx.bus.emit('slowmo', { factor: 0.4, ms: 90 });
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'explosive' });
      break;
    }
    case 'knockable': {
      prop.dead = true;
      map.groundColliders.delete(prop.colliderHandle);
      prop.body.setBodyType(R.RigidBodyType.Dynamic, true);
      const a = Math.random() * Math.PI * 2;
      const f = prop.spec.impulse ?? 5;
      prop.body.setLinvel({ x: Math.cos(a) * f, y: prop.spec.lieOnSide ? 0.5 : 2.5, z: Math.sin(a) * f }, true);
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'knockable' });
      break;
    }
    case 'cannon': {
      prop.cooldownUntil = ctx.loop.time + 1.6;
      fireCannon(ctx, map, prop);
      ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'cannon' });
      break;
    }
    default: break;
  }
}

function fireCannon(ctx: Ctx, map: LoadedMap, prop: PropRuntime) {
  const axis = prop.spec.cannonAxis ?? [1, 0, 0];
  const dir = new THREE.Vector3(axis[0], 0, axis[2]).normalize();
  const speed = 22;
  const start = prop.worldPos.clone().addScaledVector(dir, 1.4).add(new THREE.Vector3(0, 0.7, 0));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), flatMat(rendu.contour.encre, {}, 0.4));
  mesh.castShadow = true;
  map.group.add(mesh);
  const R = ctx.physics.RAPIER;
  const body = ctx.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z)
    .setLinvel(dir.x * speed, 0.5, dir.z * speed).setCcdEnabled(true).setGravityScale(0.15));
  ctx.physics.world.createCollider(R.ColliderDesc.ball(0.28).setDensity(3), body);
  map.transient.push({ mesh, body, expiresAt: ctx.loop.time + 2.5 });
  // Le boulet balaie son axe peint : qui s'y trouve est projeté dans le sens du tir.
  const range = prop.spec.cannonRange ?? 14;
  for (const p of ctx.state.players) {
    const rel = new THREE.Vector3(p.pos[0] - start.x, 0, p.pos[2] - start.z);
    const along = rel.dot(dir);
    const side = rel.clone().addScaledVector(dir, -along).length();
    if (along < 0 || along > range || side > 1.3) continue;
    ctx.loop.later(along / speed, () => effect({ kind: 'push', player: p.id, vel: [dir.x * 10, 4, dir.z * 10] }));
  }
}

function simulateProjectile(ctx: Ctx, map: LoadedMap, from: Vec3, vel: Vec3) {
  const R = ctx.physics.RAPIER;
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
      const ray = new R.Ray(pos, { x: dx / dist, y: dy / dist, z: dz / dist });
      const hit = world.castRay(ray, dist, true, undefined, undefined, undefined, undefined, (c) => map.triggerByCollider.has(c.handle));
      if (hit) {
        const id = map.triggerByCollider.get(hit.collider.handle);
        const prop = id ? map.props.get(id) : undefined;
        if (id && prop && !already.has(id)) { already.add(id); triggerProp(ctx, map, prop); triggered++; }
      }
    }
    pos.x = next.x; pos.y = next.y; pos.z = next.z;
    if (pos.y < map.def.voidY - 3) break;
  }
}

function proximityTrigger(ctx: Ctx, map: LoadedMap, pos: Vec3) {
  let n = 0;
  for (const prop of map.props.values()) {
    if (n >= MAX_TRIGGERS_PER_SHOT) break;
    if (prop.dead || prop.kind === 'decor' || prop.kind === 'launcher') continue;
    const r = prop.spec.triggerRadius ?? 1.5;
    const dx = prop.worldPos.x - pos[0], dz = prop.worldPos.z - pos[2];
    if (dx * dx + dz * dz <= r * r) { triggerProp(ctx, map, prop); n++; }
  }
}

// ---------------------------------------------------------------------------
// Dangers périodiques (map:warn -> un tour complet -> map:event) + mort subite
// ---------------------------------------------------------------------------
function outerRingTarget(map: LoadedMap, ring: number): THREE.Vector3 {
  // Point d'impact : la dalle de l'anneau la plus proche de la catapulte (on la voit arriver).
  const c = map.catapult?.root.position ?? new THREE.Vector3(0, 0, -30);
  let best: TileRuntime | null = null;
  let bestD = Infinity;
  for (const t of map.tiles) {
    if (t.fallen || t.ring !== ring) continue;
    const d = Math.hypot(t.pos[0] - c.x, t.pos[2] - c.z);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best ? new THREE.Vector3(best.pos[0], best.pos[1], best.pos[2]) : new THREE.Vector3();
}

function handleWarn(ctx: Ctx, map: LoadedMap, kind: string) {
  if (kind === 'ring') {
    if (map.ringLevel < (map.def.minRing ?? 1)) return;
    setHazard(map, ringHazard(map, map.ringLevel));
    aimCatapultAt(map, outerRingTarget(map, map.ringLevel));
  } else if (kind === 'wave') {
    const b = map.def.waveBand;
    if (b) setHazard(map, hazardRect(b.center[0], b.center[2], b.size[0], b.size[1]));
  } else if (kind === 'sponge') {
    const b = map.def.spongeBand;
    if (!b) return;
    const idx = map.spongeBand ? (map.spongeBand.z === b.zs[0] ? 1 : 0) : 0;
    map.spongeBand = { z: b.zs[idx] ?? 0, dir: idx === 0 ? 1 : -1 };
    setHazard(map, hazardRect(b.centerX, map.spongeBand.z, b.length, b.width));
  } else if (kind === 'suddendeath-drop') {
    spawnDropShadow(ctx, map);
  }
}

function handleEvent(ctx: Ctx, map: LoadedMap, kind: string) {
  if (kind === 'ring') void ringFall(ctx, map);
  else if (kind === 'wave') void waveTilt(ctx, map);
  else if (kind === 'sponge') void spongeSweep(ctx, map);
  else if (kind === 'suddendeath-drop' && map.pendingDropXZ) void dropAt(ctx, map, map.pendingDropXZ[0], map.pendingDropXZ[1]);
}

/** Joueurs dont le sol vient de disparaître : ils tombent (effet « drop » côté gameplay). */
function dropPlayersOverVoid(map: LoadedMap) {
  if (!ctxRef) return;
  for (const p of ctxRef.state.players) {
    if (p.pos[1] > -0.5 && isOverVoid(p.pos)) effect({ kind: 'drop', player: p.id });
  }
  void map;
}

async function ringFall(ctx: Ctx, map: LoadedMap) {
  const ring = map.ringLevel;
  if (ring < (map.def.minRing ?? 1)) return;
  const target = outerRingTarget(map, ring);
  await fireCatapult(ctx, map, target);
  if (current !== map) return;
  setHazard(map, null);
  ctx.bus.emit('slowmo', { factor: 0.5, ms: 220 });
  ctx.bus.emit('prop:triggered', { propId: 'catapult', kind: 'ring' });
  // Cascade depuis le point d'impact : les dalles tombent l'une après l'autre autour de l'anneau.
  const doomed = map.tiles.filter((t) => !t.fallen && t.ring === ring)
    .map((t) => ({ t, d: Math.hypot(t.pos[0] - target.x, t.pos[2] - target.z) }))
    .sort((a, b) => a.d - b.d);
  doomed.forEach(({ t }, i) => ctx.loop.later(i * 0.045, () => { if (current === map) wakeTile(ctx, map, t); }));
  map.ringLevel = ring - 1;
  ctx.loop.later(doomed.length * 0.045 + 0.05, () => { if (current === map) dropPlayersOverVoid(map); });
}

function wakeTile(ctx: Ctx, map: LoadedMap, t: TileRuntime) {
  if (t.fallen) return;
  t.fallen = true;
  t.body.setBodyType(ctx.physics.RAPIER.RigidBodyType.Dynamic, true);
  const out = Math.hypot(t.pos[0], t.pos[2]) || 1;
  t.body.setLinvel({ x: (t.pos[0] / out) * 1.2, y: -0.5, z: (t.pos[2] / out) * 1.2 }, true);
  t.body.setAngvel({ x: (Math.random() - 0.5) * 2.5, y: (Math.random() - 0.5) * 1.5, z: (Math.random() - 0.5) * 2.5 }, true);
  map.groundColliders.delete(t.colliderHandle);
}

async function waveTilt(ctx: Ctx, map: LoadedMap) {
  setHazard(map, null);
  const peak = THREE.MathUtils.degToRad(LOCAL_TOKENS.galion.tiltDeg);
  const dur = 2.6;
  let pushed = false;
  ctx.bus.emit('slowmo', { factor: 0.6, ms: 300 });
  await ctx.loop.tween(dur, (k) => {
    map.tilt = peak * Math.sin(k * Math.PI);
    if (!pushed && k > 0.12) {
      pushed = true;
      // Le pont penche vers la caméra (+Z) : tout le monde glisse d'environ 1,5 m vers le bord avant ;
      // seul qui est resté sur la bande qui clignotait passe par-dessus bord.
      for (const p of ctx.state.players) effect({ kind: 'push', player: p.id, vel: [0, 1.5, 2.9], hold: dur * 0.9 });
    }
  });
  map.tilt = 0;
}

async function spongeSweep(ctx: Ctx, map: LoadedMap) {
  const b = map.def.spongeBand;
  const band = map.spongeBand;
  const sponge = map.sponge;
  setHazard(map, null);
  if (!b || !band || !sponge) return;
  const half = b.length / 2 + 3;
  const x0 = b.centerX - band.dir * half;
  const x1 = b.centerX + band.dir * half;
  sponge.visible = true;
  const hit = new Set<PlayerId>();
  await ctx.loop.tween(1.3, (k) => {
    const x = x0 + (x1 - x0) * k;
    sponge.position.set(x, 0, band.z);
    for (const p of ctx.state.players) {
      if (hit.has(p.id)) continue;
      if (Math.abs(p.pos[0] - x) < 1.6 && Math.abs(p.pos[2] - band.z) < b.width / 2 + 0.3 && p.pos[1] > -0.5) {
        hit.add(p.id);
        effect({ kind: 'push', player: p.id, vel: [band.dir * 9, 3.5, (p.pos[2] >= band.z ? 1 : -1) * 1.5] });
      }
    }
  });
  sponge.visible = false;
}

function spawnDropShadow(ctx: Ctx, map: LoadedMap) {
  const r = map.def.arena.radius * 0.5 * Math.random();
  const a = Math.random() * Math.PI * 2;
  const x = map.def.arena.center[0] + Math.cos(a) * r;
  const z = map.def.arena.center[2] + Math.sin(a) * r;
  map.pendingDropXZ = [x, z];
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    color: rendu.contour.encre, transparent: true, opacity: rendu.ombres.tache, depthWrite: false,
  }));
  shadow.position.set(x, 0.04, z);
  map.group.add(shadow);
  ctx.loop.later(1.7, () => shadow.removeFromParent());
}

async function dropAt(ctx: Ctx, map: LoadedMap, x: number, z: number) {
  let url: string | undefined;
  for (const p of ctx.state.players) for (const w of p.weapons) if (!url && w.stickerUrl) url = w.stickerUrl;
  let obj: THREE.Object3D;
  if (url) {
    const mod = await import('../sticker');
    obj = await mod.makeSticker(url, { height: 3 });
  } else {
    obj = buildProcedural({ kind: 'procedural', shape: 'giantFallback', size: [1.4, 0, 0] }, map.mapPalette, {});
  }
  obj.position.set(x, 14, z);
  map.group.add(obj);
  const R = ctx.physics.RAPIER;
  const body = ctx.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, 14, z).setCcdEnabled(true));
  ctx.physics.world.createCollider(R.ColliderDesc.ball(1.4).setDensity(4), body);
  map.transient.push({ mesh: obj, body, expiresAt: ctx.loop.time + 6 });
  await ctx.loop.wait(1.2);
  for (const p of ctx.state.players) {
    const dx = p.pos[0] - x, dz = p.pos[2] - z;
    const d = Math.hypot(dx, dz);
    if (d < 3.2) effect({ kind: 'push', player: p.id, vel: [(d > 0.01 ? dx / d : 1) * 8, 5, (d > 0.01 ? dz / d : 0) * 8] });
  }
  ctx.bus.emit('prop:triggered', { propId: 'suddendeath-drop', kind: 'suddendeath-drop' });
  ctx.bus.emit('slowmo', { factor: 0.35, ms: 260 });
}

// ---------------------------------------------------------------------------
// Chargement / déchargement
// ---------------------------------------------------------------------------
function unloadMap(ctx: Ctx) {
  if (!current) return;
  const world = ctx.physics.world;
  const bodies = new Set<RAPIER.RigidBody>();
  for (const t of current.tiles) bodies.add(t.body);
  for (const p of current.props.values()) bodies.add(p.body);
  for (const tr of current.transient) bodies.add(tr.body);
  for (const pf of current.platforms) { const b = pf.collider.parent(); if (b) bodies.add(b); }
  world.forEachCollider((c) => { if (current!.groundColliders.has(c.handle)) { const b = c.parent(); if (b) bodies.add(b); } });
  if (current.deckBody) bodies.add(current.deckBody);
  for (const b of bodies) world.removeRigidBody(b);
  ctx.three.scene.remove(current.group);
  current = null;
}

function loadMap(ctx: Ctx, mapId: MapId) {
  unloadMap(ctx);
  const def = pickBuilder(mapId)();
  const tk = tokensFor(mapId);
  const group = new THREE.Group();
  group.name = `map-${mapId}`;
  const deckGroup = new THREE.Group();
  deckGroup.name = 'map-deck';
  group.add(deckGroup);
  ctx.three.scene.add(group);
  const map: LoadedMap = {
    def, group, deckGroup, deckBody: null, mapPalette: tk.palette,
    backGrade: { saturation: tk.decor.saturation, tint: tk.decor.teinte },
    tileMesh: null, tiles: [], props: new Map(), triggerByCollider: new Map(), groundColliders: new Set(),
    platforms: [], transient: [], ringLevel: Math.max(0, ...def.tiles.map((t) => t.ring)), hazard: null, tilt: 0,
    catapult: null, sponge: null, spongeBand: null, sea: [], pendingDropXZ: null,
  };
  current = map;
  buildPhysics(ctx, map);        // 1. synchrone : le vide est ouvert dès le premier tour
  removeFallbackGround(ctx);
  ctx.loop.later(0.05, () => removeFallbackGround(ctx));
  const spawns = getSpawnPoints();
  if (spawns) { ctx.state.players[0].pos = [...spawns[0]]; ctx.state.players[1].pos = [...spawns[1]]; }
  return buildVisuals(ctx, map); // 2. asynchrone
}

// ---------------------------------------------------------------------------
// Boucle par image
// ---------------------------------------------------------------------------
const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const vec = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function updateOneWay(ctx: Ctx, map: LoadedMap) {
  for (const pf of map.platforms) {
    const { top, halfX, halfZ } = pf.spec;
    let support = false;
    for (const p of ctx.state.players) {
      const [x, y, z] = p.pos;
      const inside = Math.abs(x - top[0]) <= halfX + ONEWAY_MARGIN && Math.abs(z - top[2]) <= halfZ + ONEWAY_MARGIN;
      const above = pf.above[p.id] ? y >= top[1] - ONEWAY_EXIT : y >= top[1] + ONEWAY_ENTER;
      pf.above[p.id] = above;
      if (inside && above) support = true;
    }
    if (pf.collider.isEnabled() !== support) pf.collider.setEnabled(support);
  }
}

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
      m4.compose(vec, quat, ONE);
      map.tileMesh.setMatrixAt(t.index, m4);
      dirty = true;
    }
    if (dirty) map.tileMesh.instanceMatrix.needsUpdate = true;
  }

  for (const prop of map.props.values()) {
    if (prop.body.isDynamic()) {
      const tr = prop.body.translation();
      const rot = prop.body.rotation();
      prop.holder.position.set(tr.x, tr.y, tr.z);
      prop.holder.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      prop.worldPos.set(tr.x, tr.y, tr.z);
      if (prop.holder.parent !== map.group) map.group.attach(prop.holder);
    }
    if (prop.kind === 'launcher' && ctx.loop.time >= prop.cooldownUntil) {
      for (const p of ctx.state.players) {
        const d = Math.hypot(p.pos[0] - prop.worldPos.x, p.pos[2] - prop.worldPos.z);
        if (d > (prop.spec.triggerRadius ?? 1.2) || Math.abs(p.pos[1] - prop.worldPos.y) > 1.2) continue;
        const targets = prop.spec.launchTargets ?? [];
        const target = targets[prop.launchIdx++ % Math.max(1, targets.length)] ?? [prop.worldPos.x, 0, prop.worldPos.z];
        const T = prop.spec.launchDuration ?? 1.1;
        // Vitesse balistique (gravité du monde Rapier) pour atterrir sur la cible en T secondes.
        const vel: Vec3 = [(target[0] - p.pos[0]) / T, (target[1] - p.pos[1]) / T + 0.5 * GRAVITY * T, (target[2] - p.pos[2]) / T];
        effect({ kind: 'push', player: p.id, vel });
        prop.cooldownUntil = ctx.loop.time + T + 0.8;
        ctx.bus.emit('prop:triggered', { propId: prop.id, kind: 'launcher' });
        break;
      }
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

  updateOneWay(ctx, map);
  updateHazardBlink(ctx, map);

  if (map.def.id === 'galion') {
    // Gîte : roulis autour de l'axe long (X), le pont descend côté caméra (+Z).
    map.deckGroup.rotation.x = map.tilt;
    if (map.deckBody) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), map.tilt);
      map.deckBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    seaTime.value = ctx.loop.time;
  }
  void dt;
}

// ---------------------------------------------------------------------------
// API publique du moteur (index.ts / api.ts / map-events)
// ---------------------------------------------------------------------------
export function currentMapId(): MapId | null { return current?.def.id ?? null; }
export function currentMapDef(): MapDef | null { return current?.def ?? null; }

export function getSpawnPoints(): [Vec3, Vec3] | null {
  if (!current) return null;
  return [current.def.spawns[0].pos, current.def.spawns[1].pos];
}

export function getCrateSpots(): Vec3[] { return current?.def.crateSpots ?? []; }

/** Centre, rayon et point de réapparition du plateau (cadrage, zones d'éjection, respawn). */
export function getArenaBounds(): { center: Vec3; radius: number; respawn: Vec3; voidY: number } | null {
  if (!current) return null;
  return { center: current.def.arena.center, radius: current.def.arena.radius, respawn: current.def.respawn, voidY: current.def.voidY };
}

/** Vrai si ce collider est une plateforme traversable (corps : userData.oneWay, userData.topY). */
export function isOneWayCollider(c: RAPIER.Collider): boolean {
  return (c.parent()?.userData as { oneWay?: boolean } | undefined)?.oneWay === true;
}

export function isOverVoid(pos: Vec3): boolean {
  if (!current || !ctxRef) return true;
  const R = ctxRef.physics.RAPIER;
  const map = current;
  const ray = new R.Ray({ x: pos[0], y: pos[1] + 0.5, z: pos[2] }, { x: 0, y: -1, z: 0 });
  const hit = ctxRef.physics.world.castRay(ray, 6, true, undefined, undefined, undefined, undefined,
    (c) => map.groundColliders.has(c.handle) && c.isEnabled());
  return !hit;
}

export async function install(ctx: Ctx): Promise<void> {
  ctxRef = ctx;
  ctx.bus.on('match:start', ({ mapId }) => { void loadMap(ctx, mapId); });
  ctx.bus.on('projectile:spawn', ({ from, vel }) => { if (current) simulateProjectile(ctx, current, from, vel); });
  ctx.bus.on('hit', ({ pos }) => { if (current) proximityTrigger(ctx, current, pos); });
  ctx.bus.on('map:warn', ({ kind, mapId }) => { if (current && current.def.id === mapId) handleWarn(ctx, current, kind); });
  ctx.bus.on('map:event', ({ kind, mapId }) => { if (current && current.def.id === mapId) handleEvent(ctx, current, kind); });
  ctx.loop.addSystem('maps', (dt) => tick(ctx, dt), 200);
  window.__mapTest = (mapId: MapId) => { void loadMap(ctx, mapId); };
  window.__mapFx = (e: PlayerEffect) => effect(e); // tests : poussée / chute scriptées
}

declare global { interface Window { __mapTest?: (mapId: MapId) => void; __mapFx?: (e: PlayerEffect) => void } }
