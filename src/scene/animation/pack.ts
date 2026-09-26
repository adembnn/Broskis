// Clips du pack KayKit « Character Animations » (public/assets/packs/animations, même squelette Rig_Medium
// que les persos). Chargés une fois en tâche de fond, puis ajoutés à chaque animateur. On ne garde que les
// rotations (et la hauteur du bassin, recalée sur le perso) : les longueurs d'os du mannequin ne doivent
// jamais déformer un perso. Jamais T-Pose. Choix des clips : plan/rendus/LATK2.md.
// Les images clés (armé, lâcher, impact) sont MESURÉES sur le squelette du pack (vitesse de la main), pas
// devinées : le lâcher tombe sur la bonne image quel que soit le clip.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = '/assets/packs/animations/Rig_Medium_';

type PackFile = 'General' | 'CombatRanged' | 'CombatMelee' | 'MovementBasic' | 'Simulation';

/** Nom interne → [fichier, clip du pack]. */
export const PACK_CLIPS: Record<string, [PackFile, string]> = {
  // lancer (grenade, throwable) : élan, lancer, accompagnement
  throwP: ['General', 'Throw'],
  // tir (blaster) : bras tendu qui vise, coup de feu
  aim1h: ['CombatRanged', 'Ranged_1H_Aiming'],
  shoot1h: ['CombatRanged', 'Ranged_1H_Shoot'],
  // bouclier : l'objet planté au sol d'un coup sec
  slam: ['CombatMelee', 'Melee_2H_Attack_Chop'],
  // parade : garde levée, tenue, choc encaissé, contre
  guardUp: ['CombatMelee', 'Melee_Block'],
  guardHold: ['CombatMelee', 'Melee_Blocking'],
  guardHit: ['CombatMelee', 'Melee_Block_Hit'],
  guardCounter: ['CombatMelee', 'Melee_Block_Attack'],
  // coups reçus, KO, réapparition
  hitA: ['General', 'Hit_A'],
  hitB: ['General', 'Hit_B'],
  deathB: ['General', 'Death_B'],
  spawnAir: ['General', 'Spawn_Air'],
  // vol et réception
  airborne: ['MovementBasic', 'Jump_Idle'],
  land: ['MovementBasic', 'Jump_Land'],
  jumpStart: ['MovementBasic', 'Jump_Start'],
  // victoire
  cheering: ['Simulation', 'Cheering'],
};

/** Images clés mesurées (secondes dans le clip). */
export interface KeyTimes {
  /** Main la plus en arrière avant le lâcher (fin de l'élan). */
  windup: number;
  /** Vitesse de la main maximale vers l'avant : l'objet quitte la main. */
  release: number;
}

export interface PackData {
  clips: Map<string, THREE.AnimationClip>;
  keys: Map<string, KeyTimes>;
  /** Hauteur de repos du bassin du mannequin (pour recaler hips.position sur chaque perso). */
  hipsRest: THREE.Vector3;
}

let promise: Promise<PackData> | null = null;
let ready: PackData | null = null;

/** Données du pack si déjà chargées (sinon null : l'animateur garde les 13 clips du perso en attendant). */
export function packData(): PackData | null {
  return ready;
}

/** Lance le chargement (une seule fois). */
export function loadPack(): Promise<PackData> {
  if (!promise) {
    promise = doLoad().then((d) => { ready = d; return d; });
    promise.catch((e) => console.error('[animation] pack', e));
  }
  return promise;
}

function keepTrack(t: THREE.KeyframeTrack): boolean {
  if (t.name.endsWith('.quaternion')) return true;
  return t.name === 'hips.position';
}

async function doLoad(): Promise<PackData> {
  const loader = new GLTFLoader();
  const files = [...new Set(Object.values(PACK_CLIPS).map(([f]) => f))];
  const gltfs = new Map<PackFile, Awaited<ReturnType<GLTFLoader['loadAsync']>>>();
  await Promise.all(files.map(async (f) => { gltfs.set(f, await loader.loadAsync(`${DIR}${f}.glb`)); }));

  const clips = new Map<string, THREE.AnimationClip>();
  for (const [name, [file, clipName]] of Object.entries(PACK_CLIPS)) {
    const src = gltfs.get(file)?.animations.find((a) => a.name === clipName);
    if (!src) { console.warn('[animation] clip absent du pack', file, clipName); continue; }
    clips.set(name, new THREE.AnimationClip(name, src.duration, src.tracks.filter(keepTrack).map((t) => t.clone())));
  }

  // Squelette de mesure : la scène du fichier General (mannequin Rig_Medium, mêmes os que les persos).
  const skel = gltfs.get('General')!.scene;
  const hips = skel.getObjectByName('hips');
  const hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
  const keys = new Map<string, KeyTimes>();
  for (const name of ['throwP', 'slam', 'guardCounter', 'shoot1h']) {
    const clip = clips.get(name);
    if (clip) keys.set(name, measureKeys(skel, clip, name === 'slam'));
  }
  // Libère la géométrie des mannequins : seuls les clips servent.
  for (const g of gltfs.values()) g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  return { clips, keys, hipsRest };
}

/**
 * Mesure l'armé et le lâcher d'un geste de la main droite : échantillonne le clip à 120 i/s sur le squelette
 * de mesure, suit `handslotr` dans le repère du perso (+Z = devant). Lâcher = pic de vitesse vers l'avant
 * (ou vers le bas pour un coup planté au sol) ; armé = main la plus en arrière (ou la plus haute) avant.
 */
function measureKeys(skel: THREE.Object3D, clip: THREE.AnimationClip, downward: boolean): KeyTimes {
  const hand = skel.getObjectByName('handslotr');
  if (!hand) return { windup: clip.duration * 0.3, release: clip.duration * 0.45 };
  const mixer = new THREE.AnimationMixer(skel);
  const action = mixer.clipAction(clip);
  action.play();
  const step = 1 / 120;
  const n = Math.max(2, Math.floor(clip.duration / step));
  const pos: THREE.Vector3[] = [];
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    mixer.setTime(Math.min(clip.duration, i * step));
    skel.updateMatrixWorld(true);
    inv.copy(skel.matrixWorld).invert();
    p.setFromMatrixPosition(hand.matrixWorld).applyMatrix4(inv);
    pos.push(p.clone());
  }
  action.stop();
  mixer.uncacheRoot(skel);
  // Composante suivie : avant (+Z) pour un lancer, bas (-Y) pour un coup planté.
  const comp = (v: THREE.Vector3) => (downward ? -v.y : v.z);
  let release = 1, best = -Infinity;
  for (let i = 1; i < pos.length; i++) {
    const v = (comp(pos[i]) - comp(pos[i - 1])) / step;
    if (v > best) { best = v; release = i; }
  }
  let windup = 0, back = Infinity;
  for (let i = 0; i < release; i++) {
    if (comp(pos[i]) < back) { back = comp(pos[i]); windup = i; }
  }
  return { windup: windup * step, release: release * step };
}

/** Clip du pack recalé sur un perso : hips.position décalée de (repos du perso − repos du mannequin). */
export function fitClipToRig(clip: THREE.AnimationClip, hipsRest: THREE.Vector3, rigHipsRest: THREE.Vector3): THREE.AnimationClip {
  const dx = rigHipsRest.x - hipsRest.x, dy = rigHipsRest.y - hipsRest.y, dz = rigHipsRest.z - hipsRest.z;
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-4) return clip;
  const tracks = clip.tracks.map((t) => {
    if (t.name !== 'hips.position') return t;
    const c = t.clone();
    for (let i = 0; i < c.values.length; i += 3) { c.values[i] += dx; c.values[i + 1] += dy; c.values[i + 2] += dz; }
    return c;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
