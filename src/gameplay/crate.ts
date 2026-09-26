// Caisse Snap : annoncée (`crate:warn`) tous les 2 à 3 tours, se pose au tour suivant (`crate:land`),
// se ramasse en marchant dessus (`crate:grab`) → phase `snap-time` (10 s) → `scan:start` → au `scan:result`,
// remplace l'arme choisie (touches 1/2/3, ou la plus ancienne après 10 s). Sans résultat en 10 s : retour au tour.
import type { Ctx, PlayerId, Vec3, Weapon } from '../core/types';
import { scanObject } from '../ia';
import { raycastDown } from './character';
import { cancelGestureTimer, setPhase } from './phases';
import { getRuntime } from './runtime';
import { CRATE_ARENA_HALF_SIZE, CRATE_INTERVAL_TURNS, CRATE_PICKUP_RADIUS, SNAP_TIME_S } from './tuning';

function pickCratePosition(ctx: Ctx): Vec3 {
  const x = ctx.rng.range(-CRATE_ARENA_HALF_SIZE, CRATE_ARENA_HALF_SIZE);
  const z = ctx.rng.range(-CRATE_ARENA_HALF_SIZE, CRATE_ARENA_HALF_SIZE);
  const probeFrom = 20;
  const dist = raycastDown(ctx, [x, probeFrom, z], 40);
  return [x, dist != null ? probeFrom - dist : 0, z];
}

function scheduleNextWarn(ctx: Ctx): void {
  getRuntime().nextCrateWarnTurn = ctx.state.turn + ctx.rng.int(CRATE_INTERVAL_TURNS[0], CRATE_INTERVAL_TURNS[1]);
}

/** À brancher sur `turn:start` : fait vivre le cycle annonce → atterrissage de la caisse. */
function onTurnStart(ctx: Ctx, turn: number): void {
  const rt = getRuntime();
  const crate = ctx.state.crate;
  if (crate && !crate.landed) {
    crate.landsInTurns -= 1;
    if (crate.landsInTurns <= 0) {
      crate.landed = true;
      ctx.bus.emit('crate:land', { pos: crate.pos });
    }
    return;
  }
  if (!crate && turn === rt.nextCrateWarnTurn) {
    const pos = pickCratePosition(ctx);
    ctx.state.crate = { pos, landsInTurns: 1, landed: false };
    ctx.bus.emit('crate:warn', { pos });
  }
}

function oldestSlotIndex(player: PlayerId): number {
  const acquired = getRuntime().players[player].weaponAcquiredTurn;
  let best = 0;
  for (let i = 1; i < acquired.length; i++) if (acquired[i] < acquired[best]) best = i;
  return best;
}

function applyScannedWeapon(ctx: Ctx, player: PlayerId, weapon: Weapon, slot: number): void {
  ctx.state.players[player].weapons[slot] = weapon;
  getRuntime().players[player].weaponAcquiredTurn[slot] = ctx.state.turn;
}

function finishSnap(ctx: Ctx): void {
  const rt = getRuntime();
  if (rt.snapSettled) return;
  rt.snapSettled = true;
  if (rt.cancelSnap) { rt.cancelSnap(); rt.cancelSnap = null; }
  if (ctx.state.phase === 'snap-time') setPhase(ctx, rt.resumePhaseAfterSnap);
}

/** Touche 1/2/3 pendant `snap-time` : choisit l'emplacement qui recevra l'arme scannée. */
export function chooseSnapSlot(ctx: Ctx, index: number): void {
  if (ctx.state.phase !== 'snap-time') return;
  const rt = getRuntime();
  rt.snapReplaceIndex = index;
  if (rt.pendingScannedWeapon) {
    applyScannedWeapon(ctx, ctx.state.active, rt.pendingScannedWeapon, index);
    finishSnap(ctx);
  }
}

function enterSnapTime(ctx: Ctx, player: PlayerId): void {
  const rt = getRuntime();
  rt.resumePhaseAfterSnap = ctx.state.phase === 'aim' ? 'aim' : 'move';
  rt.snapReplaceIndex = null;
  rt.pendingScannedWeapon = null;
  rt.snapSettled = false;
  cancelGestureTimer();
  setPhase(ctx, 'snap-time');
  ctx.bus.emit('scan:start', { player, source: 'crate' });

  const timeoutId = setTimeout(() => {
    const p = rt.pendingScannedWeapon;
    if (p) applyScannedWeapon(ctx, player, p, rt.snapReplaceIndex ?? oldestSlotIndex(player));
    finishSnap(ctx);
  }, SNAP_TIME_S * 1000);
  rt.cancelSnap = () => clearTimeout(timeoutId);

  // Stub du lot LI (src/ia) : renvoie une arme factice quasi instantanément. Un appel IA qui échoue
  // ne bloque jamais le jeu (skill ia-en-jeu) : sans réponse avant les 10 s, on ne change rien.
  scanObject(`crate:${player}:${ctx.state.turn}`, { player }).then((weapon) => {
    if (rt.snapSettled) return;
    rt.pendingScannedWeapon = weapon;
    ctx.bus.emit('scan:result', { player, weapon });
    if (rt.snapReplaceIndex != null) {
      applyScannedWeapon(ctx, player, weapon, rt.snapReplaceIndex);
      finishSnap(ctx);
    }
  }).catch(() => {});
}

function grabCrate(ctx: Ctx, player: PlayerId): void {
  if (!ctx.state.crate || !ctx.state.crate.landed) return;
  ctx.state.crate = null;
  scheduleNextWarn(ctx);
  ctx.bus.emit('crate:grab', { player });
  enterSnapTime(ctx, player);
}

/** Appelé après chaque déplacement (movement.ts) : ramasse la caisse si on marche dessus. */
export function checkCratePickup(ctx: Ctx, player: PlayerId): void {
  const crate = ctx.state.crate;
  if (!crate || !crate.landed) return;
  const pos = ctx.state.players[player].pos;
  const d = Math.hypot(pos[0] - crate.pos[0], pos[2] - crate.pos[2]);
  if (d <= CRATE_PICKUP_RADIUS) grabCrate(ctx, player);
}

export function install(ctx: Ctx): void {
  ctx.bus.on('turn:start', ({ turn }) => onTurnStart(ctx, turn));
  ctx.hooks.grabCrate = () => grabCrate(ctx, ctx.state.active);
}
