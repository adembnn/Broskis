// Lots LM puis LMAP2 : régie des dangers de map par tour + leurs effets physiques sur les joueurs.
// 1. QUAND : `map:warn` puis `map:event` `leadTurns` tours plus tard (2 = chaque joueur a eu un tour pour
//    fuir la zone qui clignote ; avant, l'anneau tombait au début du tour de celui qui n'avait pas pu bouger).
// 2. EFFETS : engine.ts (src/scene/maps) décide de la géométrie et du moment, puis demande ici une poussée
//    ou une chute ; on la joue avec le corps physique du perso (même chemin que le recul d'un coup).
import type RAPIER from '@dimforge/rapier3d-compat';
import { currentMapDef, getArenaBounds, onPlayerEffect, type PlayerEffect } from '../../scene/maps/engine';
import type { Ctx, Install, PlayerId } from '../../core/types';
import { raycastDown, restoreKinematicFromDynamic, setDynamicForRecovery } from '../character';

/** Tour à partir duquel la mort subite s'active (règle du jeu, plan/README.md). */
const SUDDEN_DEATH_TURN = 7;
/** Délai (temps de jeu) entre l'ombre de l'objet géant et sa chute, comme crate:warn -> crate:land. */
const SUDDEN_DEATH_DROP_DELAY = 1.5;
/** Après une poussée : on rend la main au contrôleur une fois le perso reposé au sol (sondage, s). */
const SETTLE_POLL_S = 0.25;
const SETTLE_MIN_S = 0.6;
const SETTLE_MAX_S = 4;

function findBody(ctx: Ctx, player: PlayerId): RAPIER.RigidBody | null {
  let found: RAPIER.RigidBody | null = null;
  ctx.physics.world.forEachRigidBody((b) => {
    const ud = b.userData as { kind?: string; player?: number } | undefined;
    if (ud?.kind === 'player' && ud.player === player) found = b;
  });
  return found;
}

function applyEffect(ctx: Ctx, e: PlayerEffect) {
  const state = ctx.state.players[e.player];
  if (!state.alive) return;
  setDynamicForRecovery(ctx, e.player, [0, 0, 0]);
  const body = findBody(ctx, e.player);
  if (body && e.kind === 'push') body.setLinvel({ x: e.vel[0], y: e.vel[1], z: e.vel[2] }, true);
  // Rend la main au contrôleur quand le perso est reposé sur un sol ; s'il tombe dans le vide, c'est
  // la règle de sortie (ring-out, lot LSMASH) qui s'en charge.
  let waited = 0;
  const minWait = Math.max(SETTLE_MIN_S, e.kind === 'push' ? e.hold ?? 0 : 0);
  const poll = () => {
    waited += SETTLE_POLL_S;
    const b = findBody(ctx, e.player);
    if (!b || !b.isDynamic() || !ctx.state.players[e.player].alive) return;
    const arena = getArenaBounds();
    const pos = ctx.state.players[e.player].pos;
    if (arena && pos[1] < arena.voidY) return;
    const v = b.linvel();
    const own = b.numColliders() > 0 ? b.collider(0) : undefined;
    const onGround = raycastDown(ctx, [pos[0], pos[1] + 0.1, pos[2]], 0.45, own) != null;
    if (waited >= minWait && onGround && Math.hypot(v.x, v.y, v.z) < 1.2) {
      restoreKinematicFromDynamic(ctx, e.player);
      return;
    }
    if (waited < Math.max(SETTLE_MAX_S, minWait + 1) || !onGround) ctx.loop.later(SETTLE_POLL_S, poll);
    else restoreKinematicFromDynamic(ctx, e.player);
  };
  ctx.loop.later(SETTLE_POLL_S, poll);
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
