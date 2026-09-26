// Gemini stratège (lot RTBOT) : toutes les 8 s de combat, un résumé du duel part à /api/ai-move ; Gemini
// renvoie la posture du bot, l'arme conseillée et une provocation. Le réflexe (bot.ts) applique la posture.
// Pas de réponse en 2 s (ou repli du serveur) : le bot GARDE sa posture et se tait (ses réflexes jouent toujours).
import type { Ctx, PlayerId } from '../../core/types';
import { inFight } from '../phases';
import { getRuntime } from '../runtime';
import type { RealtimeBot } from './bot';
import { STANCES, type Stance } from './levels';
import { showTauntBubble } from './taunt-bubble';

const PERIOD_S = 8;
const FIRST_S = 2.5;
const TIMEOUT_MS = 2000;
const TAUNT_GAP_S = 9;

export interface StrategistStats {
  requests: number;
  ok: number;
  failed: number;
  timeouts: number;
  latenciesMs: number[];
  stanceChanges: number;
  /** Échecs où la posture a été gardée telle quelle (règle : pas de réponse en 2 s = on garde). */
  keptOnFailure: number;
  lastStance: Stance | null;
  lastTaunt: string | null;
  lastSource: string | null;
  /** Causes des replis (serveur : timeout, json, api-503… ; client : timeout, network, offline). */
  reasons: Record<string, number>;
}

interface FightLog {
  humanShotsByWeapon: Map<string, { name: string; category: string; uses: number }>;
  humanShots: number;
  humanPerfects: number;
  humanBlocks: number;
  window: { botHits: number; humanHits: number; humanParries: number };
}

export interface Strategist {
  stats: StrategistStats;
  /** Coupe les appels (tests : mesurer le maintien de la posture sans réseau). */
  offline: boolean;
}

function freshLog(): FightLog {
  return { humanShotsByWeapon: new Map(), humanShots: 0, humanPerfects: 0, humanBlocks: 0, window: { botHits: 0, humanHits: 0, humanParries: 0 } };
}

export function installStrategist(ctx: Ctx, bot: RealtimeBot): Strategist {
  const me: PlayerId = bot.me;
  const foe: PlayerId = bot.foe;
  const stats: StrategistStats = {
    requests: 0, ok: 0, failed: 0, timeouts: 0, latenciesMs: [], stanceChanges: 0, keptOnFailure: 0,
    lastStance: null, lastTaunt: null, lastSource: null, reasons: {},
  };
  const api: Strategist = { stats, offline: false };
  let log = freshLog();
  let nextAt = FIRST_S;
  let pending = false;
  let lastTauntAt = -Infinity;
  let seq = 0;

  ctx.bus.on('match:start', () => {
    log = freshLog(); nextAt = FIRST_S; pending = false; lastTauntAt = -Infinity; seq += 1;
    // Mesures par match (lues par tools/test-rtbot.mjs à la fin de chaque match).
    Object.assign(stats, { requests: 0, ok: 0, failed: 0, timeouts: 0, latenciesMs: [], stanceChanges: 0, keptOnFailure: 0, lastStance: null, lastTaunt: null, lastSource: null, reasons: {} });
  });
  ctx.bus.on('fire', ({ player, weapon }) => {
    if (player !== foe || !ctx.state.vsAI) return;
    log.humanShots += 1;
    const k = weapon.name;
    const e = log.humanShotsByWeapon.get(k) ?? { name: weapon.name, category: weapon.category, uses: 0 };
    e.uses += 1;
    log.humanShotsByWeapon.set(k, e);
  });
  ctx.bus.on('parry:result', ({ player, grade }) => {
    if (player !== foe || !ctx.state.vsAI) return;
    if (grade === 'perfect') log.humanPerfects += 1;
    if (grade === 'good') log.humanBlocks += 1;
    log.window.humanParries += 1;
  });
  ctx.bus.on('hit', ({ attacker, target }) => {
    if (!ctx.state.vsAI) return;
    if (attacker === me && target === foe) log.window.botHits += 1;
    if (attacker === foe && target === me) log.window.humanHits += 1;
  });

  function summary(): Record<string, unknown> {
    const st = ctx.state;
    const b = st.players[me];
    const h = st.players[foe];
    const edges = bot.edges();
    let fav: { name: string; category: string; uses: number } | null = null;
    for (const e of log.humanShotsByWeapon.values()) if (!fav || e.uses > fav.uses) fav = e;
    const rtH = getRuntime().players[foe];
    return {
      timeS: Math.round(getRuntime().fightTime),
      timeLeftS: Math.round(st.timerLeft),
      difficulty: st.difficulty,
      currentStance: bot.stance,
      you: {
        percent: Math.round(b.pct), stocks: b.stocks, distanceToEdgeM: +edges.me.toFixed(1),
        weapons: b.weapons.map((w, i) => ({ slot: i, name: w.name, category: w.category, ready: (b.cooldowns[i] ?? 0) <= 0 })),
      },
      opponent: {
        percent: Math.round(h.pct), stocks: h.stocks, distanceToEdgeM: +edges.foe.toFixed(1),
        offStage: h.onLedge || (!rtH.grounded && edges.foe <= 0),
        favoriteWeapon: fav, shots: log.humanShots, perfectParries: log.humanPerfects, blocks: log.humanBlocks,
      },
      distanceM: +Math.hypot(b.pos[0] - h.pos[0], b.pos[2] - h.pos[2]).toFixed(1),
      last8s: { ...log.window },
    };
  }

  function say(text: string, tag: string | null): void {
    const now = ctx.loop.time;
    if (now - lastTauntAt < TAUNT_GAP_S) return;
    lastTauntAt = now;
    showTauntBubble(ctx, me, text, tag ?? undefined);
  }

  function apply(stance: Stance | null, preferred: number | null, taunt: string | null, source: string): void {
    const changed = !!stance && stance !== bot.stance;
    if (stance) bot.setPlan(stance, preferred);
    if (changed) stats.stanceChanges += 1;
    stats.lastStance = bot.stance;
    stats.lastSource = source;
    if (taunt) { stats.lastTaunt = taunt; say(taunt, changed ? stance : null); }
  }

  function failed(kind: 'timeout' | 'error', reason: string = kind): void {
    const before = bot.stance;
    stats.failed += 1;
    if (kind === 'timeout') stats.timeouts += 1;
    stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1;
    stats.lastSource = 'kept';
    if (bot.stance === before) stats.keptOnFailure += 1; // la posture ne bouge pas (mesuré, pas supposé)
  }

  async function ask(): Promise<void> {
    const s = summary();
    log.window = { botHits: 0, humanHits: 0, humanParries: 0 }; // fenêtre suivante
    if (api.offline) { failed('error', 'offline'); return; }
    pending = true;
    stats.requests += 1;
    const mySeq = seq;
    const t0 = performance.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/ai-move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: s }), signal: abort.signal,
      });
      const data = res.ok ? await res.json() as { stance?: unknown; preferredWeapon?: unknown; taunt?: unknown; source?: unknown; reason?: unknown } : null;
      if (mySeq !== seq || !inFight(ctx)) return;
      const stance = STANCES.includes(data?.stance as Stance) ? data!.stance as Stance : null;
      if (!data || data.source !== 'gemini' || !stance) {
        const why = !data ? `http-${res.status}` : typeof data.reason === 'string' ? `serveur-${data.reason}` : 'invalide';
        failed(why === 'serveur-timeout' ? 'timeout' : 'error', why);
        return;
      }
      stats.ok += 1;
      stats.latenciesMs.push(Math.round(performance.now() - t0));
      const n = ctx.state.players[me].weapons.length;
      const pw = typeof data.preferredWeapon === 'number' && Number.isInteger(data.preferredWeapon) && data.preferredWeapon >= 0 && data.preferredWeapon < n ? data.preferredWeapon : null;
      const taunt = typeof data.taunt === 'string' && data.taunt.trim() ? data.taunt.trim() : null;
      apply(stance, pw, taunt, 'gemini');
    } catch (err) {
      const abort2s = (err as Error)?.name === 'AbortError';
      if (mySeq === seq) failed(abort2s ? 'timeout' : 'error', abort2s ? 'client-2s' : 'reseau');
    } finally {
      clearTimeout(timer);
      if (mySeq === seq) pending = false;
    }
  }

  ctx.loop.addSystem('ai-strategist', () => {
    if (!ctx.state.vsAI || !inFight(ctx) || pending) return;
    const t = getRuntime().fightTime;
    if (t < nextAt) return;
    nextAt = t + PERIOD_S;
    void ask();
  }, 38);

  return api;
}
