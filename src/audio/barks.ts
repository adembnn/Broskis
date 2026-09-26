// Lot LBK · Banque de voix pré-générées ("barks") : lecteur qui pioche dans public/assets/voices/manifest.json
// (généré par tools/voices/generate-barks.mjs) et abonne le bus aux événements qui doivent crier une réplique.
// Ne dépend d'aucun fichier réseau au chargement du module : le manifeste est chargé en tâche de fond, et
// tout est no-op tant qu'il n'est pas prêt (le jeu doit tourner même si la banque de voix est absente/vide —
// voir tools/voices/LISEZMOI.md, "stratégie de secours").
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

/** Événements « animateur » (répliques de commentaire, ton stade). */
export type AnnouncerBarkEvent =
  | 'match_intro' | 'weigh_in' | 'hit' | 'crit' | 'perfect' | 'feint' | 'ringout' | 'ko'
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

/** Priorité de la file (plus grand = joué en premier). Les grognements d'effort sont sacrifiables. */
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
  crit: 80,
  perfect: 65,
  feint: 28,
  ringout: 92,
  sudden_death: 85,
  crate_drop: 38,
  comeback: 82,
  hit: 45,
};

/** Une réplique en attente depuis plus de MAX_QUEUE_DELAY_MS est jetée plutôt que jouée hors-contexte. */
const MAX_QUEUE_DELAY_MS = 1800;
/** Longueur max de la file : au-delà, on jette les priorités les plus basses (évite l'empilement). */
const MAX_QUEUE_LEN = 6;

interface QueuedBark {
  role: BarkRole;
  isAnnouncer: boolean;
  entry: ManifestEntry;
  priority: number;
  enqueuedAt: number;
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
  private manifest: Manifest = {};
  private ready = false;
  private readonly lastIndex = new Map<string, number>(); // `${role}:${event}` -> dernier index joué
  private readonly queue: QueuedBark[] = [];
  private playing = false;
  private fighterChain: VoiceChain | null = null;
  private announcerChain: VoiceChain | null = null;
  private readonly bufferCache = new Map<string, Promise<AudioBuffer>>();

  constructor(engine: AudioEngine, music: MusicDirector) {
    this.engine = engine;
    this.music = music;
  }

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = (await res.json()) as Manifest;
      this.ready = true;
    } catch (err) {
      // Filet de sécurité (voir tools/voices/LISEZMOI.md) : pas de manifeste → aucune voix jouée,
      // le jeu continue normalement avec les bruitages synthétiques du lot LV.
      console.warn('[barks] manifeste introuvable, voix désactivées :', err);
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

  private pickEntry(role: BarkRole, event: string): ManifestEntry | null {
    const list = this.manifest[role]?.[event];
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    const key = `${role}:${event}`;
    const last = this.lastIndex.get(key);
    let idx = Math.floor(Math.random() * list.length);
    if (last != null && list.length > 1) {
      while (idx === last) idx = Math.floor(Math.random() * list.length);
    }
    this.lastIndex.set(key, idx);
    return list[idx];
  }

  /** Point d'entrée public : joue (ou met en file) une réplique d'un rôle pour un événement donné. */
  play(role: BarkRole, event: BarkEvent, opts?: { isAnnouncer?: boolean }): void {
    if (!this.ready) return;
    const entry = this.pickEntry(role, event);
    if (!entry) return;
    const isAnnouncer = opts?.isAnnouncer ?? role === 'announcer';
    const priority = PRIORITY[event] ?? 30;

    this.queue.push({ role, isAnnouncer, entry, priority, enqueuedAt: performance.now() });
    // Ne garde que les MAX_QUEUE_LEN meilleures priorités pour éviter l'empilement pendant un combo rapide.
    if (this.queue.length > MAX_QUEUE_LEN) {
      this.queue.sort((a, b) => b.priority - a.priority);
      this.queue.length = MAX_QUEUE_LEN;
    }
    this.pump();
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
      p = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf));
      this.bufferCache.set(url, p);
    }
    return p;
  }

  private pump(): void {
    if (this.playing) return;
    // IMPORTANT : on ne coupe jamais une réplique en cours de lecture (donc jamais l'animateur) ; on ne fait
    // que choisir la prochaine réplique en attente une fois la précédente terminée.
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
    try {
      const url = `${VOICES_BASE}${item.entry.file}`;
      const buffer = await this.loadBuffer(url);
      const chain = item.isAnnouncer ? this.announcerChain : this.fighterChain;
      if (!chain) throw new Error('chaîne audio indisponible');
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = chain.playbackRate;
      source.connect(chain.input);
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      });
    } catch (err) {
      console.warn('[barks] lecture impossible', item.role, item.entry.file, err);
    } finally {
      this.playing = false;
      this.music.duck(false);
      this.pump();
    }
  }
}

// ---------------------------------------------------------------------------
// Abonnements au bus (plan/lots/LBK-banque-voix.md).
// ---------------------------------------------------------------------------
function roleFor(ctx: Ctx, player: number): BarkRole {
  const fighter = ctx.state.players[player as 0 | 1]?.fighter;
  const model = fighter?.model ?? 'knight';
  return MODEL_TO_ROLE[model] ?? 'knight';
}

function weaponEffortEvent(category: Category): FighterBarkEvent {
  return category === 'shield' ? 'whiff' : 'throw_effort';
}

function installBusHandlers(bus: Bus, ctx: Ctx): () => void {
  const tauntTurnCounter = new Map<number, number>();

  const offs = [
    bus.on('match:start', () => {
      // Animateur seulement (pas de combattant identifié à cet instant).
      barkPlayer.play('announcer', 'match_intro', { isAnnouncer: true });
      ctx.loop.later(1.2, () => barkPlayer.play('announcer', 'weigh_in', { isAnnouncer: true }));
    }),

    bus.on('hit', ({ target, crit }) => {
      const victimRole = roleFor(ctx, target);
      barkPlayer.play(victimRole, crit ? 'crit_taken' : 'hit_light');
      barkPlayer.play('announcer', crit ? 'crit' : 'hit', { isAnnouncer: true });
    }),

    bus.on('parry:result', ({ player: p, grade }) => {
      if (grade === 'miss') return;
      const role = roleFor(ctx, p);
      barkPlayer.play(role, grade === 'perfect' ? 'parry_perfect' : 'parry_good');
      if (grade === 'perfect') barkPlayer.play('announcer', 'perfect', { isAnnouncer: true });
    }),

    bus.on('fire', ({ player: p, weapon }) => {
      const role = roleFor(ctx, p);
      barkPlayer.play(role, weaponEffortEvent(weapon.category));
    }),

    bus.on('move:jump', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'jump_effort');
    }),

    bus.on('turn:start', ({ active }) => {
      // Au plus 1 tour sur 2 par joueur : compteur pair/impair (déterministe, testable par les agents du
      // harnais), plutôt qu'un tirage aléatoire qui rendrait le comportement dur à vérifier par script.
      const count = (tauntTurnCounter.get(active) ?? 0) + 1;
      tauntTurnCounter.set(active, count);
      if (count % 2 === 1) barkPlayer.play(roleFor(ctx, active), 'taunt_turn');
    }),

    bus.on('ringout', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'ringout_scream');
      barkPlayer.play('announcer', 'ringout', { isAnnouncer: true });
    }),

    bus.on('ko', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'ko');
      barkPlayer.play('announcer', 'ko', { isAnnouncer: true });
    }),

    bus.on('match:end', ({ winner }) => {
      barkPlayer.play(roleFor(ctx, winner), 'victory');
      barkPlayer.play('announcer', 'victory', { isAnnouncer: true });
    }),

    bus.on('crate:grab', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'crate_grab');
      barkPlayer.play('announcer', 'crate_drop', { isAnnouncer: true });
    }),

    bus.on('scan:result', ({ player: p }) => {
      barkPlayer.play(roleFor(ctx, p), 'new_weapon');
    }),
  ];

  return () => { for (const off of offs) off(); };
}

let barkPlayer: BarkPlayer;

/** Installe le lecteur de voix « barks » : à appeler depuis src/audio/index.ts après installCommentary. */
export function installBarks(ctx: Ctx, engine: AudioEngine, music: MusicDirector): void {
  barkPlayer = new BarkPlayer(engine, music);
  void barkPlayer.loadManifest();
  installBusHandlers(ctx.bus, ctx);
}

// -- Lot LW2 : Override voix clonée --
const voiceOverrides = new Map<PlayerId, Partial<Record<BarkEvent, string[]>>>();

export function setVoiceOverride(player: PlayerId, bank: Partial<Record<BarkEvent, string[]>> | null): void {
  if (bank) voiceOverrides.set(player, bank);
  else voiceOverrides.delete(player);
}

// Patch BarkPlayer.play temporaire si Titouan n'a pas encore ajouté playBark
const originalPlay = BarkPlayer.prototype.play;
BarkPlayer.prototype.play = function(this: BarkPlayer, role: BarkRole, event: BarkEvent, opts?: { isAnnouncer?: boolean }) {
  if (!opts?.isAnnouncer && window.gameState) {
    // Retrouver le playerId depuis le rôle (approximation)
    const state = window.gameState as any;
    let overrideFound = false;
    for (let p = 0; p < 2; p++) {
      const fighter = state.players[p]?.fighter;
      if (fighter && (MODEL_TO_ROLE[fighter.model as ModelId] ?? 'knight') === role) {
        const override = voiceOverrides.get(p as PlayerId);
        if (override && override[event]) {
          const list = override[event]!;
          const url = list[Math.floor(Math.random() * list.length)];
          this['queue'].push({ role, isAnnouncer: false, entry: { file: url, text: '' }, priority: PRIORITY[event] ?? 30, enqueuedAt: performance.now() });
          this['pump']();
          overrideFound = true;
          break;
        }
      }
    }
    if (overrideFound) return;
  }
  originalPlay.call(this, role, event, opts);
};

// Intercepte loadBuffer pour lire les Blob URLs
const originalLoadBuffer = BarkPlayer.prototype['loadBuffer'];
BarkPlayer.prototype['loadBuffer'] = function(this: BarkPlayer, url: string): Promise<AudioBuffer> {
  if (url.startsWith('blob:')) {
    const ctx = this['engine'].ctx!;
    return fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf));
  }
  return originalLoadBuffer.call(this, url);
};
