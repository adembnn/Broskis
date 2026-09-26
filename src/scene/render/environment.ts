// Environnement : fond, brouillard, image d'éclairage (RoomEnvironment), pile de lumières PAR MAP (tokens.js
// `maps.<id>`), sol provisoire. Le sol est un simple disque : le lot LM (maps) posera le vrai décor par-dessus
// tant qu'il n'est pas livré, la scène ne doit jamais rester un vide noir (CLAUDE.md règle 7).
// Règle DA (26/09) : PAS de contre-jour — c'est la marge vinyle des contours qui détache les combattants.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
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
  
  // Custom environment elements
  const sky = new Sky();
  sky.scale.setScalar(450000);
  // Écran scindé (RTVIEW) : les caméras regardent maintenant dans toutes les directions. Face au soleil bas de
  // l'Archipel, le ciel sortait des valeurs HDR loin au-dessus du seuil du bloom : vue entièrement blanche.
  // On plafonne sa composante la plus forte sous le seuil (teinte gardée) : le bloom ne prend plus le ciel.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `texColor *= min( 1.0, ${(rendu.bloom.seuil * 0.9).toFixed(3)} / max( max( texColor.r, texColor.g ), max( texColor.b, 1e-4 ) ) );
			gl_FragColor = vec4( texColor, 1.0 );`,
  );
  scene.add(sky);
  excludeFromOcclusion(sky);
  const sun = new THREE.Vector3();

  // Archipel: islands
  const islandsGroup = new THREE.Group();
  const coneGeo = new THREE.ConeGeometry(5, 12, 5);
  const islandMat = new THREE.MeshBasicMaterial({ color: maps.archipel.palette.matiere, fog: true });
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(coneGeo, islandMat);
    const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 30 + Math.random() * 20;
    mesh.position.set(Math.cos(angle) * dist, -6, Math.sin(angle) * dist);
    islandsGroup.add(mesh);
  }
  scene.add(islandsGroup);

  // Galion: sea and rain
  const seaGeo = new THREE.PlaneGeometry(150, 150, 32, 32);
  seaGeo.rotateX(-Math.PI / 2);
  const seaMat = new THREE.MeshStandardMaterial({ color: maps.galion.palette.accent, roughness: 0.1, metalness: 0.8 });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.position.y = -3;
  scene.add(sea);

  const rainCount = 1500;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 60;
    rainPos[i * 3 + 1] = Math.random() * 30;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.15, transparent: true, opacity: 0.6 });
  const rain = new THREE.Points(rainGeo, rainMat);
  scene.add(rain);

  // Cuisine: blurry background
  const kitchenBg = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 40, 40, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: maps.cuisine.palette.fond, side: THREE.BackSide, fog: false })
  );
  kitchenBg.position.y = 5;
  scene.add(kitchenBg);

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
    
    // Toggle specific elements
    sky.visible = mapId === 'archipel' || mapId === 'galion';
    // Les fonds (îles, mer, cuisine floue) sont faits par les maps, LDECOR et LSKY : ces doublons de LDA2 restent
    // cachés (la 2e mer créait des blocs noirs au premier plan du Galion, le cylindre masquait le fond de la Cuisine).
    islandsGroup.visible = false;
    sea.visible = false;
    rain.visible = mapId === 'galion';
    kitchenBg.visible = false;

    if (sky.visible) {
      const uniforms = sky.material.uniforms;
      uniforms['turbidity'].value = mapId === 'archipel' ? 10 : 2;
      uniforms['rayleigh'].value = mapId === 'archipel' ? 3 : 0.5;
      uniforms['mieCoefficient'].value = mapId === 'archipel' ? 0.005 : 0.05;
      uniforms['mieDirectionalG'].value = 0.8;
      
      const phi = THREE.MathUtils.degToRad(90 - (mapId === 'archipel' ? 5 : 45));
      const theta = THREE.MathUtils.degToRad(mapId === 'archipel' ? 180 : 0);
      sun.setFromSphericalCoords(1, phi, theta);
      uniforms['sunPosition'].value.copy(sun);
    }
  }

  applyMap(ctx.state.mapId);
  ctx.bus.on('match:start', ({ mapId }) => applyMap(mapId));

  let time = 0;
  let nextLightning = time + 5;
  let isLightning = false;

  // Bruit sur l'intensité des lumières (±vacillement, jamais fixe) — rendu-premium §3.
  ctx.loop.addSystem('la-light-flicker', (dt, real) => {
    time = real;
    const n = Math.sin(real * 3.1) * Math.sin(real * 1.14 + 1.7);
    
    // Lightning logic for Galion
    let lightningMult = 1;
    if (ctx.state.mapId === 'galion') {
      if (time > nextLightning) {
        isLightning = true;
        nextLightning = time + 8 + Math.random() * 8;
      }
      if (isLightning) {
        if (time < nextLightning - 7.9) {
          lightningMult = 3.0;
          scene.background = new THREE.Color((maps as any).galion.eclair?.fond || '#8FA39B');
        } else {
          isLightning = false;
          scene.background = new THREE.Color((maps as any).galion.brouillard.couleur);
        }
      }
    }

    hemi.intensity = flickerHemi * (1 + flickerAmount * 0.6 * n) * (isLightning ? 1.5 : 1);
    const activeKey = spot?.visible ? spot : key;
    activeKey.intensity = flickerKey * (1 + flickerAmount * 0.5 * n) * lightningMult;
    if (practical) practical.intensity = flickerPractical * (1 + flickerAmount * n);
    
    // Animate Rain
    if (rain.visible) {
      const pos = rainGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < rainCount; i++) {
        pos[i * 3 + 1] -= dt * 25;
        if (pos[i * 3 + 1] < -3) {
          pos[i * 3 + 1] = 25 + Math.random() * 10;
          pos[i * 3] = (Math.random() - 0.5) * 60;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // Animate Sea
    if (sea.visible) {
      const pos = seaGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i];
        const z = pos[i + 2];
        pos[i + 1] = Math.sin(x * 0.3 + time * 1.5) * 0.5 + Math.cos(z * 0.2 + time) * 0.5;
      }
      seaGeo.attributes.position.needsUpdate = true;
    }
  }, 40);

  return { ground, applyMap };
}
