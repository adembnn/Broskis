// Caméras du temps réel (lot RTVIEW) : une caméra verrouillée par joueur (rig.ts), l'écran scindé choisi au début
// du match, l'occlusion et les effets PAR VUE. Règle d'Adem : chaque vue reste sur son joueur du GO! au GAME!.
// Les plans du tour par tour (turn-swing, overview, ko-orbit, follow-projectile) sont ignorés ; seul le zoom KO
// (camera:cue 'impact', effets Smash) est gardé, dans la vue de la victime. Hitstop, trauma et ralentis : table
// `juice` de tokens.js, comme avant.
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { Ctx, Phase, PlayerId, Vec3 } from '../../core/types';
import { registry } from '../registry';
import { applyOcclusion, clearOcclusion, decorRoots, raycastOcclusion, resetOcclusion, stepOcclusion } from './occlusion';
import { CameraRig } from './rig';
import { RTVIEW } from './tokens';

/** Écrans de menu : une seule vue plein écran (le décor derrière les menus). */
const MENUS = new Set<Phase>(['title', 'fighter-select', 'arsenal', 'reveal', 'map-select']);

declare global { interface Window { __rtviewRigs?: [CameraRig, CameraRig] } }

let installed: [CameraRig, CameraRig] | null = null;

/** Avant horizontal (y = 0, normé) de la caméra du joueur, comme ctx.three.forwardOf ; null avant l'installation.
 * Lu par le cœur temps réel (gameplay/movement.ts) pour le déplacement relatif à la vue. */
export function forwardOf(player: PlayerId): Vec3 | null {
  return installed ? installed[player].forward() : null;
}

export function installCamera(ctx: Ctx): [CameraRig, CameraRig] {
  const three = ctx.three;
  const rigs: [CameraRig, CameraRig] = [new CameraRig(ctx, 0), new CameraRig(ctx, 1)];
  installed = rigs;
  registry.three = three;
  registry.camera = three.camera;
  registry.renderer = three.renderer;
  registry.shakes = [rigs[0].shake, rigs[1].shake];
  registry.shake = { add: (t) => { rigs[0].shake.add(t); rigs[1].shake.add(t); } };
  three.forwardOf = (p) => rigs[p].forward();

  const bumpHitstop = (seconds: number) => { ctx.loop.hitstop = Math.max(ctx.loop.hitstop, seconds); };
  const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

  ctx.bus.on('match:start', () => {
    resetOcclusion();
    const split = ctx.state.split ?? !ctx.state.vsAI;
    three.setViewMode(split ? 'split' : 'solo', 0);
    for (const r of rigs) { r.unforce(); r.endLaunch(); r.snap(); } // recalées à la 1re image (spawns posés)
  });
  ctx.bus.on('phase:change', ({ to }) => { if (MENUS.has(to)) three.setViewMode('solo', 0); });
  ctx.bus.on('respawn', ({ player }) => { rigs[player].endLaunch(); rigs[player].snap(); });
  ctx.bus.on('ledge:grab', ({ player }) => rigs[player].endLaunch());

  // Effets par vue : chacun dans la vue du joueur concerné, sans jamais quitter ce joueur.
  ctx.bus.on('fire', ({ player }) => rigs[player].shake.add(juice.action.trauma));
  ctx.bus.on('move:jump', ({ player }) => rigs[player].shake.add(juice.action.trauma * 0.5));
  ctx.bus.on('hit', ({ target, attacker, crit, launch }) => {
    const j = crit ? juice.critique : juice.toucher;
    rigs[target].shake.add(j.trauma);
    if (attacker !== target) rigs[attacker].shake.add(j.trauma * RTVIEW.attaquant);
    bumpHitstop(j.hitstop / 1000);
    if (crit) ctx.bus.emit('slowmo', { factor: juice.critique.ralenti, ms: juice.critique.ralentiMs });
    rigs[target].impact(crit);
    if (launch && Math.hypot(launch[0], launch[1], launch[2]) >= RTVIEW.ejection.vitesseMin) rigs[target].startLaunch();
  });
  ctx.bus.on('parry:result', ({ player, grade }) => {
    if (grade === 'miss') return;
    const j = grade === 'perfect' ? juice.parfaite : juice.parade;
    rigs[player].shake.add(j.trauma);
    bumpHitstop(j.hitstop / 1000);
    if (grade === 'perfect') ctx.bus.emit('slowmo', { factor: juice.parfaite.ralenti, ms: juice.parfaite.ralentiMs });
  });
  ctx.bus.on('ko', ({ player }) => {
    rigs[player].shake.add(juice.victoire.trauma);
    rigs[other(player)].shake.add(juice.victoire.trauma * RTVIEW.attaquant);
    bumpHitstop(juice.victoire.hitstop / 1000);
    ctx.bus.emit('slowmo', { factor: juice.victoire.ralenti, ms: juice.victoire.ralentiMs });
    rigs[player].koZoom();
  });
  ctx.bus.on('camera:cue', ({ shot, target }) => {
    if (shot === 'impact' && target != null) rigs[target].koZoom();
  });

  // Plus aucune transition à sauter ; le banc d'animation (LAN) garde sa pose fixe, en vue unique.
  ctx.hooks.skipCamera = () => {};
  ctx.hooks.animCamera = (player, shot) => { three.setViewMode('solo', player); rigs[player].force(shot); };

  const chests = [new THREE.Vector3(), new THREE.Vector3()];
  let rayAcc = 1;
  ctx.loop.addSystem('la-camera', (_dt, real) => {
    const fov = three.viewMode === 'split' ? RTVIEW.fovScinde : RTVIEW.fovSolo;
    for (const r of rigs) r.update(real, fov); // les 2, même en solo : forwardOf sert aussi à l'IA

    rayAcc += real;
    if (rayAcc >= 1 / RTVIEW.raycastHz) {
      rayAcc = 0;
      const decor = decorRoots(three.scene);
      for (const p of [0, 1] as const) {
        const s = ctx.state.players[p].pos;
        chests[p].set(s[0], s[1] + RTVIEW.cibleHauteur, s[2]);
      }
      for (const p of [0, 1] as const) {
        if (!three.viewOf(p).visible) { clearOcclusion(p); continue; }
        raycastOcclusion(p, decor, rigs[p].camera, chests);
        rigs[p].probe(decor);
      }
    }
    stepOcclusion(real);
  }, 300);

  // Juste avant chaque vue : ses opacités d'occlusion.
  three.onBeforeView((v) => applyOcclusion(v.player));
  window.__rtviewRigs = rigs; // débogage et bancs : rigs[p].lastHit, rigs[p].yaw
  return rigs;
}
