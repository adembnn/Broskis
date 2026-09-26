// Lot LM : régie des événements de map par tour. Remplace le stub L0 — voir plan/lots/LM-maps.md.
// Ce module ne fait QUE décider QUAND (lecture de state.turn / mapId) et émettre map:warn puis map:event
// un tour plus tard ; c'est engine.ts (src/scene/maps/) qui écoute ces mêmes événements et fait le travail
// visuel/physique (anneau qui tombe, gîte du galion, éponge, rétrécissement de mort subite…), conformément
// à la règle du bus : les modules ne s'appellent pas, ils s'écoutent.
import { currentMapDef } from '../../scene/maps/engine';
import type { Install } from '../../core/types';

/** Tour à partir duquel la mort subite s'active (règle du jeu, plan/README.md). */
const SUDDEN_DEATH_TURN = 7;
/** Délai (temps de jeu) entre l'ombre de l'objet de mort subite et sa chute réelle — "annoncé par son ombre",
 *  même logique que crate:warn -> crate:land (quelques secondes, pas un tour entier). */
const SUDDEN_DEATH_DROP_DELAY = 1.5;

export const install: Install = (ctx) => {
  ctx.bus.on('turn:start', ({ turn }) => {
    const def = currentMapDef();
    if (def) {
      const { kind, everyTurns } = def.periodicEvent;
      const isWarnTurn = turn % everyTurns === everyTurns - 1;
      const isEventTurn = turn > 0 && turn % everyTurns === 0;
      if (isWarnTurn) ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind, turnsLeft: 1 });
      if (isEventTurn) ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind });
    }

    if (turn === SUDDEN_DEATH_TURN - 1) {
      ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind: 'suddendeath', turnsLeft: 1 });
    }
    if (turn >= SUDDEN_DEATH_TURN) {
      if (!ctx.state.suddenDeath) {
        ctx.state.suddenDeath = true;
        ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath' });
      }
      // Rétrécissement : effet continu d'une phase déjà annoncée (comme l'anneau extérieur qui continue
      // de tomber une fois la règle connue) -> pas de nouveau préavis à chaque tour, juste l'exécution.
      ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath-shrink' });
      // Objet géant : préavis court (ombre), comme la Caisse Snap, pas un tour complet d'attente.
      ctx.bus.emit('map:warn', { mapId: ctx.state.mapId, kind: 'suddendeath-drop', turnsLeft: 0 });
      ctx.loop.later(SUDDEN_DEATH_DROP_DELAY, () => {
        ctx.bus.emit('map:event', { mapId: ctx.state.mapId, kind: 'suddendeath-drop' });
      });
    }
  });
};
