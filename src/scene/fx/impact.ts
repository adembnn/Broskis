// Flash sur la cible, onde de choc (parade), chiffres de dégâts (contrat LA §6). Tout est pool-based : pas
// d'allocation dans la boucle une fois le pool rempli (perf, design-system-cartoon.md §4.4/§6).
import * as THREE from 'three';
import { juice, palette, polices, rendu, ui } from '../../art/tokens.js';
import type { PlayerId } from '../../core/types';
import { LOCAL_TOKENS } from '../localTokens';
import { getFighterObject } from '../api';
import { excludeFromOcclusion } from '../registry';
import { TEXTURE_VIDE } from '../../core/shaders';

// ---------------------------------------------------------------------------
// Flash blanc (en fait palette.lumiere : "seul à franchir le bloom") sur la cible touchée.
// ---------------------------------------------------------------------------
interface FlashTarget { material: THREE.MeshToonMaterial; t: number }
function collectToonMaterials(root: THREE.Object3D): THREE.MeshToonMaterial[] {
  const mats: THREE.MeshToonMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.MeshToonMaterial | undefined;
    if (mesh.isMesh && mat && !Array.isArray(mat) && 'emissive' in mat) mats.push(mat);
  });
  return mats;
}

// ---------------------------------------------------------------------------
// Onde de choc (parade) — anneau qui s'étend et s'efface, pool recyclé.
// ---------------------------------------------------------------------------
interface ShockRing { mesh: THREE.Mesh; t: number; dur: number; radius: number }

// ---------------------------------------------------------------------------
// Chiffres de dégâts — sprite billboard (texture canvas), pop élastique puis montée/fondu.
// ---------------------------------------------------------------------------
interface DamageSprite { sprite: THREE.Sprite; t: number }
const numberTextureCache = new Map<string, THREE.CanvasTexture>();
function numberTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  let tex = numberTextureCache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 100;
  const c = canvas.getContext('2d')!;
  c.font = `800 64px ${polices.titre}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = ui.contourTexte.grand * 1.2;
  c.lineJoin = 'round';
  c.strokeStyle = rendu.contour.encre;
  c.strokeText(text, 80, 54);
  c.fillStyle = color;
  c.fillText(text, 80, 54);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  numberTextureCache.set(key, tex);
  return tex;
}

export interface ImpactFx {
  hitFlash(player: PlayerId): void;
  shockwave(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius: number): void;
  damageNumber(pos: THREE.Vector3, amount: number, color: string): void;
  update(dt: number): void;
}

export function installImpactFx(scene: THREE.Scene): ImpactFx {
  const flashes: FlashTarget[] = [];
  const FLASH_DUR = 0.09;

  const ringPool: ShockRing[] = [];
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40, 1);
  for (let i = 0; i < LOCAL_TOKENS.shockwave.pool; i++) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.raycast = () => {};
    scene.add(mesh);
    excludeFromOcclusion(mesh);
    ringPool.push({ mesh, t: 0, dur: 0.35, radius: 3 });
  }

  const spritePool: DamageSprite[] = [];
  // perf : map posée dès la création (LPERF) : le shader « avec image » est compilé par la préchauffe, pas au 1er coup.
  const spriteMat = () => new THREE.SpriteMaterial({ map: TEXTURE_VIDE, transparent: true, depthWrite: false });

  function hitFlash(player: PlayerId): void {
    const root = getFighterObject(player);
    if (!root) return;
    for (const material of collectToonMaterials(root)) {
      material.emissive.set(palette.lumiere);
      flashes.push({ material, t: 0 });
    }
  }

  function shockwave(pos: THREE.Vector3, color: THREE.ColorRepresentation, radius: number): void {
    const ring = ringPool.find((r) => !r.mesh.visible) ?? ringPool[0];
    ring.mesh.position.copy(pos).setY(0.03);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    ring.t = 0; ring.dur = 0.4; ring.radius = radius;
    ring.mesh.visible = true;
  }

  function damageNumber(pos: THREE.Vector3, amount: number, color: string): void {
    let entry = spritePool.find((s) => !s.sprite.visible);
    if (!entry) {
      if (spritePool.length >= LOCAL_TOKENS.damageNumbers.maxAlive) entry = spritePool[0];
      else { entry = { sprite: new THREE.Sprite(spriteMat()), t: 0 }; entry.sprite.raycast = () => {}; scene.add(entry.sprite); excludeFromOcclusion(entry.sprite); spritePool.push(entry); } // sans raycast : la caméra lance des rayons sur la scène (erreur « Raycaster.camera »)
    }
    entry.sprite.material.map = numberTexture(`-${Math.round(amount)}`, color);
    entry.sprite.material.needsUpdate = true;
    entry.sprite.position.copy(pos);
    entry.sprite.scale.set(1.6, 1, 1);
    entry.t = 0;
    entry.sprite.visible = true;
  }

  function update(dt: number): void {
    if (dt <= 0) return;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      if (f.t >= FLASH_DUR) { f.material.emissive.set('#000000'); flashes.splice(i, 1); }
      else f.material.emissive.set(palette.lumiere).multiplyScalar(1 - f.t / FLASH_DUR);
    }
    for (const r of ringPool) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) { r.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - u, 3);
      r.mesh.scale.setScalar(0.2 + e * r.radius);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - u * u;
    }
    for (const s of spritePool) {
      if (!s.sprite.visible) continue;
      s.t += dt;
      const life = LOCAL_TOKENS.damageNumbers.life;
      if (s.t >= life) { s.sprite.visible = false; continue; }
      const overshoot = juice.toucher.chiffre;
      const pop = s.t < 0.12 ? THREE.MathUtils.lerp(0.2, overshoot, s.t / 0.12) : THREE.MathUtils.lerp(overshoot, 1, Math.min(1, (s.t - 0.12) / 0.15));
      s.sprite.scale.set(pop * 1.6, pop, 1);
      s.sprite.position.y += dt * 0.6;
      s.sprite.material.opacity = 1 - Math.max(0, (s.t - life * 0.5) / (life * 0.5));
    }
  }

  return { hitFlash, shockwave, damageNumber, update };
}
