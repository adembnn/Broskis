// Match temps réel joué uniquement par `window.gameHooks` (`input` = même chemin que le clavier/la manette),
// lançable dans le navigateur : `await window.__selftest()`. Ne throw jamais : les erreurs sont collectées.
// Vérifie : compte à rebours → combat, déplacement, saut, tir (rafale), recharge, blocage (parry:result),
// caisse Snap, éjection forcée → stock:lost → respawn, fin forcée.
import type { Ctx, FighterDef, InputAction, PlayerId, Weapon } from '../core/types';
import { getRuntime } from './runtime';
import { defaultArsenal } from './tuning';

export interface SelftestResult { ok: boolean; steps: string[]; errors: string[]; finalState: unknown }

declare global { interface Window { __selftest?: () => Promise<SelftestResult> } }

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntil(cond: () => boolean, timeoutMs: number, stepMs = 40): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const poll = () => {
      if (cond()) { resolve(); return; }
      if (performance.now() - start > timeoutMs) { reject(new Error(`délai dépassé (${timeoutMs} ms)`)); return; }
      setTimeout(poll, stepMs);
    };
    poll();
  });
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion échouée : ${msg}`);
}

const TEST_FIGHTERS: [FighterDef, FighterDef] = [
  { id: 'selftest-p0', name: 'Selftest P0', model: 'knight', hpMax: 100, power: 5, agility: 5 },
  { id: 'selftest-p1', name: 'Selftest P1', model: 'rogue_hooded', hpMax: 100, power: 5, agility: 5 },
];

/** Arsenal par défaut (blaster, grenade, bouclier), blaster à précision maximale. */
function testWeapons(): [Weapon[], Weapon[]] {
  const make = (): Weapon[] => defaultArsenal();
  return [make(), make()];
}

/** Attend que la boucle de jeu ait tourné `n` images (sans carte graphique, une image peut prendre 1 s). */
async function frames(ctx: Ctx, n = 2): Promise<void> {
  const t0 = ctx.loop.realTime;
  await waitUntil(() => ctx.loop.realTime > t0 + n * 0.001, 8000, 10).catch(() => {});
}

async function tap(ctx: Ctx, player: PlayerId, action: InputAction, holdMs = 60): Promise<void> {
  ctx.hooks.input?.(player, action, true);
  await wait(holdMs);
  await frames(ctx);
  ctx.hooks.input?.(player, action, false);
  await frames(ctx);
}

async function runSelftest(ctx: Ctx): Promise<SelftestResult> {
  const steps: string[] = [];
  const errors: string[] = [];
  const step = (s: string) => steps.push(s);
  const originalError = console.error;
  // Seules les erreurs levées DANS le gameplay font échouer ce test (haut de la pile), pas celles des autres lots.
  console.error = (...args: unknown[]) => {
    const top = args.map((a) => (a instanceof Error ? (a.stack ?? '').split('\n').slice(0, 3).join(' ') : String(a))).join(' ');
    if (/gameplay/.test(top)) errors.push(top);
    originalError(...args);
  };
  const seen: string[] = [];
  const offAny = ctx.bus.onAny((name) => { seen.push(name); });

  try {
    ctx.hooks.startMatch({ seed: 20260926, fighters: TEST_FIGHTERS, weapons: testWeapons(), stocks: 2 });
    step('startMatch({seed, 2 vies})');
    assert(ctx.state.phase === 'countdown', `phase attendue 'countdown', obtenu '${ctx.state.phase}'`);
    assert(ctx.state.players[0].pct === 0 && ctx.state.players[1].stocks === 2, 'départ à 0 % et 2 vies');
    await waitUntil(() => ctx.state.phase === 'fight', 15000);
    assert(seen.includes('countdown') && seen.includes('match:banner'), 'READY?, 3-2-1, GO! émis');
    step("READY? 3-2-1 GO! → phase 'fight'");

    // Déplacement et saut de P1 (touches simulées).
    const x0 = [...ctx.state.players[0].pos];
    const dist = () => Math.hypot(ctx.state.players[0].pos[0] - x0[0], ctx.state.players[0].pos[2] - x0[2]);
    ctx.hooks.input?.(0, 'up', true);
    await waitUntil(() => dist() > 1, 5000).catch(() => {}); // images parfois lentes sans carte graphique
    ctx.hooks.input?.(0, 'up', false);
    const moved = dist();
    assert(moved > 0.3, `P1 doit avancer (déplacé de ${moved.toFixed(2)} m)`);
    await tap(ctx, 0, 'jump');
    assert(seen.includes('move:jump'), 'le saut doit être émis');
    step(`P1 avance de ${moved.toFixed(2)} m et saute`);
    await wait(900);

    // Tir de P1 (blaster, rafale) : P2 doit prendre des % ; l'arme recharge.
    const pctBefore = ctx.state.players[1].pct;
    await tap(ctx, 0, 'fire', 80);
    await waitUntil(() => ctx.state.players[1].pct > pctBefore, 4000);
    assert(ctx.state.players[0].cooldowns[0] > 0, "l'arme tirée doit recharger");
    step(`P1 tire (blaster) → P2 à ${ctx.state.players[1].pct} %, recharge ${ctx.state.players[0].cooldowns[0].toFixed(2)} s`);

    // Blocage de P2 pendant une grenade de P1 : parry:result.
    await tap(ctx, 0, 'weapon2');
    assert(ctx.state.players[0].selected === 1, "P1 doit passer à l'arme 2");
    await waitUntil(() => !getRuntime().players[1].launch, 4000); // pas de blocage pendant qu'on vole
    ctx.hooks.input?.(1, 'parry', true);
    await waitUntil(() => ctx.state.players[1].blocking, 4000).catch(() => {});
    assert(ctx.state.players[1].blocking, 'P2 doit bloquer');
    const pctBlock = ctx.state.players[1].pct;
    await tap(ctx, 0, 'fire', 60);
    await waitUntil(() => seen.includes('parry:result'), 5000);
    ctx.hooks.input?.(1, 'parry', false);
    step(`P2 bloque la grenade → parry:result, P2 ${pctBlock} % → ${ctx.state.players[1].pct} %`);

    // Caisse Snap : ramassée sous les pieds, l'arme choisie est remplacée.
    const before = ctx.state.players[0].weapons[ctx.state.players[0].selected].id;
    ctx.hooks.grabCrate();
    await waitUntil(() => ctx.state.players[0].weapons[ctx.state.players[0].selected].id !== before, 3000);
    step('caisse Snap ramassée → arme bonus en place');

    // Éjection forcée de P2 → stock:lost → respawn.
    const stocksBefore = ctx.state.players[1].stocks;
    const dir = ctx.state.players[1].pos[0] >= 0 ? 1 : -1;
    window.__lsmash?.launch(1, dir, 0, 32);
    await waitUntil(() => ctx.state.players[1].stocks < stocksBefore, 8000);
    await waitUntil(() => seen.includes('respawn'), 8000);
    assert(ctx.state.players[1].pct === 0, 'réapparu à 0 %');
    step(`éjection forcée de P2 → stock:lost (${stocksBefore} → ${ctx.state.players[1].stocks}) → respawn à 0 %`);

    ctx.hooks.forcerVictoire(0);
    assert(ctx.state.phase === 'end' && ctx.state.winner === 0, 'forcerVictoire(0) → end, vainqueur 0');
    step('forcerVictoire(0) → match:end, winner=0');
  } catch (e) {
    errors.push(String((e as Error)?.stack ?? e));
  } finally {
    offAny();
    console.error = originalError;
  }
  const ok = errors.length === 0;
  await wait(0);
  const result: SelftestResult = { ok, steps, errors, finalState: window.gameState };
  console.log(`[selftest] ${ok ? 'OK' : 'ÉCHEC'} — ${steps.length} étape(s), ${errors.length} erreur(s).`);
  return result;
}

export function installSelftest(ctx: Ctx): void {
  window.__selftest = () => runSelftest(ctx);
}
