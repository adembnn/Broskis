// Lots LM, LMAP2 puis RTCORE (temps réel) : régie des dangers de map sur MINUTERIE + leurs effets physiques.
// 1. QUAND : en combat, un danger toutes les 20 à 30 s (tiré au hasard), annoncé 3 s avant (`map:warn`, zone
//    qui clignote) puis déclenché (`map:event`). Mort subite à 3:00 : `map:warn` 5 s avant, `map:event`
//    `suddendeath`, puis un objet géant (`suddendeath-drop`) toutes les 12 s, annoncé par son ombre.
// 2. EFFETS : engine.ts (src/scene/maps) décide de la géométrie et du moment, puis demande ici une poussée
//    ou une chute ; on la joue avec le vol d'éjection des règles v2 (launch.ts).
import { currentMapDef, onPlayerEffect, type PlayerEffect } from '../../scene/maps/engine';
import type { Ctx, Install, PlayerId, Vec3 } from '../../core/types';
import { startLaunch } from '../launch';
import { inFight } from '../phases';
import { getRuntime } from '../runtime';
import { RT } from '../tuning';

/** Délai (temps de jeu) entre l'ombre de l'objet géant et sa chute, comme crate:warn -> crate:land. */
const SUDDEN_DEATH_DROP_DELAY = 1.5;
const SUDDEN_DEATH_WARN_S = 5;
const SUDDEN_DEATH_DROP_EVERY_S = 12;

// Poussée (vague, pont qui gîte, éponge) ou chute (dalle qui tombe) : même chemin que le recul d'un coup.
function applyEffect(ctx: Ctx, e: PlayerEffect) {
  if (!ctx.state.players[e.player].alive) return;
  const vel: Vec3 = e.kind === 'push' ? [e.vel[0], e.vel[1], e.vel[2]] : [0, 0, 0];
  startLaunch(ctx, e.player, vel, (1 - e.player) as PlayerId);
}

interface Schedule { nextWarnAt: number; eventAt: number | null; sdWarned: boolean; sdStarted: boolean; nextDropAt: number }
let sched: Schedule = { nextWarnAt: 0, eventAt: null, sdWarned: false, sdStarted: false, nextDropAt: 0 };

function nextInterval(ctx: Ctx): number {
  return ctx.rng.range(RT.hazardEveryS[0], RT.hazardEveryS[1]);
}

export const install: Install = (ctx) => {
  onPlayerEffect((e) => applyEffect(ctx, e));

  ctx.bus.on('match:start', () => {
    sched = { nextWarnAt: nextInterval(ctx) - RT.hazardWarnS, eventAt: null, sdWarned: false, sdStarted: false, nextDropAt: 0 };
  });

  ctx.loop.addSystem('gameplay-map-events', () => {
    if (!inFight(ctx)) return;
    const t = getRuntime().fightTime;
    const mapId = ctx.state.mapId;
    const def = currentMapDef();
    if (def && sched.eventAt == null && t >= sched.nextWarnAt) {
      ctx.bus.emit('map:warn', { mapId, kind: def.periodicEvent.kind, turnsLeft: 0 });
      sched.eventAt = t + RT.hazardWarnS;
    }
    if (def && sched.eventAt != null && t >= sched.eventAt) {
      ctx.bus.emit('map:event', { mapId, kind: def.periodicEvent.kind });
      sched.eventAt = null;
      sched.nextWarnAt = t + nextInterval(ctx) - RT.hazardWarnS;
    }
    if (!sched.sdWarned && t >= RT.suddenDeathS - SUDDEN_DEATH_WARN_S) {
      sched.sdWarned = true;
      ctx.bus.emit('map:warn', { mapId, kind: 'suddendeath', turnsLeft: 0 });
    }
    if (!sched.sdStarted && t >= RT.suddenDeathS) {
      sched.sdStarted = true;
      sched.nextDropAt = t + 3;
      ctx.bus.emit('map:event', { mapId, kind: 'suddendeath' });
    }
    if (sched.sdStarted && t >= sched.nextDropAt) {
      sched.nextDropAt = t + SUDDEN_DEATH_DROP_EVERY_S;
      ctx.bus.emit('map:warn', { mapId, kind: 'suddendeath-drop', turnsLeft: 0 });
      ctx.loop.later(SUDDEN_DEATH_DROP_DELAY, () => {
        if (inFight(ctx)) ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath-drop' });
      });
    }
  }, 75);
};
