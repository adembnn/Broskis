// Lot LBK · Banque de voix pré-générées ("barks") : lecteur qui pioche dans public/assets/voices/manifest.json
// (généré par tools/voices/generate-barks.mjs) et abonne le bus aux événements qui doivent crier une réplique.
// Ne dépend d'aucun fichier réseau au chargement du module : le manifeste est chargé en tâche de fond, et
// tout est no-op tant qu'il n'est pas prêt (le jeu doit tourner même si la banque de voix est absente/vide —
// voir tools/voices/LISEZMOI.md, "stratégie de secours").
//
// Lot LVOX (26/09 14h20, une seule voix) : ce fichier est devenu le SEUL lecteur de voix du jeu, pour
// l'animateur ET les persos — avant, `src/audio/commentary.ts` (barks LBK) ET `src/ia/commentary.ts` (Gemini
// + Gradium, lot LI) parlaient chacun de leur côté, d'où deux voix qui se chevauchaient sur chaque coup.
// Désormais :
//  - tout ce qui joue une réplique passe par `barkPlayer` (file unique, une seule lecture à la fois) ;
//  - `src/audio/commentary.ts` ne lit plus aucun audio lui-même, il relaie `commentary:line` ici ;
//  - `src/ia/commentary.ts` (répliques Gemini : pesée + révélation d'arme scannée en match) synthétise son
//    audio (api/tts.ts, Gemini Fenrir) puis appelle `playAnnouncerCustomLine` ci-dessous, au lieu d'émettre
//    lui-même un son ;
//  - `src/gameplay/ai/taunt-bubble.ts` appelle `playBark` (voix de perso), plus `commentary:line`.
import type { Bus } from '../core/bus';
import type { Category, Ctx, ModelId, PlayerId } from '../core/types';
import type { AudioEngine } from './engine';
import type { MusicDirector } from './music';

/** Rôles de voix (voir plan/lots/LBK-banque-voix.md, tableau des voix Gemini). */
export type BarkRole = 'announcer' | 'barbarian' | 'knight' | 'mage' | 'rogue';

/** Événements « combattant » (répliques à la première personne). */
export type FighterBarkEvent =
  | 'hit_light' | 'hit_heavy' | 'crit_taken' | 'parry_perfect' | 'parry_good' | 'whiff' | 'dodge'
  | 'throw_effort' | 'jump_effort' | 'taunt_turn' | 'low_hp' | 'ringout_scream' | 'ko' | 'victory'
  | 'crate_grab' | 'new_weapon';

/** Événements « animateur » (répliques de commentaire, ton stade). `weigh_in` et `weapon_reveal` sont les
 *  deux seuls moments propres à une arme, vocalisés par Gemini (src/ia/commentary.ts) plutôt que piochés
 *  dans le manifeste de barks pré-générés (décision d'Adem, plan/lots/LVOX-une-seule-voix.md, point 2). */
export type AnnouncerBarkEvent =
  | 'match_intro' | 'weigh_in' | 'weapon_reveal' | 'hit' | 'crit' | 'perfect' | 'feint' | 'ringout' | 'ko'
  | 'sudden_death' | 'crate_drop' | 'comeback' | 'victory';

export type BarkEvent = FighterBarkEvent | AnnouncerBarkEvent;

interface ManifestEntry { file: string; text: string }
type Manifest = Partial<Record<BarkRole, Partial<Record<string, ManifestEntry[]>>>>;

const MANIFEST_URL = '/assets/voices/manifest.json';
const VOICES_BASE = '/assets/voices/';

/** modèle KayKit → rôle de voix (plan/lots/LBK-banque-voix.md).
 *  'custom' (perso photo en direct, lot LP, sans glbUrl) n'a pas de modèle de base mémorisé dans FighterDef :
 *  on retombe sur 'knight', par symétrie avec src/scene/fighters/loader.ts qui fait le même choix pour le
 *  corps 3D par défaut d'un perso 'custom' sans glbUrl. Approximation documentée ici et dans SUIVI.md. */
const MODEL_TO_ROLE: Record<ModelId, BarkRole> = {
  barbarian: 'barbarian',
  skeleton_warrior: 'barbarian',
  knight: 'knight',
  custom: 'knight',
  mage: 'mage',
  skeleton_mage: 'mage',
  rogue_hooded: 'rogue',
};

/** Priorité de la file (plus grand = joué en premier / interrompt une réplique moins prioritaire).
 *  Les grognements d'effort sont sacrifiables. */
const PRIORITY: Record<BarkEvent, number> = {
  // combattants
  ko: 100,
  victory: 95,
  ringout_scream: 90,
  crit_taken: 75,
  parry_perfect: 60,
  parry_good: 55,
  hit_heavy: 50,
  hit_light: 40,
  low_hp: 45,
  new_weapon: 35,
  crate_grab: 35,
  dodge: 30,
  whiff: 25,
  taunt_turn: 20,
  throw_effort: 10,
  jump_effort: 5,
  // animateur
  match_intro: 96,
  weigh_in: 70,
  weapon_reveal: 72,
  crit: 80,
  perfect: 65,
  feint: 28,
  ringout: 92,
  sudden_death: 85,
  crate_drop: 38,
  comeback: 82,
  hit: 45,
};

/** Une fois qu'une de ces répliques d'animateur a démarré, l'animateur laisse passer un cooldown de 4 à 6 s
 *  avant de recommencer à commenter — sinon il parlerait à CHAQUE coup, ce qui redonne l'impression de deux
 *  voix qui se marchent dessus même une fois la file unifiée. Les moments structurels (intro, pesée,
 *  révélation d'arme, sortie de ring, KO, victoire, mort subite, caisse) restent toujours annoncés : ce sont
 *  des jalons rares, pas du bavardage réactif. */
const THROTTLED_ANNOUNCER_EVENTS: ReadonlySet<AnnouncerBarkEvent> = new Set(['hit', 'crit', 'perfect', 'feint', 'comeback']);
const ANNOUNCER_COOLDOWN_MIN_MS = 4000;
const ANNOUNCER_COOLDOWN_MAX_MS = 6000;

/** Marge de priorité nécessaire pour couper (fondu 60 ms) la réplique en cours plutôt que d'attendre. */
const INTERRUPT_MARGIN = 20;
const CUT_FADE_S = 0.06;

/** Une réplique en attente depuis plus de MAX_QUEUE_DELAY_MS est jetée plutôt que jouée hors-contexte. */
const MAX_QUEUE_DELAY_MS = 1800;
/** Longueur max de la file : au-delà, on jette les priorités les plus basses (évite l'empilement). */
const MAX_QUEUE_LEN = 6;

/** Une entrée jouable : soit un fichier du manifeste (résolu en URL), soit une URL fournie directement
 *  (ligne Gemini synthétisée à la volée par src/ia/commentary.ts, voix clonée du lot LW2, ou relayée
 *  depuis `commentary:line`). */
interface PlayableEntry { text: string; url: string }

interface QueuedBark {
  role: BarkRole;
  isAnnouncer: boolean;
  player?: PlayerId;
  event: BarkEvent;
  entry: PlayableEntry;
  priority: number;
  enqueuedAt: number;
}

// ---------------------------------------------------------------------------
// Lot LW2 (clonage de voix Gradium, en parallèle) : un joueur peut avoir sa propre banque de sons pour
// certains BarkEvent (URLs déjà prêtes, Gradium voix clonée). `setVoiceOverride` est le point d'entrée
// public ; l'intégration dans la lecture se fait dans `BarkPlayer.pickEntry` (voir plus bas : priorité à
// la voix clonée du joueur concerné quand elle existe pour cet événement, sinon le manifeste habituel).
// ---------------------------------------------------------------------------
const voiceOverrides = new Map<PlayerId, Partial<Record<BarkEvent, string[]>>>();

export function setVoiceOverride(player: PlayerId, bank: Partial<Record<BarkEvent, string[]>> | null): void {
  if (bank) voiceOverrides.set(player, bank);
  else voiceOverrides.delete(player);
}

// ---------------------------------------------------------------------------
// Chaîne « stade » (Web Audio) : voir plan/lots/LBK-banque-voix.md pour les valeurs exactes.
// ---------------------------------------------------------------------------
interface VoiceChain { input: AudioNode; playbackRate: number }

function makeShaperCurve(amount: number): Float32Array<ArrayBuffer> {
  // Saturation douce en tanh(k*x)/tanh(k) pour rester normalisée à ±1.
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = amount;
  const norm = Math.tanh(k) || 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

function buildVoiceChain(ctx: AudioContext, destination: AudioNode, withEcho: boolean): VoiceChain {
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 120;

  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 3200;
  peak.Q.value = 0.9;
  peak.gain.value = 6;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeShaperCurve(1.6); // saturation « légère »
  shaper.oversample = '2x';

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  const makeupGain = ctx.createGain();
  makeupGain.gain.value = 1.35;

  highpass.connect(peak).connect(shaper).connect(compressor).connect(makeupGain);

  if (!withEcho) {
    makeupGain.connect(destination);
    return { input: highpass, playbackRate: 1.05 };
  }

  // Écho : délai 110 ms, retour 0.22, mélange 0.25 (dry + wet).
  const dry = ctx.createGain();
  dry.gain.value = 1 - 0.25;
  const wetIn = ctx.createGain();
  wetIn.gain.value = 0.25;
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.11;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.22;

  makeupGain.connect(dry).connect(destination);
  makeupGain.connect(wetIn).connect(delay);
  delay.connect(feedback).connect(delay); // boucle de retour
  delay.connect(destination);

  return { input: highpass, playbackRate: 1.1 };
}

// ---------------------------------------------------------------------------
// Lecteur.
// ---------------------------------------------------------------------------
class BarkPlayer {
  private readonly engine: AudioEngine;
  private readonly music: MusicDirector;
  private readonly bus: Bus;
  private manifest: Manifest = {};
  private ready = false;
  /** `${role}:${event}` -> jusqu'aux 2 derniers index joués (jamais deux fois la même réplique parmi eux). */
  private readonly recentIndices = new Map<string, number[]>();
  private readonly queue: QueuedBark[] = [];
  private playing = false;
  private fighterChain: VoiceChain | null = null;
  private announcerChain: VoiceChain | null = null;
  private readonly bufferCache = new Map<string, Promise<AudioBuffer>>();
  private announcerCooldownUntil = 0;
  // Réplique en cours : de quoi la couper en fondu si un événement plus prioritaire arrive.
  private currentPriority = -1;
  private currentFadeGain: GainNode | null = null;
  private currentStop: (() => void) | null = null;

  constructor(engine: AudioEngine, music: MusicDirector, bus: Bus) {
    this.engine = engine;
    this.music = music;
    this.bus = bus;
  }

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = (await res.json()) as Manifest;
      this.ready = true;
    } catch (err) {
      // Filet de sécurité (voir tools/voices/LISEZMOI.md) : pas de manifeste → aucun bark pré-généré joué,
      // le jeu continue normalement (les lignes Gemini de weigh-in / révélation d'arme restent possibles).
      console.warn('[barks] manifeste introuvable, barks pré-générés désactivés :', err);
      this.ready = false;
    }
  }

  private ensureChains(): void {
    const ctx = this.engine.ctx;
    const dest = this.engine.voiceBus;
    if (!ctx || !dest) return;
    if (!this.fighterChain) this.fighterChain = buildVoiceChain(ctx, dest, false);
    if (!this.announcerChain) this.announcerChain = buildVoiceChain(ctx, dest, true);
  }

  /** Voix clonée (lot LW2) prioritaire sur le manifeste habituel si le joueur concerné en a une pour cet
   *  événement. Le sous-titre reprend le texte du manifeste standard quand il existe (même réplique, juste
   *  une autre voix) ; à défaut il reste vide plutôt que d'inventer un texte. */
  private overrideEntry(role: BarkRole, event: BarkEvent, player: PlayerId | undefined): PlayableEntry | null {
    if (player === undefined) return null;
    const list = voiceOverrides.get(player)?.[event];
    if (!list || list.length === 0) return null;
    const url = list[Math.floor(Math.random() * list.length)];
    const fallbackText = this.manifest[role]?.[event]?.[0]?.text ?? '';
    return { text: fallbackText, url };
  }

  private pickEntry(role: BarkRole, event: BarkEvent, player?: PlayerId): PlayableEntry | null {
    const override = this.overrideEntry(role, event, player);
    if (override) return override;

    const list = this.manifest[role]?.[event];
    if (!list || list.length === 0) return null;
    if (list.length === 1) return { text: list[0].text, url: `${VOICES_BASE}${list[0].file}` };
    const key = `${role}:${event}`;
    const recent = this.recentIndices.get(key) ?? [];
    let idx = Math.floor(Math.random() * list.length);
    let guard = 0;
    // Jamais l'une des 2 dernières répliques jouées pour ce couple rôle/événement (si la banque n'a que
    // 2 variantes, le garde-fou évite une boucle infinie : on accepte alors la moins-pire trouvée).
    while (recent.includes(idx) && guard++ < 20) idx = Math.floor(Math.random() * list.length);
    const nextRecent = [...recent, idx];
    if (nextRecent.length > 2) nextRecent.shift();
    this.recentIndices.set(key, nextRecent);
    return { text: list[idx].text, url: `${VOICES_BASE}${list[idx].file}` };
  }

  private shouldThrottle(isAnnouncer: boolean, event: BarkEvent): boolean {
    if (!isAnnouncer) return false;
    if (!THROTTLED_ANNOUNCER_EVENTS.has(event as AnnouncerBarkEvent)) return false;
    return performance.now() < this.announcerCooldownUntil;
  }

  private enqueue(item: QueuedBark): void {
    // Coupe la réplique en cours (fondu 60 ms) si celle qui arrive est nettement plus prioritaire — sinon on
    // ne coupe jamais (la réplique en cours va au bout), on choisit juste la suivante par priorité.
    if (this.playing && item.priority >= this.currentPriority + INTERRUPT_MARGIN) {
      this.cutCurrent();
    }
    this.queue.push(item);
    if (this.queue.length > MAX_QUEUE_LEN) {
      this.queue.sort((a, b) => b.priority - a.priority);
      this.queue.length = MAX_QUEUE_LEN;
    }
    this.pump();
  }

  /** Point d'entrée public : joue (ou met en file) un bark pré-généré (ou une voix clonée LW2) d'un rôle
   *  pour un événement donné. `opts.player` sert à retrouver une éventuelle voix clonée (lot LW2) et à
   *  renseigner `speaker` sur `voice:line`. */
  play(role: BarkRole, event: BarkEvent, opts?: { isAnnouncer?: boolean; player?: PlayerId }): void {
    // Une voix clonée (lot LW2) peut être prête avant le manifeste (ou sans lui) : on ne bloque donc que le
    // chemin manifeste habituel dans pickEntry/overrideEntry, jamais `play()` dans son ensemble — sauf que
    // sans manifeste ET sans override, il n'y a de toute façon rien à jouer (pickEntry renverra null).
    if (!this.ready && voiceOverrides.size === 0) return;
    const isAnnouncer = opts?.isAnnouncer ?? role === 'announcer';
    if (this.shouldThrottle(isAnnouncer, event)) return;
    const entry = this.pickEntry(role, event, opts?.player);
    if (!entry) return; // pas de manifeste ET pas de voix clonée pour ce couple rôle/événement : silence.
    const priority = PRIORITY[event] ?? 30;
    this.enqueue({ role, isAnnouncer, player: opts?.player, event, entry, priority, enqueuedAt: performance.now() });
  }

  /** Ligne de l'animateur synthétisée ailleurs (Gemini TTS, src/ia/commentary.ts, ou relayée depuis
   *  `commentary:line`) : pas de pioche dans le manifeste, le texte/audio est déjà prêt. `audioUrl` peut être
   *  absent (TTS indisponible) : la ligne « joue » alors en silence, tenue à l'écran par le sous-titre. */
  playCustom(text: string, audioUrl: string | undefined, event: AnnouncerBarkEvent, priorityOverride?: number): void {
    if (!text) return;
    if (this.shouldThrottle(true, event)) return;
    const priority = priorityOverride ?? PRIORITY[event] ?? 40;
    this.enqueue({
      role: 'announcer',
      isAnnouncer: true,
      event,
      entry: { text, url: audioUrl ?? '' },
      priority,
      enqueuedAt: performance.now(),
    });
  }

  private pickNext(): QueuedBark | null {
    if (this.queue.length === 0) return null;
    let bestIndex = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority > this.queue[bestIndex].priority) bestIndex = i;
    }
    return this.queue.splice(bestIndex, 1)[0];
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.engine.ctx!;
    let p = this.bufferCache.get(url);
    if (!p) {
      // fetch() marche aussi bien sur une URL /assets/... que sur un blob: (lignes Gemini synthétisées à la
      // volée, ou voix clonée du lot LW2) : pas besoin d'un chemin séparé pour les Blob URLs.
      p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf));
      this.bufferCache.set(url, p);
    }
    return p;
  }

  private cutCurrent(): void {
    const ctx = this.engine.ctx;
    const g = this.currentFadeGain;
    const stop = this.currentStop;
    this.currentFadeGain = null;
    this.currentStop = null;
    this.currentPriority = -1;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
      g.gain.linearRampToValueAtTime(0.0001, now + CUT_FADE_S);
    } catch {
      /* nœud déjà déconnecté : rien à faire */
    }
    window.setTimeout(() => { try { stop?.(); } catch { /* déjà arrêté */ } }, CUT_FADE_S * 1000 + 15);
  }

  private pump(): void {
    if (this.playing) return;
    // IMPORTANT : on ne saute jamais au milieu d'une réplique déjà lancée par un simple changement de
    // priorité — une réplique plus urgente COUPE la réplique en cours (voir enqueue/cutCurrent), elle ne
    // double pas dessus. Ici on choisit juste la prochaine réplique en attente une fois la place libre.
    let next = this.pickNext();
    while (next && performance.now() - next.enqueuedAt > MAX_QUEUE_DELAY_MS) {
      next = this.pickNext();
    }
    if (!next) return;
    void this.playNow(next);
  }

  private async playNow(item: QueuedBark): Promise<void> {
    const ctx = this.engine.ctx;
    if (!ctx || this.engine.isMuted) { this.playing = false; this.pump(); return; }
    this.playing = true;
    this.ensureChains();
    this.music.duck(true);
    // Sous-titre = voix effectivement entendue (lot LVOX, point 4) : émis au moment où la lecture démarre
    // vraiment, jamais avant (sinon le texte affiché pourrait ne pas correspondre à ce qui sort des enceintes).
    this.bus.emit('voice:line', { text: item.entry.text, speaker: item.isAnnouncer ? 'announcer' : (item.player ?? 0) });
    try {
      if (!item.entry.url) {
        // Pas d'audio (TTS indisponible) : on tient quand même la place, au prorata de la longueur du texte,
        // pour laisser le sous-titre le temps d'être lu avant d'enchaîner sur la réplique suivante.
        const words = item.entry.text.trim().split(/\s+/).filter(Boolean).length;
        const holdMs = Math.max(900, words * 260);
        await new Promise<void>((resolve) => window.setTimeout(resolve, holdMs));
        return;
      }
      const chain = item.isAnnouncer ? this.announcerChain : this.fighterChain;
      if (!chain) throw new Error('chaîne audio indisponible');
      const buffer = await this.loadBuffer(item.entry.url);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = chain.playbackRate;
      const fadeGain = ctx.createGain();
      source.connect(fadeGain).connect(chain.input);
      this.currentFadeGain = fadeGain;
      this.currentPriority = item.priority;
      this.currentStop = () => source.stop();
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (err) {
      console.warn('[barks] lecture impossible', item.role, item.event, err);
    } finally {
      this.currentFadeGain = null;
      this.currentStop = null;
      this.currentPriority = -1;
      this.playing = false;
      if (item.isAnnouncer && THROTTLED_ANNOUNCER_EVENTS.has(item.event as AnnouncerBarkEvent)) {
        this.announcerCooldownUntil = performance.now() + ANNOUNCER_COOLDOWN_MIN_MS + Math.random() * (ANNOUNCER_COOLDOWN_MAX_MS - ANNOUNCER_COOLDOWN_MIN_MS);
      }
      this.music.duck(false);
      this.pump();
    }
  }
}

// ---------------------------------------------------------------------------
// Abonnements au bus (plan/lots/LBK-banque-voix.md + plan/lots/LVOX-une-seule-voix.md).
// ---------------------------------------------------------------------------
function roleFor(ctx: Ctx, player: number): BarkRole {
  const fighter = ctx.state.players[player as 0 | 1]?.fighter;
  const model = fighter?.model ?? 'knight';
  return MODEL_TO_ROLE[model] ?? 'knight';
}

function weaponEffortEvent(category: Category): FighterBarkEvent {
  return category === 'shield' ? 'whiff' : 'throw_effort';
}

/** Bark du perso PUIS animateur ~250 ms après (lot LVOX, point 1) : jamais les deux en même temps, et le
 *  perso a toujours la priorité de la parole sur l'impact avant que l'animateur ne renchérisse. */
function playPair(ctx: Ctx, player: PlayerId, fighterEvent: FighterBarkEvent, announcerEvent: AnnouncerBarkEvent): void {
  barkPlayer.play(roleFor(ctx, player), fighterEvent, { player });
  ctx.loop.later(0.25, () => barkPlayer.play('announcer', announcerEvent, { isAnnouncer: true }));
}

function installBusHandlers(bus: Bus, ctx: Ctx): () => void {
  const tauntTurnCounter = new Map<number, number>();

  const offs = [
    bus.on('match:start', () => {
      // Animateur seulement (pas de combattant identifié à cet instant). La pesée par arme (weigh_in,
      // répliques Gemini) est programmée séparément par src/ia/commentary.ts (prepareCommentary).
      barkPlayer.play('announcer', 'match_intro', { isAnnouncer: true });
    }),

    bus.on('hit', ({ target, crit }) => {
      playPair(ctx, target, crit ? 'crit_taken' : 'hit_light', crit ? 'crit' : 'hit');
    }),

    bus.on('parry:result', ({ player: p, grade }) => {
      if (grade === 'miss') return;
      barkPlayer.play(roleFor(ctx, p), grade === 'perfect' ? 'parry_perfect' : 'parry_good', { player: p });
      if (grade === 'perfect') ctx.loop.later(0.25, () => barkPlayer.play('announcer', 'perfect', { isAnnouncer: true }));
    }),

    bus.on('fire', ({ player: p, weapon }) => {
      barkPlayer.play(roleFor(ctx, p), weaponEffortEvent(weapon.category), { player: p });
    }),

    bus.on('move:jump', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'jump_effort', { player: p });
    }),

    bus.on('turn:start', ({ active }) => {
      // Au plus 1 tour sur 2 par joueur : compteur pair/impair (déterministe, testable par les agents du
      // harnais), plutôt qu'un tirage aléatoire qui rendrait le comportement dur à vérifier par script.
      const count = (tauntTurnCounter.get(active) ?? 0) + 1;
      tauntTurnCounter.set(active, count);
      if (count % 2 === 1) barkPlayer.play(roleFor(ctx, active), 'taunt_turn', { player: active });
    }),

    bus.on('ringout', ({ player: p }) => {
      playPair(ctx, p, 'ringout_scream', 'ringout');
    }),

    bus.on('ko', ({ player: p }) => {
      playPair(ctx, p, 'ko', 'ko');
    }),

    bus.on('match:end', ({ winner }) => {
      playPair(ctx, winner, 'victory', 'victory');
    }),

    bus.on('crate:grab', ({ player: p }) => {
      playPair(ctx, p, 'crate_grab', 'crate_drop');
    }),

    bus.on('scan:result', ({ player: p }) => {
      // La révélation par l'animateur (Gemini, weapon_reveal) est gérée par src/ia/commentary.ts
      // (sayScanReveal) : ici on ne joue que la réaction du combattant.
      barkPlayer.play(roleFor(ctx, p), 'new_weapon', { player: p });
    }),
  ];

  return () => { for (const off of offs) off(); };
}

let barkPlayer: BarkPlayer;

/** Installe le lecteur de voix « barks » : à appeler depuis src/audio/index.ts après installCommentary. */
export function installBarks(ctx: Ctx, engine: AudioEngine, music: MusicDirector): void {
  barkPlayer = new BarkPlayer(engine, music, ctx.bus);
  void barkPlayer.loadManifest();
  installBusHandlers(ctx.bus, ctx);
}

/** Pour src/gameplay/ai/taunt-bubble.ts (lot LX) : fait crier au perso IA un de ses barks pré-générés
 *  (le texte Gemini de la bulle reste affiché visuellement, seule la source du SON change — lot LVOX, point 5). */
export function playBark(ctx: Ctx, player: PlayerId, event: FighterBarkEvent): void {
  if (!barkPlayer) return;
  barkPlayer.play(roleFor(ctx, player), event, { player });
}

/** Pour src/ia/commentary.ts (pesée par arme + révélation d'arme scannée en match) : une ligne Gemini déjà
 *  écrite et déjà vocalisée (api/tts.ts, Gemini Fenrir) rejoint la file unique de l'animateur. */
export function playAnnouncerCustomLine(text: string, audioUrl: string | undefined, event: AnnouncerBarkEvent): void {
  if (!barkPlayer) return;
  barkPlayer.playCustom(text, audioUrl, event);
}

/** Relais pour src/audio/commentary.ts (compat `commentary:line`, voir ce fichier) : une ligne externe avec
 *  sa propre priorité numérique, sans clé d'événement précise. Rangée sous 'weigh_in' (hors du cooldown
 *  4-6 s : cette voie ne sert plus qu'à des émetteurs hors périmètre qu'on ne peut pas retrouver ici, pas à
 *  du bavardage de combat répétitif). */
export function playAnnouncerRawLine(text: string, audioUrl: string | undefined, priority: number): void {
  if (!barkPlayer) return;
  barkPlayer.playCustom(text, audioUrl, 'weigh_in', priority);
}
