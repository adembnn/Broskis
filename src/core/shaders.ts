// Préchauffe des shaders au début de chaque match (lot LPERF). three.js compile un shader la 1re fois qu'un
// matériau est dessiné, et la clé de chaque shader dépend du nombre de lumières : ceux compilés dans les menus
// ne servent plus une fois la map chargée (elle ajoute ses lumières). Mesuré : 1re visée = 90 à 350 ms de gel (aides de
// visée), 1er impact = 76 à 104 ms (particules). À la 1re phase jouable de chaque match (map et lumières en
// place ; en temps réel : le compte à rebours), on compile en tâche de fond toute la scène, même cachée.
// Complète le préchargement des menus (lot LLOAD) : un shader déjà compilé ne coûte presque rien ici.
import * as THREE from 'three';
import type { Bus } from './bus';
import { PHASES_DE_JEU } from './quality';
import type { Three } from './types';

/**
 * Texture 1×1 à poser dès la création sur les matériaux qui recevront une image plus tard (décalques, mots,
 * nombres de dégâts) : le shader « avec image » est alors celui que la préchauffe compile. Sans elle, la 1re
 * image posée en combat change la variante du shader et three la compile sur-le-champ (image figée).
 */
export const TEXTURE_VIDE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1);
TEXTURE_VIDE.colorSpace = THREE.SRGBColorSpace;
TEXTURE_VIDE.needsUpdate = true;

/** `directVersEcran()` : vrai si le jeu dessine directement dans le canvas (qualité basse, sortie sRGB). */
export function installShaderWarmup(bus: Bus, three: Three, directVersEcran: () => boolean): void {
  // Cible linéaire factice : donne les mêmes shaders que la cible du post-traitement (sortie linéaire).
  const lineaire = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  // 2 passes par match : à la 1re phase jouable (compte à rebours), puis au début du combat pour ce qui s'est
  // chargé entre-temps (armes en main, stickers). Un shader déjà compilé ne coûte qu'une recherche en cache.
  const passes = new Set<string>();
  bus.on('match:start', () => { passes.clear(); });
  bus.on('phase:change', ({ to }) => {
    if (!PHASES_DE_JEU.has(to) || passes.has(to) || passes.size >= 2) return;
    passes.add(to);
    const { renderer, scene, camera } = three;
    const avant = renderer.getRenderTarget();
    renderer.setRenderTarget(directVersEcran() ? null : lineaire);
    void renderer.compileAsync(scene, camera).catch(() => {}); // la partie synchrone lit la cible ci-dessus
    renderer.setRenderTarget(avant);
  });
}
