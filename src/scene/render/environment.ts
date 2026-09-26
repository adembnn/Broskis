// Environnement : fond, brouillard, image d'éclairage (RoomEnvironment), pile de lumières PAR MAP (tokens.js
// `maps.<id>`), sol provisoire. Le sol est un simple disque : le lot LM (maps) posera le vrai décor par-dessus
// tant qu'il n'est pas livré, la scène ne doit jamais rester un vide noir (CLAUDE.md règle 7).
// Règle DA (26/09) : PAS de contre-jour — c'est la marge vinyle des contours qui détache les combattants.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { maps, rendu } from '../../art/tokens.js';
import type { Ctx, MapId } from '../../core/types';
import { LOCAL_TOKENS } from '../localTokens';
import { excludeFromOcclusion } from '../registry';
import { createToonMaterial } from './toon';

// core/ctx.ts ne connaît pas encore la valeur 'None' (tokens.rendu.toneMapping) : on corrige ici sans y
// toucher (hors de nos chemins). Signalé dans le rendu du lot.
const TONE_MAPPING_FIX: Record<string, THREE.ToneMapping> = {
  AgX: THREE.AgXToneMapping,
  ACES: THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
  None: THREE.NoToneMapping,
};

interface MapPrincipale {
  type: 'directionnelle' | 'spot';
  couleur: string;
  intensite: number;
  position: [number, number, number];
  angle?: number;
  penombre?: number;
  decroissance?: number;
}
interface MapEnv {
  palette: { fond: string; sol: string; matiere: string; accent: string; lumiere: string };
  brouillard: { couleur: string; debut: number; fin: number };
  hemi: { ciel: string; sol: string; intensite: number };
  principale: MapPrincipale;
  pratique: { couleur: string; intensite: number; portee: number; decroissance: number; vacillement: number };
}

function mapEnv(mapId: MapId): MapEnv {
  const table = maps as unknown as Record<string, MapEnv>;
  return table[mapId] ?? table.archipel;
}

export interface EnvironmentHandles {
  ground: THREE.Mesh;
  applyMap(mapId: MapId): void;
}

export function installEnvironment(ctx: Ctx): EnvironmentHandles {
  const { scene, renderer } = ctx.three;
  renderer.toneMapping = TONE_MAPPING_FIX[rendu.toneMapping] ?? renderer.toneMapping;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = rendu.environnement;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(LOCAL_TOKENS.arena.radius, 48),
    createToonMaterial('#ffffff', { steps: rendu.paliers.decor }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'la-ground';
  scene.add(ground);
  excludeFromOcclusion(ground);

  const hemi = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  key.castShadow = true;
  key.shadow.mapSize.set(rendu.ombres.taille, rendu.ombres.taille);
  key.shadow.bias = rendu.ombres.biais;
  key.shadow.normalBias = rendu.ombres.biaisNormal;
  scene.add(hemi, key, key.target);
  let spot: THREE.SpotLight | null = null;
  let practical: THREE.PointLight | null = null;

  let flickerHemi = 1;
  let flickerKey = 1;
  let flickerPractical = 1;
  let flickerAmount = 0.08;

  function applyMap(mapId: MapId): void {
    ground.visible = false;
    const m = mapEnv(mapId);
    const r = LOCAL_TOKENS.arena.radius;

    scene.background = new THREE.Color(m.brouillard.couleur);
    scene.fog = new THREE.Fog(m.brouillard.couleur, m.brouillard.debut, m.brouillard.fin);
    (ground.material as THREE.MeshToonMaterial).color.set(m.palette.sol);

    hemi.color.set(m.hemi.ciel);
    hemi.groundColor.set(m.hemi.sol);
    hemi.intensity = m.hemi.intensite;
    flickerHemi = m.hemi.intensite;

    if (m.principale.type === 'spot') {
      if (!spot) {
        spot = new THREE.SpotLight();
        spot.castShadow = true;
        spot.shadow.mapSize.set(rendu.ombres.taille, rendu.ombres.taille);
        spot.shadow.bias = rendu.ombres.biais;
        spot.shadow.normalBias = rendu.ombres.biaisNormal;
        scene.add(spot, spot.target);
      }
      key.visible = false;
      spot.visible = true;
      spot.color.set(m.principale.couleur);
      spot.intensity = m.principale.intensite;
      spot.position.set(...m.principale.position);
      spot.angle = m.principale.angle ?? 0.6;
      spot.penumbra = m.principale.penombre ?? 0.3;
      spot.decay = m.principale.decroissance ?? 1;
      flickerKey = m.principale.intensite;
    } else {
      if (spot) spot.visible = false;
      key.visible = true;
      key.color.set(m.principale.couleur);
      key.intensity = m.principale.intensite;
      key.position.set(...m.principale.position);
      Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 4 });
      key.shadow.camera.updateProjectionMatrix();
      flickerKey = m.principale.intensite;
    }

    if (!practical) { practical = new THREE.PointLight(); practical.castShadow = false; scene.add(practical); }
    practical.color.set(m.pratique.couleur);
    practical.intensity = m.pratique.intensite;
    practical.distance = m.pratique.portee;
    practical.decay = m.pratique.decroissance;
    practical.position.set(2, 2.4, 2); // générique : les vraies torches/lanternes viendront du décor (lot LM)
    flickerPractical = m.pratique.intensite;
    flickerAmount = m.pratique.vacillement;
  }

  applyMap(ctx.state.mapId);
  ctx.bus.on('match:start', ({ mapId }) => applyMap(mapId));

  // Bruit sur l'intensité des lumières (±vacillement, jamais fixe) — rendu-premium §3.
  ctx.loop.addSystem('la-light-flicker', (_dt, real) => {
    const n = Math.sin(real * 3.1) * Math.sin(real * 1.14 + 1.7);
    hemi.intensity = flickerHemi * (1 + flickerAmount * 0.6 * n);
    const activeKey = spot?.visible ? spot : key;
    activeKey.intensity = flickerKey * (1 + flickerAmount * 0.5 * n);
    if (practical) practical.intensity = flickerPractical * (1 + flickerAmount * n);
  }, 40);

  return { ground, applyMap };
}
