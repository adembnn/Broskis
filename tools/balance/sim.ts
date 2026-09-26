// Simulateur d'équilibrage, règles v2 façon Smash (lot LSMASH) : %, vies, éjection, rattrapage, mort subite,
// BRO SMASH. Même formules que le jeu (src/gameplay/formulas.ts via src/gameplay/rules.ts).
// Usage : node tools/balance/sim.ts [--full]   → captures/balance/rapport.md + rapport.json
// Cibles (plan/lots/LSMASH-regles-v2.md) : match à 2 vies en 8 à 12 tours, éjection moyenne entre 90 et 140 %,
// aucune éjection sous 40 %.
import * as fs from 'fs';
import * as path from 'path';
import { createRng, type Rng } from '../../src/core/rng.ts';
import { CATEGORIES, TRAITS } from '../../src/core/types.ts';
import type { Category, PlayerId, Weapon } from '../../src/core/types.ts';
import { createSimState, playTurn, startTurn, type SimAction, type SimState, type SimPlayer } from '../../src/gameplay/rules.ts';
import { defaultArsenal } from '../../src/gameplay/tuning.ts';
import { launchBase } from '../../src/gameplay/formulas.ts';

function archetypes(): Weapon[] {
  const out: Weapon[] = [];
  let id = 0;
  for (const category of CATEGORIES) for (const trait of TRAITS) for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const c = 10 - a - b;
    if (c < 1 || c > 6) continue;
    out.push({
      id: `arch-${id++}`, object: 'sim', name: `${category}-${trait}-${a}${b}${c}`, category, why: '', stats: { a, b, c }, trait,
      palette: ['#000', '#fff'], lines: { intro: '', hit: '', miss: '', parried: '' }, source: 'preset', cooldown: 0,
    });
  }
  return out;
}

type Bot = 'Random' | 'Glouton' | 'Pousseur' | 'Tortue' | 'Expert';
type ParryProfile = 'Novice' | 'Moyen' | 'Expert';
const BOTS: Bot[] = ['Random', 'Glouton', 'Pousseur', 'Tortue', 'Expert'];

function gauss(rng: Rng): number {
  const u1 = Math.max(1e-10, rng());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
}

function parryFor(profile: ParryProfile, rng: Rng) {
  return () => {
    if (profile === 'Novice') return rng() < 0.15 ? { hasInput: false } : { hasInput: true, timingMs: 30 + gauss(rng) * 150 };
    if (profile === 'Moyen') return rng() < 0.05 ? { hasInput: false } : { hasInput: true, timingMs: gauss(rng) * 90 };
    return rng() < 0.02 ? { hasInput: false } : { hasInput: true, timingMs: gauss(rng) * 50 };
  };
}

function ready(p: SimPlayer): number[] {
  return p.weapons.map((_, i) => i).filter((i) => p.cooldowns[i] <= 0);
}

function decide(s: SimState, bot: Bot, defProfile: ParryProfile, rng: Rng): SimAction {
  const me = s.players[s.active];
  const r = ready(me);
  const offensive = r.filter((i) => me.weapons[i].category !== 'shield');
  const pick = (score: (w: Weapon) => number) => (offensive.length ? offensive : r).slice().sort((a, b) => score(me.weapons[b]) - score(me.weapons[a]))[0] ?? 0;
  const parry = parryFor(defProfile, rng);
  const edge = s.radius - Math.hypot(me.x, me.z);
  switch (bot) {
    case 'Random':
      return { move: 'random', weaponIdx: r.length ? rng.pick(r) : 0, charge: 0.2 + rng() * 0.8, aim: 0.6, nice: rng() < 0.1, parry };
    case 'Glouton':
      return { move: 'stay', weaponIdx: pick((w) => w.stats.a), charge: 0.9, aim: 0.9, nice: rng() < 0.2, parry };
    case 'Pousseur':
      return { move: 'flank', weaponIdx: pick((w) => launchBase(w, 1)), charge: 1, aim: 0.85, nice: rng() < 0.2, parry };
    case 'Tortue': {
      const shield = r.find((i) => me.weapons[i].category === 'shield');
      return { move: 'center', weaponIdx: shield ?? pick((w) => w.stats.a), charge: 0.6, aim: 0.8, nice: rng() < 0.1, parry };
    }
    default:
      return { move: edge < 3 && me.pct > 60 ? 'center' : 'flank', weaponIdx: pick((w) => w.stats.a + launchBase(w, 1) * 4), charge: 0.95, aim: 1, nice: rng() < 0.5, parry };
  }
}

interface MatchResult { winner: PlayerId; turns: number; kos: SimState['kos']; supers: number; firstSuper: number | null; ledges: number; hits: number; pct: number }

function playMatch(seed: number, stocks: number, bots: [Bot, Bot], profiles: [ParryProfile, ParryProfile], weapons: [Weapon[], Weapon[]], power: [number, number] = [5, 5], hpMax: [number, number] = [100, 100]): MatchResult {
  const rng = createRng(seed);
  const mk = (i: 0 | 1) => ({
    pct: 0, stocks, hpMax: hpMax[i], power: power[i], weapons: weapons[i].map((w) => ({ ...w })), cooldowns: [0, 0, 0],
    parryStreak: 0, bro: 0, superReady: false, invulnUntilTurn: 0, onLedge: false,
  });
  const s = createSimState(mk(0), mk(1));
  while (s.winner == null && s.turn < 60) {
    const def: PlayerId = s.active === 0 ? 1 : 0;
    startTurn(s);
    playTurn(s, decide(s, bots[s.active], profiles[def], rng), rng);
  }
  const winner = s.winner ?? (s.players[0].stocks > s.players[1].stocks ? 0 : s.players[1].stocks > s.players[0].stocks ? 1 : s.players[0].pct <= s.players[1].pct ? 0 : 1);
  return { winner, turns: s.turn, kos: s.kos, supers: s.supersFired, firstSuper: s.firstSuperTurn, ledges: s.ledgeGrabs, hits: s.hitsLanded, pct: s.pctDealt };
}

const q = (arr: number[], p: number) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
const pc = (x: number) => `${(x * 100).toFixed(1)} %`;

function summarize(label: string, results: MatchResult[]) {
  const turns = results.map((r) => r.turns);
  const kos = results.flatMap((r) => r.kos);
  const koPct = kos.map((k) => k.pct);
  const beforeSd = kos.filter((k) => !k.sd).map((k) => k.pct);
  return {
    label,
    matches: results.length,
    turnsMedian: q(turns, 0.5), turnsMean: +mean(turns).toFixed(1), turnsP10: q(turns, 0.1), turnsP90: q(turns, 0.9),
    in8to12: +(turns.filter((t) => t >= 8 && t <= 12).length / results.length).toFixed(3),
    koMeanPct: +mean(koPct).toFixed(1), koMedianPct: q(koPct, 0.5), koMinPct: Math.min(...koPct),
    koUnder40: kos.filter((k) => k.pct < 40).length, koShareSd: +(kos.filter((k) => k.sd).length / Math.max(1, kos.length)).toFixed(3),
    koMeanPctBeforeSd: +mean(beforeSd).toFixed(1),
    koBySuper: +(kos.filter((k) => k.super).length / Math.max(1, kos.length)).toFixed(3),
    p1Wins: +(results.filter((r) => r.winner === 0).length / results.length).toFixed(3),
    supersPerMatch: +mean(results.map((r) => r.supers)).toFixed(2),
    firstSuperTurnMedian: q(results.map((r) => r.firstSuper).filter((x): x is number => x != null), 0.5),
    ledgeGrabsPerMatch: +mean(results.map((r) => r.ledges)).toFixed(2),
    pctPerHit: +(mean(results.map((r) => r.pct)) / Math.max(1, mean(results.map((r) => r.hits)))).toFixed(1),
  };
}

function run() {
  const full = process.argv.includes('--full');
  const N = full ? 40000 : 6000;
  const arch = archetypes();
  const base = createRng(42);
  const rand: MatchResult[] = [];
  const presets: MatchResult[] = [];
  const demo: MatchResult[] = [];
  const catWins: Record<Category, [number, number]> = { blaster: [0, 0], grenade: [0, 0], throwable: [0, 0], shield: [0, 0] };
  for (let i = 0; i < N; i++) {
    const w: [Weapon[], Weapon[]] = [[base.pick(arch), base.pick(arch), base.pick(arch)], [base.pick(arch), base.pick(arch), base.pick(arch)]];
    const res = playMatch(base.int(0, 1e9), 2, [base.pick(BOTS), base.pick(BOTS)], ['Moyen', 'Moyen'], w);
    rand.push(res);
    for (const p of [0, 1] as const) {
      const cat = w[p][0].category;
      catWins[cat][1] += 1;
      if (res.winner === p) catWins[cat][0] += 1;
    }
  }
  const prof: ParryProfile[] = ['Novice', 'Moyen', 'Expert'];
  for (let i = 0; i < N / 2; i++) {
    const pr: [ParryProfile, ParryProfile] = [base.pick(prof), base.pick(prof)];
    presets.push(playMatch(base.int(0, 1e9), 2, [base.pick(BOTS), base.pick(BOTS)], pr, [defaultArsenal(), defaultArsenal()]));
    demo.push(playMatch(base.int(0, 1e9), 1, [base.pick(BOTS), base.pick(BOTS)], pr, [defaultArsenal(), defaultArsenal()]));
  }
  // Débutants qui se ratent (parade Novice des deux côtés), arsenal par défaut : le cas de la démo en public.
  const novices: MatchResult[] = [];
  for (let i = 0; i < N / 2; i++) novices.push(playMatch(base.int(0, 1e9), 2, ['Random', 'Random'], ['Novice', 'Novice'], [defaultArsenal(), defaultArsenal()]));
  let expWins = 0;
  for (let i = 0; i < 1000; i++) {
    const w = [base.pick(arch), base.pick(arch), base.pick(arch)];
    if (playMatch(base.int(0, 1e9), 2, ['Expert', 'Random'], ['Expert', 'Novice'], [w, w]).winner === 0) expWins++;
  }

  const S = [summarize('Armes aléatoires, 2 vies, parade moyenne', rand), summarize('Arsenal par défaut, 2 vies', presets),
    summarize('Arsenal par défaut, 1 vie (?demo=1)', demo), summarize('Deux débutants (Novice), arsenal par défaut, 2 vies', novices)];
  let md = `# Rapport d'équilibrage — règles v2 (LSMASH)\n\n${N} matchs aléatoires + ${N / 2} par scénario. Cibles : 8 à 12 tours (2 vies), éjection moyenne 90 à 140 %, aucune sous 40 %.\n\n`;
  md += '| Scénario | Tours médian (p10–p90) | Part 8–12 | Éjection moy. % (avant mort subite) | Min % | Sous 40 % | Éjections en mort subite | Victoires J1 | BRO SMASH / match (1er au tour) | Rattrapages / match | % par coup |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of S) md += `| ${r.label} | ${r.turnsMedian} (${r.turnsP10}–${r.turnsP90}) | ${pc(r.in8to12)} | ${r.koMeanPct} (${r.koMeanPctBeforeSd}) | ${r.koMinPct} | ${r.koUnder40} | ${pc(r.koShareSd)} | ${pc(r.p1Wins)} | ${r.supersPerMatch} (${r.firstSuperTurnMedian}) | ${r.ledgeGrabsPerMatch} | ${r.pctPerHit} |\n`;
  md += `\nExpert contre débutant : ${pc(expWins / 1000)} de victoires.\n\nVictoires par catégorie de l'arme n°1 : ${CATEGORIES.map((c) => `${c} ${pc(catWins[c][0] / Math.max(1, catWins[c][1]))}`).join(', ')}.\n`;
  const dir = path.join(process.cwd(), 'captures', 'balance');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'rapport.md'), md, 'utf8');
  fs.writeFileSync(path.join(dir, 'rapport.json'), JSON.stringify({ scenarios: S, expertVsNovice: expWins / 1000 }, null, 2), 'utf8');
  console.log(md);
}

run();
