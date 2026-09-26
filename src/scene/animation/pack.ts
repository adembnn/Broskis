// Clips du pack KayKit « Character Animations » (public/assets/packs/animations, même squelette Rig_Medium
// que les persos). Chargés une fois en tâche de fond, puis ajoutés à chaque animateur. On ne garde que les
// rotations (et la hauteur du bassin, recalée sur le perso) : les longueurs d'os du mannequin ne doivent
// jamais déformer un perso. Jamais T-Pose. Choix des clips : plan/rendus/LATK2.md.
// Les images clés (armé, lâcher, impact) et la vitesse naturelle de la course sont MESURÉES sur le squelette
// du pack (vitesse de la main, pied d'appui), pas devinées.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = '/assets/packs/animations/Rig_Medium_';

type PackFile = 'General' | 'CombatRanged' | 'CombatMelee' | 'MovementBasic' | 'MovementAdvanced' | 'Simulation';

/** Nom interne → [fichier, clip du pack]. */
export const PACK_CLIPS: Record<string, [PackFile, string]> = {
  // lancer (grenade, throwable) : élan, lancer, accompagnement
  throwP: ['General', 'Throw'],
  // tir (blaster) : bras tendu qui vise, coup de feu
  aim1h: ['CombatRanged', 'Ranged_1H_Aiming'],
  shoot1h: ['CombatRanged', 'Ranged_1H_Shoot'],
  // bouclier : l'objet planté au sol d'un coup sec
  slam: ['CombatMelee', 'Melee_2H_Attack_Chop'],
  // garde : levée, tenue, choc encaissé, contre (parade parfaite)
  guardUp: ['CombatMelee', 'Melee_Block'],
  guardHold: ['CombatMelee', 'Melee_Blocking'],
  guardHit: ['CombatMelee', 'Melee_Block_Hit'],
  guardCounter: ['CombatMelee', 'Melee_Block_Attack'],
  // KO (fin de match) et réapparition ; les coups reçus (Hit_A, Hit_B) sont déjà dans chaque perso
  deathB: ['General', 'Death_B'],
  spawnAir: ['General', 'Spawn_Air'],
  // course directionnelle (visée verrouillée : on court de côté ou à reculons en gardant l'adversaire en face)
  runRef: ['MovementBasic', 'Running_A'],
  strafeL: ['MovementAdvanced', 'Running_Strafe_Left'],
  strafeR: ['MovementAdvanced', 'Running_Strafe_Right'],
  backpedal: ['MovementAdvanced', 'Walking_Backwards'],
  // saut périlleux du double saut
  dodgeF: ['MovementAdvanced', 'Dodge_Forward'],
  // victoire
  cheering: ['Simulation', 'Cheering'],
};

/** Images clés mesurées (secondes dans le clip). */
export interface KeyTimes {
  /** Main la plus en arrière (ou la plus haute) avant le lâcher : fin de l'élan. */
  windup: number;
  /** Vitesse de la main maximale vers l'avant (ou vers le bas) : l'objet quitte la main. */
  release: number;
}

export interface PackData {
  clips: Map<string, THREE.AnimationClip>;
  keys: Map<string, KeyTimes>;
  /** Hauteur de repos du bassin du mannequin (pour recaler hips.position sur chaque perso). */
  hipsRest: THREE.Vector3;
  /** Vitesse au sol naturelle des clips de course (unités du modèle / s, avant l'échelle du perso). */
  speeds: Map<string, number>;
  /** Raccourci : vitesse naturelle de la course (Running_A = clip `run` des persos). */
  runSpeed: number;
}

let promise: Promise<PackData> | null = null;
let ready: PackData | null = null;

/** Données du pack si déjà chargées (sinon null : l'animateur garde les clips du perso en attendant). */
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
  const speeds = new Map<string, number>();
  for (const name of ['runRef', 'strafeL', 'strafeR', 'backpedal']) {
    const clip = clips.get(name);
    if (clip) speeds.set(name, measureStride(skel, clip));
  }
  clips.delete('runRef'); // mesure seulement : les persos ont déjà ce clip sous le nom `run`
  // Libère la géométrie des mannequins : seuls les clips servent.
  for (const g of gltfs.values()) g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  return { clips, keys, hipsRest, speeds, runSpeed: speeds.get('runRef') ?? 0 };
}

/** Échantillonne `bone` (repère du mannequin) sur tout le clip, à 120 i/s. */
function sampleBone(skel: THREE.Object3D, clip: THREE.AnimationClip, boneName: string): THREE.Vector3[] {
  const bone = skel.getObjectByName(boneName);
  if (!bone) return [];
  const mixer = new THREE.AnimationMixer(skel);
  const action = mixer.clipAction(clip);
  action.play();
  const step = 1 / 120;
  const n = Math.max(2, Math.floor(clip.duration / step));
  const out: THREE.Vector3[] = [];
  const inv = new THREE.Matrix4();
  for (let i = 0; i <= n; i++) {
    mixer.setTime(Math.min(clip.duration, i * step));
    skel.updateMatrixWorld(true);
    inv.copy(skel.matrixWorld).invert();
    out.push(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv));
  }
  action.stop();
  mixer.uncacheRoot(skel);
  return out;
}

/**
 * Armé et lâcher d'un geste de la main droite (`handslotr`, repère du perso, +Z = devant). Lâcher = pic de
 * vitesse vers l'avant (ou vers le bas pour un coup planté au sol) ; armé = main la plus en arrière (ou la
 * plus haute) avant ce pic.
 */
function measureKeys(skel: THREE.Object3D, clip: THREE.AnimationClip, downward: boolean): KeyTimes {
  const pos = sampleBone(skel, clip, 'handslotr');
  if (pos.length < 3) return { windup: clip.duration * 0.3, release: clip.duration * 0.45 };
  const step = 1 / 120;
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

/**
 * Vitesse au sol naturelle d'un cycle de course : vitesse horizontale moyenne du pied d'appui (le plus bas)
 * par rapport au bassin. Jouer le clip à (vitesse réelle / cette vitesse) = pieds qui ne patinent pas.
 */
function measureStride(skel: THREE.Object3D, clip: THREE.AnimationClip): number {
  const l = sampleBone(skel, clip, 'footl');
  const r = sampleBone(skel, clip, 'footr');
  if (l.length < 3 || l.length !== r.length) return 0;
  const step = 1 / 120;
  let sum = 0, n = 0;
  for (let i = 1; i < l.length; i++) {
    const low = l[i].y <= r[i].y ? l : r;
    const other = low === l ? r : l;
    if (other[i].y - low[i].y < 0.05) continue; // double appui : ambigu
    sum += Math.hypot(low[i].x - low[i - 1].x, low[i].z - low[i - 1].z) / step;
    n++;
  }
  return n ? sum / n : 0;
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
