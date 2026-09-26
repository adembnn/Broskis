// Entrée dans le match derrière le rideau (lot LLOAD). Le joueur voit : clic sur la map → les volets P1/P2 claquent
// → le logo → les volets s'ouvrent sur une scène complète, sans image figée ni décor qui apparaît morceau par morceau.
// Derrière le rideau : lancement du match, attente que la scène ne bouge plus (fichiers arrivés, meshes posés),
// compilation de tous les shaders en parallèle (renderer.compileAsync), puis 2 vraies images encore cachées
// (envoi des textures au GPU, post-traitement) avant d'ouvrir. Le temps de jeu est gelé pendant ce temps (le tour
// ne s'écoule pas sous le rideau).
import type { Ctx, MapId } from '../../core/types';
import { durees } from '../../art/tokens.js';
import { compileScene, nextFrame as frame, pauseRender, preloadMap, waitSceneStable } from '../../core/preload';
import { getCurtain } from './curtain';

const STEPS = 3; // match lancé · scène posée · shaders compilés
const MAX_SCENE_WAIT_MS = 3000;
const MAX_COMPILE_MS = 2500;
/** Rideau fermé au moins ce temps : le logo doit se lire, pas clignoter. */
const MIN_CLOSED_MS = durees.dramatique * 0.55;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Gèle le temps de JEU (minuteries, tour) via le hitstop de la boucle ; le rendu, lui, n'est pas concerné. */
function freezeGameTime(ctx: Ctx): () => void {
  let on = true;
  const hold = () => {
    if (!on) return;
    ctx.loop.hitstop = Math.max(ctx.loop.hitstop, 0.1);
    requestAnimationFrame(hold);
  };
  hold();
  return () => { on = false; };
}

/**
 * Lance `start` (qui doit appeler ctx.hooks.startMatch) derrière le rideau et ne l'ouvre que sur une scène prête.
 * Ne jette jamais : au pire, le rideau s'ouvre au bout des délais maximum.
 */
declare global { interface Window { __lloadTransition?: Record<string, number> } }

export async function coverMatchStart(ctx: Ctx, start: () => void, mapId?: MapId): Promise<void> {
  const curtain = getCurtain();
  const t0 = performance.now();
  const marks: Record<string, number> = {};
  const mark = (k: string) => { marks[k] = Math.round(performance.now() - t0); };
  if (mapId) preloadMap(mapId, 40); // au cas où le survol n'a pas suffi : passe devant tout le reste
  await curtain.close();
  mark('ferme');
  const closedAt = performance.now();
  curtain.setProgress(0, STEPS);
  const unfreeze = freezeGameTime(ctx);
  const resumeRender = pauseRender(ctx);
  try {
    start();
    mark('matchLance');
    curtain.setProgress(1, STEPS);
    await waitSceneStable(ctx, MAX_SCENE_WAIT_MS);
    mark('scenePosee');
    curtain.setProgress(2, STEPS);
    await compileScene(ctx, MAX_COMPILE_MS);
    mark('shadersCompiles');
    curtain.setProgress(3, STEPS);
  } catch (e) {
    console.error('[lload] transition', e);
  } finally {
    resumeRender();
  }
  // Deux vraies images encore sous le rideau : ombres, passes de post-traitement.
  await frame();
  await frame();
  mark('premieresImages');
  const left = MIN_CLOSED_MS - (performance.now() - closedAt);
  if (left > 0) await sleep(left);
  unfreeze();
  ctx.bus.emit('transition:open', { mapId: ctx.state.mapId });
  mark('ouverture');
  window.__lloadTransition = marks; // mesures lisibles par les agents de test
  await curtain.open();
}
