// Préchauffe des shaders au début de chaque match (lot LPERF). three.js compile un shader la 1re fois qu'un
// matériau est dessiné, et la clé de chaque shader dépend du nombre de lumières : ceux compilés dans les menus
// ne servent plus une fois la map chargée (elle ajoute ses lumières). Mesuré : 1re visée = 90 à 350 ms de gel (aides de
// visée), 1er impact = 76 à 104 ms (particules). À la 1re phase jouable de chaque match (map et lumières en
// place ; en temps réel : le compte à rebours), on compile en tâche de fond toute la scène, même cachée.
// Complète le préchargement des menus (lot LLOAD) : un shader déjà compilé ne coûte presque rien ici.
import * as THREE from 'three';
import type { Ctx } from './types';
import { whenMapLoaded } from '../scene/maps/engine';
import { PHASES_DE_JEU } from './quality';
import { compileScene } from './preload';

/**
 * Texture 1×1 à poser dès la création sur les matériaux qui recevront une image plus tard (décalques, mots,
 * nombres de dégâts) : le shader « avec image » est alors celui que la préchauffe compile. Sans elle, la 1re
 * image posée en combat change la variante du shader et three la compile sur-le-champ (image figée).
 */
export const TEXTURE_VIDE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1);
TEXTURE_VIDE.colorSpace = THREE.SRGBColorSpace;
TEXTURE_VIDE.needsUpdate = true;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Garde-fou : le chargement de la map (catapulte de l'archipel comprise) ne doit jamais bloquer la préchauffe. */
const MAX_MAP_WAIT_MS = 20000;

/**
 * Branché sur le bus. Réutilise `compileScene` (core/preload.ts) plutôt que de dupliquer sa logique : elle compile
 * déjà les DEUX cibles (post-traitement et canvas direct, quelle que soit la qualité) et montre temporairement les
 * pools d'effets `latk-*` (sinon invisibles tant qu'aucun coup n'a eu lieu, donc sautés par compileAsync — c'était
 * la 2e cause des shaders d'impact compilés en plein combat, en plus de la carte pas encore complète, LPERF3).
 * 2 passes par match : à la 1re phase jouable (compte à rebours), puis au début du combat pour ce qui s'est
 * chargé entre-temps (armes en main, stickers). Un shader déjà compilé ne coûte qu'une recherche en cache.
 */
export function installShaderWarmup(ctx: Ctx): void {
  const passes = new Set<string>();
  ctx.bus.on('match:start', () => { passes.clear(); });
  ctx.bus.on('phase:change', ({ to }) => {
    if (!PHASES_DE_JEU.has(to) || passes.has(to) || passes.size >= 2) return;
    const premierePasse = passes.size === 0;
    passes.add(to);
    void (async () => {
      // LPERF3 : la 1re phase jouable arrive souvent AVANT que buildVisuals ait fini (catapulte de l'archipel,
      // décor tardif) — compiler tout de suite manquait ces pièces, qui compilaient leur shader en plein combat
      // au 1er rendu qui les montrait. On attend la fin réelle (bornée) avant de compiler, SANS geler le rendu
      // (contrairement au rideau de chargement) : ce chemin sert aussi aux tests sans rideau (gameHooks.startMatch
      // brut) où figer l'image perturbait la mesure automatique de qualité (quality.ts). Seule la 1re passe
      // attend : la 2e sert à rattraper ce qui s'est chargé depuis (armes, stickers), pas la map.
      if (premierePasse) await Promise.race([whenMapLoaded(), sleep(MAX_MAP_WAIT_MS)]);
      await compileScene(ctx, 4000);
    })();
  });
}
