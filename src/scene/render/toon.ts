// Rendu toon : rampe en paliers + contours "inverted hull". Port TypeScript de toon-kit.js
// (C:\Users\Adem\repos\bagarre-de-taverne\toon-kit.js, §2 à §4), adapté à la direction « Vinyle » :
// hiérarchie du trait — rien = décor ; encre = objet interactif ; encre + marge vinyle = ce qui est en jeu
// (combattants, armes, projectiles). `addVinylShells` construit les 3 coques empilées de `rendu.contour`
// (§2 de la consigne DA du 26/09) ; `addOutline` reste dispo pour un simple contour encre (objets interactifs).
import * as THREE from 'three';
import { rendu } from '../../art/tokens.js';

const _gradientCache = new Map<string, THREE.DataTexture>();

/** Rampe de toon shading en N paliers (DataTexture N×1, RedFormat, NearestFilter). */
export function makeGradientMap(steps = rendu.paliers.heros, min = rendu.paliers.plancher, max = 1): THREE.DataTexture {
  const n = Math.max(2, Math.floor(steps));
  const key = `${n}|${min}|${max}`;
  const cached = _gradientCache.get(key);
  if (cached) return cached;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round((min + (max - min) * (i / (n - 1))) * 255);
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradientCache.set(key, tex);
  return tex;
}

export interface ToonMaterialOptions {
  steps?: number;
  gradientMin?: number;
  map?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
  emissive?: THREE.ColorRepresentation;
  side?: THREE.Side;
}

/** MeshToonMaterial + rampe partagée. `steps` : rendu.paliers.heros (persos/armes) ou .decor (fond, pas nous). */
export function createToonMaterial(color: THREE.ColorRepresentation, opts: ToonMaterialOptions = {}): THREE.MeshToonMaterial {
  const { steps = rendu.paliers.heros, gradientMin = rendu.paliers.plancher, ...rest } = opts;
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: makeGradientMap(steps, gradientMin),
    ...rest,
  });
}

/** Attribut `outlineNormal` = moyenne des normales des sommets partageant une position (comble les trous du contour). */
export function computeOutlineNormals(geometry: THREE.BufferGeometry, precision = 1e4): THREE.BufferAttribute {
  const existing = geometry.getAttribute('outlineNormal') as THREE.BufferAttribute | undefined;
  if (existing) return existing;
  const pos = geometry.getAttribute('position');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const nrm = geometry.getAttribute('normal');

  const acc = new Map<string, [number, number, number]>();
  const keys = new Array<string>(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * precision)}|${Math.round(pos.getY(i) * precision)}|${Math.round(pos.getZ(i) * precision)}`;
    keys[i] = k;
    let a = acc.get(k);
    if (!a) { a = [0, 0, 0]; acc.set(k, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(keys[i])!;
    const len = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / len; out[i * 3 + 1] = a[1] / len; out[i * 3 + 2] = a[2] / len;
  }
  const attr = new THREE.BufferAttribute(out, 3);
  geometry.setAttribute('outlineNormal', attr);
  return attr;
}

const _shellMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

function outlineOnBeforeCompile(this: THREE.Material, shader: { uniforms: Record<string, unknown>; vertexShader: string }): void {
  shader.uniforms.uOutlineThickness = this.userData.thicknessUniform;
  shader.vertexShader =
    'attribute vec3 outlineNormal;\nuniform float uOutlineThickness;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\ttransformed += outlineNormal * uOutlineThickness;',
    );
}

function getShellMaterial(color: THREE.ColorRepresentation, thickness: number, depthWrite: boolean): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}|${thickness.toFixed(5)}|${depthWrite}`;
  let m = _shellMaterialCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, depthWrite });
  m.userData.thicknessUniform = { value: thickness };
  m.onBeforeCompile = outlineOnBeforeCompile;
  m.customProgramCacheKey = () => `la-shell-${depthWrite}`;
  _shellMaterialCache.set(key, m);
  return m;
}

const _ws = new THREE.Vector3();

/** Une coque inversée (BackSide, extrudée le long des normales lissées) partageant la géométrie de `mesh`. */
function buildShell(mesh: THREE.Mesh, thickness: number, color: THREE.ColorRepresentation, depthWrite: boolean): THREE.Mesh {
  const geometry = mesh.geometry;
  computeOutlineNormals(geometry);
  mesh.updateWorldMatrix(true, false);
  mesh.getWorldScale(_ws);
  const s = Math.max(Math.abs(_ws.x), Math.abs(_ws.y), Math.abs(_ws.z)) || 1;
  const material = getShellMaterial(color, thickness / s, depthWrite);

  let shell: THREE.Mesh;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as THREE.SkinnedMesh;
    const out = new THREE.SkinnedMesh(geometry, material);
    out.bindMode = skinned.bindMode;
    out.bind(skinned.skeleton, skinned.bindMatrix);
    shell = out;
  } else if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const inst = mesh as THREE.InstancedMesh;
    const out = new THREE.InstancedMesh(geometry, material, inst.instanceMatrix.count);
    out.instanceMatrix = inst.instanceMatrix;
    out.count = inst.count;
    shell = out;
  } else {
    shell = new THREE.Mesh(geometry, material);
  }
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.raycast = () => {};
  shell.userData.isOutline = true;
  mesh.add(shell);
  return shell;
}

/** Contour simple (encre seule) : objets interactifs mais pas "en jeu" (hiérarchie du trait, règle 1). */
export function addOutline(mesh: THREE.Mesh, thickness = rendu.contour.epaisseur.prop, color: THREE.ColorRepresentation = rendu.contour.encre): THREE.Mesh {
  const existing = mesh.userData.outline as THREE.Mesh | undefined;
  if (existing) return existing;
  const shell = buildShell(mesh, thickness, color, true);
  shell.name = `${mesh.name || 'mesh'}__outline`;
  mesh.userData.outline = shell;
  return shell;
}

export interface VinylShells {
  /** Liseré d'encre extérieur (le plus loin). */
  lisere: THREE.Mesh;
  /** Marge vinyle (depthWrite false — ne mange pas ce qu'il y a derrière). */
  vinyle: THREE.Mesh;
  /** Fin trait d'encre collé au corps (le plus proche). */
  encre: THREE.Mesh;
}

/**
 * Les 3 coques de la règle 2 (consigne DA du 26/09) : liseré d'encre extérieur, marge vinyle, encre fine.
 * Réservé à ce qui est "en jeu" (combattants ici). `setVinylRenderOrder` doit être appelé ensuite (et à
 * chaque frame) pour intercaler les combattants du plus loin au plus proche — sinon la marge du perso de
 * devant est mangée par le corps de celui de derrière.
 */
export function addVinylShells(mesh: THREE.Mesh): VinylShells {
  const e = rendu.contour.epaisseur;
  const lisere = buildShell(mesh, e.lisere, rendu.contour.encre, true);
  const vinyle = buildShell(mesh, e.vinyle, rendu.contour.vinyle, false);
  const encre = buildShell(mesh, e.encre, rendu.contour.encre, true);
  lisere.name = `${mesh.name || 'mesh'}__lisere`;
  vinyle.name = `${mesh.name || 'mesh'}__vinyle`;
  encre.name = `${mesh.name || 'mesh'}__encre`;
  return { lisere, vinyle, encre };
}

/** Ordre de dessin (règle 2) : `rank` 0 = plus loin de la caméra, 1 = plus proche. */
export function setVinylRenderOrder(mesh: THREE.Mesh, shells: VinylShells, rank: number): void {
  const o = rendu.contour.ordre;
  const step = rank * o.rang;
  shells.lisere.renderOrder = o.lisere + step;
  shells.vinyle.renderOrder = o.vinyle + step;
  shells.encre.renderOrder = o.perso + step;
  mesh.renderOrder = o.perso + step;
}

export function disposeToonAssets(): void {
  for (const t of _gradientCache.values()) t.dispose();
  for (const m of _shellMaterialCache.values()) m.dispose();
  _gradientCache.clear();
  _shellMaterialCache.clear();
}
