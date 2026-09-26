// Préchauffe des shaders au 1er tour (lot LPERF). three.js compile un shader la 1re fois qu'un matériau est
// dessiné, et la clé de chaque shader dépend du nombre de lumières : ceux compilés dans les menus ne servent
// plus une fois la map chargée (elle ajoute ses lumières). Mesuré : 1re visée = 90 à 350 ms de gel (aides de
// visée), 1er impact = 76 à 104 ms (particules). Au 1er tour jouable de chaque match (map et lumières en
// place), on compile en tâche de fond tout ce qui est dans la scène, même caché (aides de visée, effets).
// Complète le préchargement des menus (lot LLOAD) : un shader déjà compilé ne coûte presque rien ici.
import * as THREE from 'three';
import type { Bus } from './bus';
import type { Three } from './types';

/** `directVersEcran()` : vrai si le jeu dessine directement dans le canvas (qualité basse, sortie sRGB). */
export function installShaderWarmup(bus: Bus, three: Three, directVersEcran: () => boolean): void {
  // Cible linéaire factice : donne les mêmes shaders que la cible du post-traitement (sortie linéaire).
  const lineaire = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  let arme = false;
  bus.on('match:start', () => { arme = true; });
  bus.on('phase:change', ({ to }) => {
    if (to !== 'move' || !arme) return;
    arme = false;
    const { renderer, scene, camera } = three;
    const avant = renderer.getRenderTarget();
    renderer.setRenderTarget(directVersEcran() ? null : lineaire);
    void renderer.compileAsync(scene, camera).catch(() => {}); // la partie synchrone lit la cible ci-dessus
    renderer.setRenderTarget(avant);
  });
}
