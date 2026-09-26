// Branche le bus sur la caméra (director + shake + occlusion), fournit ctx.hooks.skipCamera, et déclenche
// le hitstop/trauma/ralentis de la table `juice` de tokens.js (direction Vinyle, 26/09). Un clic ou une
// touche pendant une transition la saute (contrat).
import * as THREE from 'three';
import { juice } from '../../art/tokens.js';
import type { Ctx } from '../../core/types';
import { registry } from '../registry';
import { CameraDirector } from './director';
import { updateOcclusion } from './occlusion';
import { createCameraShake } from './shake';

function msToSeconds(ms: number): number {
  return ms / 1000;
}

export function installCamera(ctx: Ctx): CameraDirector {
  const director = new CameraDirector(ctx);
  const shake = createCameraShake();
  registry.shake = shake;
  registry.camera = ctx.three.camera;
  registry.renderer = ctx.three.renderer;

  const bumpHitstop = (seconds: number) => { ctx.loop.hitstop = Math.max(ctx.loop.hitstop, seconds); };

  ctx.bus.on('match:start', () => director.reset());

  ctx.bus.on('turn:start', ({ active }) => director.triggerTurnSwing(active));

  ctx.bus.on('aim:update', ({ player, dir }) => director.setAimHint(player, dir));
  ctx.bus.on('fire', ({ player }) => {
    director.clearAimHint(player);
    shake.add(juice.action.trauma); // hitstop 0 pour l'action du joueur : rien à geler, juste une secousse légère
  });
  ctx.bus.on('move:jump', () => shake.add(juice.action.trauma * 0.5));

  ctx.bus.on('projectile:spawn', ({ weapon, from, vel }) => director.noteProjectile(from, vel, weapon.category));

  ctx.bus.on('hit', ({ pos, crit }) => {
    const j = crit ? juice.critique : juice.toucher;
    shake.add(j.trauma);
    bumpHitstop(msToSeconds(j.hitstop));
    if (crit) ctx.bus.emit('slowmo', { factor: juice.critique.ralenti, ms: juice.critique.ralentiMs });
    director.triggerImpact(pos, crit);
  });

  ctx.bus.on('parry:result', ({ grade }) => {
    if (grade === 'miss') return;
    const j = grade === 'perfect' ? juice.parfaite : juice.parade;
    shake.add(j.trauma);
    bumpHitstop(msToSeconds(j.hitstop));
    if (grade === 'perfect') ctx.bus.emit('slowmo', { factor: juice.parfaite.ralenti, ms: juice.parfaite.ralentiMs });
  });

  ctx.bus.on('ko', ({ player }) => {
    shake.add(juice.victoire.trauma);
    bumpHitstop(msToSeconds(juice.victoire.hitstop));
    ctx.bus.emit('slowmo', { factor: juice.victoire.ralenti, ms: juice.victoire.ralentiMs });
    director.triggerKoOrbit(player);
  });

  // Le gameplay pilote la bascule principale via ce cue (voir director.triggerReleaseSwing). 'overview' est
  // le seul autre shot sans déclencheur brut dédié ; les autres (impact, ko-orbit) sont déjà déclenchés
  // directement par nos propres écouteurs ci-dessus — les ignorer ici évite un double déclenchement.
  ctx.bus.on('camera:cue', ({ shot, target }) => {
    if (shot === 'turn-swing' && target != null) director.triggerReleaseSwing(target);
    else if (shot === 'overview') director.triggerOverview();
  });

  // "Un clic ou une touche la saute" : skip() est un no-op hors transition, donc jamais de risque de gêner
  // les autres lots qui écoutent aussi le clic/clavier (on ne consomme jamais l'évènement : pas de preventDefault).
  ctx.hooks.skipCamera = () => director.skip();
  ctx.hooks.animCamera = (player, shot) => director.forceAnimCamera(player, shot);
  ctx.three.canvas.addEventListener('pointerdown', () => director.skip());
  window.addEventListener('keydown', (e) => { if (!e.repeat) director.skip(); });

  const focus = new THREE.Vector3();
  ctx.loop.addSystem('la-camera', (dt) => {
    director.update(dt);
    shake.apply(ctx.three.camera, dt);
    focus.copy(director.look);
    updateOcclusion(ctx.three.scene, ctx.three.camera, focus, dt);
  }, 300);

  return director;
}
