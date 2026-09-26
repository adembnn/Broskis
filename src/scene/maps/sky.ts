// Lot LSKY : fond panoramique peint de chaque arène (image générée par tools/sky/generate-panos.mjs).
// Une seule texture par map (≈ 300 Ko en WebP) remplace le ciel dégradé et le décor lointain en 3D : un vrai
// « lieu » derrière l'arène pour 3 appels de dessin (paroi + 2 bouchons), quelle que soit la direction.
// Projection : un grand cylindre centré sur l'arène, vu de l'intérieur, où la peinture fait `repetitions` fois
// le tour (2 = une copie par demi-tour : deux fois plus de détail qu'un équirectangulaire 360°, et les deux
// vues de l'écran scindé, dos à dos, voient le même paysage). Le haut et le bas se ferment sur la couleur
// moyenne de la première et de la dernière rangée (bouchons, `haut` et `bas` dans les tokens).
// Réglages : tokens.js `maps.<map>.panorama`. Ni brouillard, ni tone mapping, ni raycast, ni occlusion.
// Les éclairs du galion multiplient `intensite` via `setSkyFlash`.
import * as THREE from 'three';
import { maps } from '../../art/tokens.js';
import type { MapId } from '../../core/types';
import { excludeFromOcclusion } from '../registry';

interface PanoramaTokens {
  image: string; rotation: number; intensite: number; repetitions: number;
  horizon: number; haut: string; bas: string; // horizon : fraction de la hauteur de l'image, depuis le haut
  chroma: number; // saturation visée À L'ÉCRAN (1 = celle de la peinture), après l'étalonnage de postfx
  brume: number;  // part de la couleur du brouillard mêlée à la peinture : le fond et la 3D lointaine se fondent
}
type MapSkyTokens = {
  panorama?: PanoramaTokens; decor?: { saturation?: number }; brouillard?: { couleur: string };
  eclair?: { fond: string; facteur: number };
};
/** Plafond du flash d'éclair sur le panorama (au-delà, le bloom lave l'image). */
const ECLAIR_MAX = 1.8;

/** Rayon du cylindre (m) : loin devant l'arène (parallaxe faible), dans le plan lointain de la caméra (400). */
const RAYON = 300;
const loader = new THREE.TextureLoader();
let root: THREE.Mesh | null = null;
let demande = 0; // ignore une image arrivée après un changement de map
let base = 1;

function tokens(mapId: MapId): MapSkyTokens | undefined {
  return (maps as unknown as Record<string, MapSkyTokens>)[mapId];
}

/** L'étalonnage final (postfx) désature toute l'image de `decor.saturation` : la peinture est compensée ici
 *  (même formule inversée, luminance conservée) pour arriver à `chroma` à l'écran. */
function compenser(mat: THREE.MeshBasicMaterial, sat: number, brume: THREE.Color, part: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkySat = { value: sat };
    shader.uniforms.uBrume = { value: brume };
    shader.uniforms.uPart = { value: part };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSkySat;\nuniform vec3 uBrume;\nuniform float uPart;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, uSkySat), 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uBrume, uPart);`);
  };
}

function fondMat(color: THREE.ColorRepresentation, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, map, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false });
}

/** Pose le panorama de la map (asynchrone) ; libère le précédent. */
export function applySky(scene: THREE.Scene, mapId: MapId): void {
  clearSky();
  const t = tokens(mapId);
  const p = t?.panorama;
  if (!p) return;
  const sat = p.chroma / Math.max(0.2, t?.decor?.saturation ?? 1);
  const n = ++demande;
  loader.load(p.image, (tex) => {
    if (n !== demande) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -p.repetitions; // vu de l'intérieur : on retourne l'image pour qu'elle se lise à l'endroit
    tex.anisotropy = 4;
    const img = tex.image as { width: number; height: number };
    // Hauteur du cylindre : garde les proportions de la peinture (un tour = `repetitions` largeurs d'image).
    const h = (2 * Math.PI * RAYON / p.repetitions) * (img.height / img.width);
    const geo = new THREE.CylinderGeometry(RAYON, RAYON, h, 96, 1, false);
    const mats = [fondMat(0xffffff, tex), fondMat(p.haut), fondMat(p.bas)];
    const brume = new THREE.Color(t?.brouillard?.couleur ?? '#ffffff');
    for (const m of mats) compenser(m, sat, brume, p.brume);
    base = p.intensite;
    for (const m of mats) m.color.multiplyScalar(base);
    mats[0].userData.teinte = 0xffffff;
    mats[1].userData.teinte = p.haut;
    mats[2].userData.teinte = p.bas;
    root = new THREE.Mesh(geo, mats);
    root.name = 'lsky-panorama';
    // L'horizon peint tombe à hauteur de l'arène (y = 0).
    root.position.y = (p.horizon - 0.5) * h;
    root.rotation.y = p.rotation;
    root.renderOrder = -1000;
    root.frustumCulled = false;
    root.raycast = () => {};
    // Éclairs (galion) : render/environment.ts passe le fond à `eclair.fond` pendant le flash ; le fond étant
    // caché par le panorama, on reporte ce flash sur la peinture elle-même.
    const eclair = t?.eclair ? new THREE.Color(t.eclair.fond) : null;
    const flash = Math.min(ECLAIR_MAX, t?.eclair?.facteur ?? 1);
    let actif = 1;
    root.onBeforeRender = (_r, sc) => {
      const f = eclair && sc.background instanceof THREE.Color && sc.background.equals(eclair) ? flash : 1;
      if (f !== actif) { actif = f; setSkyFlash(f); }
    };
    excludeFromOcclusion(root);
    scene.add(root);
  });
}

/** Éclair : multiplie la luminosité du panorama (1 = normal). */
export function setSkyFlash(facteur: number): void {
  if (!root) return;
  for (const m of root.material as THREE.MeshBasicMaterial[]) m.color.set(m.userData.teinte).multiplyScalar(base * facteur);
}

/** Retire et libère le panorama courant (changement de map). */
export function clearSky(): void {
  demande++;
  if (!root) return;
  root.removeFromParent();
  root.geometry.dispose();
  for (const m of root.material as THREE.MeshBasicMaterial[]) { m.map?.dispose(); m.dispose(); }
  root = null;
}
