import * as fs from 'fs';
import * as path from 'path';
import { createRng } from '../../src/core/rng.ts';
import { CATEGORIES, TRAITS } from '../../src/core/types.ts';
import type { Category, Trait, Weapon, WeaponStats, FighterDef, PlayerId } from '../../src/core/types';
import { type SimState, type SimPlayer, type SimAction, applyRuleEngine, MAX_HEAL_PER_MATCH, MAX_DAMAGE_PER_HIT, MAX_PROJECTILES_PER_TURN } from '../../src/gameplay/rules.ts';
import { defaultFighters, defaultArsenal, TURN_BANNER_S } from '../../src/gameplay/tuning.ts';

function generateArchetypes(): Weapon[] {
  const weapons: Weapon[] = [];
  let idCounter = 0;
  for (const cat of CATEGORIES) {
    for (const trait of TRAITS) {
      for (let a = 1; a <= 6; a++) {
        for (let b = 1; b <= 6; b++) {
          const c = 10 - a - b;
          if (c >= 1 && c <= 6) {
            weapons.push({
              id: `arch-${idCounter++}`,
              object: 'sim_object',
              name: `${cat}-${trait}-${a}${b}${c}`,
              category: cat,
              why: 'simulated',
              stats: { a, b, c },
              trait,
              palette: ['#000', '#fff'],
              lines: { intro: '', hit: '', miss: '', parried: '' },
              source: 'preset',
              cooldown: 0
            });
          }
        }
      }
    }
  }
  return weapons;
}

type BotType = 'Random' | 'Glouton' | 'Pousseur' | 'Tortue' | 'Expert';
type ParryProfile = 'Novice' | 'Moyen' | 'Expert';

function getParryTiming(profile: ParryProfile, rng: any): { timingMs?: number, hasInput?: boolean } {
  // Box-Muller transform for normal distribution
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  if (profile === 'Novice') {
    if (rng() < 0.10) return { hasInput: false }; // 10% no input
    return { timingMs: 30 + z0 * 140, hasInput: true };
  } else if (profile === 'Moyen') {
    if (rng() < 0.05) return { hasInput: false }; // assuming 5%
    return { timingMs: z0 * 90, hasInput: true };
  } else {
    if (rng() < 0.02) return { hasInput: false }; // assuming 2%
    return { timingMs: z0 * 50, hasInput: true };
  }
}

function botDecide(state: SimState, botType: BotType, profile: ParryProfile, rng: any): SimAction {
  const p = state.players[state.active];
  const weaponsReady = p.weapons.map((w, i) => ({w, i})).filter(x => p.cooldowns[x.i] === 0);
  
  let action: SimAction;

  if (botType === 'Random' || weaponsReady.length === 0) {
    if (weaponsReady.length === 0 || rng() < 0.2) {
      action = { type: 'move', strategy: rng() < 0.5 ? 'cover' : 'push' };
    } else {
      action = { type: 'attack', weaponIdx: rng.pick(weaponsReady).i, aimQuality: rng() };
    }
  } else if (botType === 'Glouton') {
    // Pick weapon with max power stat
    const best = weaponsReady.sort((a, b) => b.w.stats.a - a.w.stats.a)[0];
    action = { type: 'attack', weaponIdx: best.i, aimQuality: 0.9 };
  } else if (botType === 'Pousseur') {
    const best = weaponsReady.sort((a, b) => b.w.stats.b - a.w.stats.b)[0]; // b or c depending on what knocks back more (throwable a=power, c=knockback maybe?)
    if (rng() < 0.3) action = { type: 'move', strategy: 'push' };
    else action = { type: 'attack', weaponIdx: best.i, aimQuality: 0.8 };
  } else if (botType === 'Tortue') {
    const shields = weaponsReady.filter(x => x.w.category === 'shield');
    if (shields.length > 0) action = { type: 'attack', weaponIdx: shields[0].i, aimQuality: 0.8 };
    else action = { type: 'move', strategy: 'cover' };
  } else { // Expert
    const best = weaponsReady.sort((a, b) => b.w.stats.a - a.w.stats.a)[0];
    action = { type: 'attack', weaponIdx: best.i, aimQuality: 1.0 };
  }

  const timing = getParryTiming(profile, rng);
  if (action.type === 'attack') {
    action.parryTimingMs = timing.timingMs;
    action.parryHasInput = timing.hasInput;
  }
  return action;
}

interface MatchResult {
  winnerId: PlayerId;
  winnerHp: number;
  loserHp: number;
  turns: number;
  ringout: boolean;
  comeback: boolean;
  suddenDeath: boolean;
}

function playMatch(
  seed: number, 
  p0Args: { bot: BotType, profile: ParryProfile, hp: number, weapons: Weapon[] },
  p1Args: { bot: BotType, profile: ParryProfile, hp: number, weapons: Weapon[] }
): MatchResult {
  const rng = createRng(seed);
  
  let state: SimState = {
    turn: 1,
    active: 0,
    winner: null,
    suddenDeath: false,
    players: [
      {
        id: 0, hp: p0Args.hp, hpMax: p0Args.hp, power: 5,
        weapons: p0Args.weapons, cooldowns: [0,0,0],
        distanceToOpponent: 10, distanceToEdge: 15, hasCover: false, healedThisMatch: 0, parryStreak: 0
      },
      {
        id: 1, hp: p1Args.hp, hpMax: p1Args.hp, power: 5,
        weapons: p1Args.weapons, cooldowns: [0,0,0],
        distanceToOpponent: 10, distanceToEdge: 15, hasCover: false, healedThisMatch: 0, parryStreak: 0
      }
    ]
  };

  let maxDeficit = [0, 0];

  while (state.winner === null && state.turn < 50) {
    const activeIdx = state.active;
    const currentHpDiff = state.players[activeIdx].hp - state.players[activeIdx===0?1:0].hp;
    if (currentHpDiff < -maxDeficit[activeIdx]) maxDeficit[activeIdx] = -currentHpDiff;

    const args = activeIdx === 0 ? p0Args : p1Args;
    const defArgs = activeIdx === 0 ? p1Args : p0Args;

    // To properly sim parry timing, we use the defender's profile
    const action = botDecide(state, args.bot, defArgs.profile, rng); 

    state = applyRuleEngine(state, action, rng);
  }

  const winnerId = state.winner ?? (state.players[0].hp > state.players[1].hp ? 0 : 1);
  const loserId = winnerId === 0 ? 1 : 0;
  const winnerHp = state.players[winnerId].hp;
  const loserHp = state.players[loserId].hp;
  const ringout = state.players[loserId].distanceToEdge <= 0;
  
  return {
    winnerId,
    winnerHp,
    loserHp,
    turns: state.turn,
    ringout,
    comeback: maxDeficit[winnerId] >= 30,
    suddenDeath: state.suddenDeath
  };
}

async function run() {
  const args = process.argv.slice(2);
  const isFull = args.includes('--full');
  const isReplay = args.includes('--replay');
  const maxMatches = isFull ? 110000 : 10000;

  const archetypes = generateArchetypes();
  const baseRng = createRng(42);
  
  const results: MatchResult[] = [];
  const catWins: Record<Category, number> = { blaster: 0, grenade: 0, throwable: 0, shield: 0 };
  const catMatches: Record<Category, number> = { blaster: 0, grenade: 0, throwable: 0, shield: 0 };
  const catMatrix: Record<string, Record<string, { wins: number, total: number }>> = {};

  for(const c1 of CATEGORIES) {
    catMatrix[c1] = {};
    for(const c2 of CATEGORIES) {
      catMatrix[c1][c2] = { wins: 0, total: 0 };
    }
  }

  console.log(`Starting ${isFull ? 'FULL' : 'QUICK'} run (${maxMatches} matches)...`);

  const bots: BotType[] = ['Random', 'Glouton', 'Pousseur', 'Tortue', 'Expert'];
  let firstPlayerWins = 0;
  let ringouts = 0;
  let comebacks = 0;
  let suddenDeaths = 0;
  let koTurns: number[] = [];
  let oneShotKos = 0;

  for (let i = 0; i < maxMatches; i++) {
    const seed = baseRng.int(0, 9999999);
    const p0Weapons = [baseRng.pick(archetypes), baseRng.pick(archetypes), baseRng.pick(archetypes)];
    const p1Weapons = [baseRng.pick(archetypes), baseRng.pick(archetypes), baseRng.pick(archetypes)];
    
    const p0Cat = p0Weapons[0].category; // abstracting primary
    const p1Cat = p1Weapons[0].category;

    const res = playMatch(seed, 
      { bot: baseRng.pick(bots), profile: 'Moyen', hp: 100, weapons: p0Weapons },
      { bot: baseRng.pick(bots), profile: 'Moyen', hp: 100, weapons: p1Weapons }
    );
    if (i === 0) console.log('DEBUG Match 0:', res);

    results.push(res);
    koTurns.push(res.turns);

    if (res.winnerId === 0) {
      firstPlayerWins++;
      catWins[p0Cat]++;
      catMatrix[p0Cat][p1Cat].wins++;
    } else {
      catWins[p1Cat]++;
      catMatrix[p1Cat][p0Cat].wins++;
    }
    
    catMatches[p0Cat]++;
    catMatches[p1Cat]++;
    catMatrix[p0Cat][p1Cat].total++;
    catMatrix[p1Cat][p0Cat].total++;

    if (res.ringout) ringouts++;
    if (res.comeback) comebacks++;
    if (res.suddenDeath) suddenDeaths++;
    if (res.turns <= 1 && (res.loserHp >= 50 || res.winnerHp >= 50)) oneShotKos++;
  }

  koTurns.sort((a,b) => a-b);
  const medianTurn = koTurns[Math.floor(koTurns.length / 2)];
  const earlyKos = koTurns.filter(t => t < 3).length / koTurns.length;

  const firstPlayerAdv = firstPlayerWins / maxMatches;
  const ringoutRate = ringouts / maxMatches;
  const comebackRate = comebacks / maxMatches;
  const sdRate = suddenDeaths / maxMatches;

  let redAlert = false;
  let report = `# Rapport d'équilibrage\n\n`;

  report += `## Métriques Globales\n`;
  report += `- Avantage P1: ${(firstPlayerAdv*100).toFixed(1)}% (Cible: 47-53%)\n`;
  if (firstPlayerAdv > 0.56) redAlert = true;

  report += `- KO Médian: Tour ${medianTurn} (Cible: 5 ou 6)\n`;
  report += `- KO avant Tour 3: ${(earlyKos*100).toFixed(1)}% (Cible: < 5%)\n`;
  report += `- Mort Subite: ${(sdRate*100).toFixed(1)}% (Cible: ≤ 25%)\n`;
  
  if (oneShotKos > 0) {
    report += `- ALERTE: ${oneShotKos} KO en un coup à ≥ 50 PV détectés.\n`;
    redAlert = true;
  }

  report += `- KO par sortie de ring: ${(ringoutRate*100).toFixed(1)}% (Cible: 35-60%)\n`;
  if (ringoutRate < 0.20 || ringoutRate > 0.75) redAlert = true;

  report += `- Retours (mené de 30 PV): ${(comebackRate*100).toFixed(1)}% (Cible: 20-35%)\n`;
  if (comebackRate < 0.10) redAlert = true;

  report += `\n## Matrice des Catégories (Ligne bat Colonne %)\n`;
  report += `| | BLASTER | GRENADE | THROWABLE | SHIELD |\n|---|---|---|---|---|\n`;
  for (const c1 of CATEGORIES) {
    let row = `| ${c1} |`;
    for (const c2 of CATEGORIES) {
      if (c1 === c2) row += ` — |`;
      else {
        const rate = catMatrix[c1][c2].total > 0 ? catMatrix[c1][c2].wins / catMatrix[c1][c2].total : 0.5;
        row += ` ${(rate*100).toFixed(1)}% |`;
      }
    }
    report += row + `\n`;
  }

  // Expert vs Novice test
  let expWins = 0;
  for(let i=0; i<1000; i++) {
    const seed = baseRng.int(0, 9999999);
    const weapons = [baseRng.pick(archetypes), baseRng.pick(archetypes), baseRng.pick(archetypes)];
    const res = playMatch(seed,
      { bot: 'Expert', profile: 'Expert', hp: 100, weapons },
      { bot: 'Random', profile: 'Novice', hp: 100, weapons }
    );
    if (res.winnerId === 0) expWins++;
  }
  const expRate = expWins / 1000;
  report += `\n## Test de Compétence\n`;
  report += `- Expert vs Novice: ${(expRate*100).toFixed(1)}% (Cible: 75-90%)\n`;
  if (expRate < 0.65 || expRate > 0.95) redAlert = true;

  // Réglages proposés
  report += `\n## Réglages Proposés\n`;
  report += `1. Ajuster KNOCKBACK_BASE si ringoutRate est hors-cible.\n`;
  report += `2. Ajuster DAMAGE_PER_POWER si medianTurn est incorrect.\n`;
  report += `3. Modifier PARRY_WINDOWS si expert/novice n'est pas bon.\n`;

  const captureDir = path.join(process.cwd(), 'captures', 'balance');
  if (!fs.existsSync(captureDir)) {
    fs.mkdirSync(captureDir, { recursive: true });
  }

  fs.writeFileSync(path.join(captureDir, 'rapport.md'), report, 'utf8');
  fs.writeFileSync(path.join(captureDir, 'rapport.json'), JSON.stringify({
    firstPlayerAdv,
    medianTurn,
    earlyKos,
    sdRate,
    ringoutRate,
    comebackRate,
    expRate,
    redAlert
  }, null, 2), 'utf8');

  console.log(report);

  if (redAlert) {
    console.error("ALERTE ROUGE : Certaines métriques sont hors limites critiques.");
    process.exit(1);
  }
}

run().catch(console.error);
