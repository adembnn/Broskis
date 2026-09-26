// Lots LM puis LMAP2 : régie des dangers de map par tour + leurs effets physiques sur les joueurs.
// 1. QUAND : `map:warn` puis `map:event` `leadTurns` tours plus tard (2 = chaque joueur a eu un tour pour
//    fuir la zone qui clignote ; avant, l'anneau tombait au début du tour de celui qui n'avait pas pu bouger).
// 2. EFFETS : engine.ts (src/scene/maps) décide de la géométrie et du moment, puis demande ici une poussée
//    ou une chute ; on la joue avec le corps physique du perso (même chemin que le recul d'un coup).
import { currentMapDef, onPlayerEffect, type PlayerEffect } from '../../scene/maps/engine';
import type { Ctx, Install, PlayerId, Vec3 } from '../../core/types';
import { startLaunch } from '../launch';

/** Tour à partir duquel la mort subite s'active (règle du jeu, plan/README.md). */
const SUDDEN_DEATH_TURN = 7;
/** Délai (temps de jeu) entre l'ombre de l'objet géant et sa chute, comme crate:warn -> crate:land. */
const SUDDEN_DEATH_DROP_DELAY = 1.5;
// Poussée (vague, pont qui gîte, éponge) ou chute (dalle qui tombe) : même chemin que le recul d'un coup en
// règles v2 (launch.ts) : vol cinématique, glissade, rattrapage au bord, sortie de l'arène gérée par LSMASH.
function applyEffect(ctx: Ctx, e: PlayerEffect) {
  if (!ctx.state.players[e.player].alive) return;
  const vel: Vec3 = e.kind === 'push' ? [e.vel[0], e.vel[1], e.vel[2]] : [0, 0, 0];
  startLaunch(ctx, e.player, vel, (1 - e.player) as PlayerId);
}

export const install: Install = (ctx) => {
  onPlayerEffect((e) => applyEffect(ctx, e));

  ctx.bus.on('turn:start', ({ turn }) => {
    const def = currentMapDef();
    if (def) {
      const { kind, everyTurns, firstTurn, leadTurns } = def.periodicEvent;
      const since = turn - firstTurn;
      if (since >= 0 && since % everyTurns === 0) ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind });
      const untilNext = turn + leadTurns - firstTurn;
      if (untilNext >= 0 && untilNext % everyTurns === 0) ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind, turnsLeft: leadTurns });
    }

    if (turn === SUDDEN_DEATH_TURN - 1) {
      ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind: 'suddendeath', turnsLeft: 1 });
    }
    if (turn >= SUDDEN_DEATH_TURN) {
      if (!ctx.state.suddenDeath) ctx.state.suddenDeath = true;
      if (turn === SUDDEN_DEATH_TURN) ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath' });
      // Objet géant : préavis court (ombre), comme la Caisse Snap.
      ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind: 'suddendeath-drop', turnsLeft: 0 });
      ctx.loop.later(SUDDEN_DEATH_DROP_DELAY, () => {
        ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath-drop' });
      });
    }
  });
};
