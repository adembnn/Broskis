// Match complet joué uniquement via `window.gameHooks` (aucune souris ni clavier), pour que la session
// principale puisse le lancer dans le navigateur : `await window.__selftest()`. Ne throw jamais : les
// erreurs sont collectées dans le résultat. Règles v2 (lot LSMASH) : les coups montent le %, une éjection
// forcée (`window.__lsmash.launch`) fait perdre une vie puis réapparaître ; la caisse Snap est forcée sous
// les pieds plutôt que d'attendre le tirage aléatoire, pour un test court et reproductible.
import type { Ctx, FighterDef, Weapon } from '../core/types';
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

// Volontairement PAS une assertion function TS (`asserts cond`) : sur `ctx.state.phase === '...'`, ça
// figerait un narrowing qui devient faux dès qu'un hook change la phase, et ferait échouer la compilation
// des vérifications suivantes (« types X et Y have no overlap ») sans rapport avec un vrai bug.
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion échouée : ${msg}`);
}

const TEST_FIGHTERS: [FighterDef, FighterDef] = [
  { id: 'selftest-p0', name: 'Selftest P0', model: 'knight', hpMax: 100, power: 5, agility: 5 },
  { id: 'selftest-p1', name: 'Selftest P1', model: 'rogue_hooded', hpMax: 100, power: 5, agility: 5 },
];

/** Arsenal par défaut, mais avec le blaster réglé à précision maximale (budget toujours a+b+c=10) :
 * un script sans souris tire droit, la dispersion de la rafale ne doit pas rendre le test aléatoire.
 * Fonction (pas une constante) : `window.__selftest()` doit rester rejouable sans armes en recharge
 * héritées d'un run précédent (startMatch ne réinitialise pas des objets Weapon fournis). */
function testWeapons(): [Weapon[], Weapon[]] {
  const make = (): Weapon[] => {
    const weapons = defaultArsenal();
    const blaster = weapons.find((w) => w.category === 'blaster');
    if (blaster) blaster.stats = { a: 4, b: 1, c: 5 };
    return weapons;
  };
  return [make(), make()];
}

async function runSelftest(ctx: Ctx): Promise<SelftestResult> {
  const steps: string[] = [];
  const errors: string[] = [];
  const step = (s: string) => steps.push(s);
  const originalError = console.error;
  // Seules les erreurs du gameplay (ses systèmes, ou un écouteur du bus) font échouer ce test : une erreur d'un
  // autre lot (rendu, caméra…) est signalée par tools/capture.mjs, pas ici.
  console.error = (...args: unknown[]) => {
    // Fautif = le haut de la pile (où l'erreur est levée), pas l'émetteur du bus qui l'a appelé par-dessous.
    const top = args.map((a) => (a instanceof Error ? (a.stack ?? '').split('\n').slice(0, 3).join(' ') : String(a))).join(' ');
    if (/gameplay/.test(top)) errors.push(top);
    originalError(...args);
  };

  try {
    const seen: string[] = [];
    const offAny = ctx.bus.onAny((name) => { seen.push(name); });
    ctx.hooks.startMatch({ seed: 20260926, fighters: TEST_FIGHTERS, weapons: testWeapons(), stocks: 2 });
    step('startMatch({seed, 2 vies, blaster haute précision})');
    assert(ctx.state.phase === 'turn-intro', `phase attendue 'turn-intro', obtenu '${ctx.state.phase}'`);
    assert(ctx.state.players[0].weapons.length === 3 && ctx.state.players[1].weapons.length === 3, '3 armes par défaut par joueur');
    assert(ctx.state.players[0].pct === 0 && ctx.state.players[1].stocks === 2, 'départ à 0 % et 2 vies');

    await waitUntil(() => ctx.state.phase === 'move', 15000); // GO! attend le chargement de la map
    assert(seen.includes('match:banner'), 'READY?/GO! doivent être émis (match:banner)');
    step("READY? GO! puis bandeau de tour → phase 'move'");

    // --- Tour 1 (P0) : déplacement, saut, visée, tir — personne ne pare, le coup doit toucher. ---
    assert(ctx.state.active === 0, 'le tour 1 doit être à P0');
    const moveLeftBefore = ctx.state.players[0].moveLeft;
    ctx.hooks.move(2, 0);
    assert(ctx.state.players[0].moveLeft < moveLeftBefore, 'move(2,0) doit consommer du budget de déplacement');
    ctx.hooks.jump();
    assert(ctx.state.players[0].jumpUsed, 'jump() doit marquer jumpUsed');
    step(`move(2,0) + jump() → moveLeft=${ctx.state.players[0].moveLeft.toFixed(2)}`);

    ctx.hooks.pickWeapon(0);
    assert(ctx.state.phase === 'aim', `pickWeapon(0) doit passer en 'aim', obtenu '${ctx.state.phase}'`);
    ctx.hooks.aim(90, 0); // P0 (-x) vise vers +x, où se trouve P1
    ctx.hooks.fire(0.6);
    assert(ctx.state.phase === 'resolve', `fire() doit passer en 'resolve', obtenu '${ctx.state.phase}'`);
    step(`pickWeapon(0)=${ctx.state.players[0].weapons[0].category}, aim(90,0), fire(0.6)`);

    const pctP1Before = ctx.state.players[1].pct;
    await waitUntil(() => ctx.state.turn >= 2, 20000);
    assert(ctx.state.players[1].pct > pctP1Before, 'P1 doit avoir pris des % (aucune parade au tour 1)');
    assert(ctx.state.players[0].weapons[0].cooldown > 0, "l'arme tirée doit recharger 1 tour");
    step(`tour 2 atteint — P1 ${pctP1Before} % → ${ctx.state.players[1].pct} %, arme en recharge`);

    // --- Tour 2 (P1) : même arme ; chaque tir de la rafale est paré PARFAITEMENT via le hook. ---
    assert(ctx.state.active === 1, 'le tour 2 doit être à P1');
    const pctP0Before = ctx.state.players[0].pct;
    await waitUntil(() => ctx.state.phase === 'move', 10000);
    const offIncoming = ctx.bus.on('projectile:incoming', () => ctx.hooks.parry(0));
    ctx.hooks.pickWeapon(0);
    ctx.hooks.aim(-90, 0); // P1 (+x) vise vers -x, où se trouve P0
    ctx.hooks.fire(0.5);
    step('P1 : pickWeapon(0), aim(-90,0), fire(0.5) — parry(0) sur chaque projectile:incoming');
    await waitUntil(() => ctx.state.turn >= 3, 20000);
    offIncoming();
    assert(ctx.state.players[0].pct === pctP0Before, 'une parade PARFAITE doit annuler tous les dégâts de la rafale');
    assert(ctx.state.players[0].parryStreak > 0, 'parryStreak doit monter après des parades réussies');
    step(`tour 3 atteint — P0 % inchangé, parryStreak=${ctx.state.players[0].parryStreak}`);

    // --- Règles v2 : budget rendu à chaque tour, arme en recharge remplacée par une arme prête. ---
    await waitUntil(() => ctx.state.phase === 'move', 10000);
    const p0 = ctx.state.players[0];
    assert(Math.abs(p0.moveLeft - 6) < 1e-6, `le budget de déplacement doit être rendu (6 m), obtenu ${p0.moveLeft}`);
    assert(p0.weapons[p0.selected].cooldown === 0, "l'arme présélectionnée doit être prête");
    step(`tour 3 : moveLeft=${p0.moveLeft}, arme prête présélectionnée (#${p0.selected + 1})`);

    // --- Caisse Snap : forcée sous les pieds du joueur actif (le tirage aléatoire prendrait trop longtemps). ---
    await waitUntil(() => ctx.state.phase === 'move', 10000);
    const grabber = ctx.state.active;
    const grabberPos = ctx.state.players[grabber].pos;
    const slot1Before = ctx.state.players[grabber].weapons[1].id;
    ctx.state.crate = { pos: [...grabberPos], landsInTurns: 0, landed: true };
    ctx.hooks.grabCrate();
    assert(ctx.state.phase === 'snap-time', `grabCrate() doit passer en 'snap-time', obtenu '${ctx.state.phase}'`);
    // IMPORTANT : pickWeapon() APRÈS grabCrate(), pas avant — tant qu'on n'est pas encore en `snap-time`,
    // pickWeapon(1) sélectionnerait l'arme n°1 au lieu de choisir l'emplacement Snap (voir aim.ts::pickWeapon).
    ctx.hooks.pickWeapon(1); // choisit l'emplacement 1 (le scan du stub répond quasi instantanément)
    step(`grabCrate() (caisse forcée) → snap-time, joueur ${grabber}`);

    await waitUntil(() => ctx.state.phase !== 'snap-time', 6000);
    assert(ctx.state.players[grabber].weapons[1].id !== slot1Before, "l'emplacement 1 doit recevoir l'arme scannée (stub IA)");
    step(`snap-time résolu → phase '${ctx.state.phase}', arme scannée en place`);

    // --- Règles v2 : éjection forcée hors de l'arène → stock:lost → respawn. ---
    const victim = ctx.state.active === 0 ? 1 : 0;
    const stocksBefore = ctx.state.players[victim].stocks;
    window.__lsmash?.launch(victim, victim === 1 ? 1 : -1, 0, 30);
    await waitUntil(() => ctx.state.players[victim].stocks < stocksBefore, 10000);
    await waitUntil(() => seen.includes('respawn'), 10000);
    assert(ctx.state.players[victim].pct === 0, 'réapparu à 0 %');
    step(`éjection forcée de P${victim + 1} → stock:lost (${stocksBefore} → ${ctx.state.players[victim].stocks}) → respawn à 0 %`);
    offAny();

    // --- Fin forcée : vérifie forcerVictoire indépendamment du déroulé naturel du match. ---
    ctx.hooks.forcerVictoire(0);
    assert(ctx.state.phase === 'end', `forcerVictoire doit passer en 'end', obtenu '${ctx.state.phase}'`);
    assert(ctx.state.winner === 0, `le vainqueur forcé doit être 0, obtenu '${String(ctx.state.winner)}'`);
    step('forcerVictoire(0) → match:end, winner=0');
  } catch (e) {
    errors.push(String((e as Error)?.stack ?? e));
  } finally {
    console.error = originalError;
  }

  const ok = errors.length === 0;
  await wait(0); // laisse une micro-tâche s'écouler avant de lire l'état final (cohérence des derniers events)
  const result: SelftestResult = { ok, steps, errors, finalState: window.gameState };
  console.log(`[selftest] ${ok ? 'OK' : 'ÉCHEC'} — ${steps.length} étape(s), ${errors.length} erreur(s).`);
  return result;
}

export function installSelftest(ctx: Ctx): void {
  window.__selftest = () => runSelftest(ctx);
}
