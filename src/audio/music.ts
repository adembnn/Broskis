// Lot LMUSIQUE : musique de fond en fichiers (public/assets/music/, crédits dans CREDITS.md).
// Trois pistes en boucle : « menu » sur les écrans de menu et la fin, « combat » dès le GO! (phase
// `fight`), « tendu » en mort subite. Passage de l'une à l'autre en fondu enchaîné (les deux jouent en
// même temps pendant `fondu` secondes, l'une monte, l'autre descend). Le bus musique reste bas et
// baisse encore (« ducking ») pendant chaque réplique de l'animateur ou d'un combattant.
// Les boucles sont sans trou : on lit un AudioBuffer décodé avec `loop = true` (pas de <audio>).
import { musique } from '../art/tokens.js';
import type { Bus } from '../core/bus';
import type { GameState, Phase } from '../core/types';
import type { AudioEngine } from './engine';

export type TrackId = keyof typeof musique.pistes;

const POLL_MS = 100;
/** Phases où la musique de menu joue ; `countdown` et `ko` gardent la piste en cours. */
const MENU_PHASES: ReadonlySet<Phase> = new Set<Phase>(['title', 'fighter-select', 'arsenal', 'reveal', 'map-select', 'end']);
const KEEP_PHASES: ReadonlySet<Phase> = new Set<Phase>(['countdown', 'ko']);

interface Playing { id: TrackId; source: AudioBufferSourceNode; gain: GainNode }

/** État lisible par script (tests) : `window.__musique`. */
export interface MusicDebug { track: TrackId | null; wanted: TrackId | null; busGain: number; ducked: boolean; loaded: TrackId[] }
declare global { interface Window { __musique?: MusicDebug } }

export class MusicDirector {
  private readonly engine: AudioEngine;
  private readonly getState: () => GameState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly raw = new Map<TrackId, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<TrackId, AudioBuffer>();
  private readonly decoding = new Set<TrackId>();
  private current: Playing | null = null;
  private wanted: TrackId | null = null;
  private ducked = false;

  constructor(engine: AudioEngine, getState: () => GameState) {
    this.engine = engine;
    this.getState = getState;
    // Téléchargement tout de suite (avant le premier clic) : le décodage attendra le contexte audio.
    for (const id of Object.keys(musique.pistes) as TrackId[]) {
      this.raw.set(id, fetch(musique.pistes[id].url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null));
    }
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias
    window.__musique = {
      get track() { return self.current?.id ?? null; },
      get wanted() { return self.wanted; },
      get busGain() { return self.engine.musicBus?.gain.value ?? 0; },
      get ducked() { return self.ducked; },
      get loaded() { return [...self.buffers.keys()]; },
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }

  stop(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Baisse (ou remonte) la musique pendant qu'une voix parle (appelé par barks.ts). */
  duck(active: boolean): void {
    this.ducked = active;
    const bus = this.engine.musicBus;
    const ctx = this.engine.ctx;
    if (!bus || !ctx) return;
    const target = musique.volume * (active ? musique.ducking : 1);
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(target, ctx.currentTime, active ? musique.baisse : musique.remontee);
  }

  private pick(state: GameState): TrackId | null {
    if (MENU_PHASES.has(state.phase)) return 'menu';
    if (KEEP_PHASES.has(state.phase)) return this.wanted ?? 'menu';
    return state.suddenDeath ? 'tendu' : 'combat';
  }

  private tick(): void {
    const ctx = this.engine.ctx;
    if (!ctx) return; // pas encore de geste utilisateur : rien ne peut jouer
    this.wanted = this.pick(this.getState());
    const id = this.wanted;
    // Décodage de toutes les pistes dès le premier geste (la piste voulue d'abord) : au GO!, la piste
    // de combat est déjà prête et le fondu part sans attendre.
    this.decode(id);
    for (const other of Object.keys(musique.pistes) as TrackId[]) this.decode(other);
    if (!id || this.current?.id === id) return;
    const buffer = this.buffers.get(id);
    if (buffer) this.crossfadeTo(id, buffer);
  }

  private decode(id: TrackId | null): void {
    const ctx = this.engine.ctx;
    if (!ctx || !id || this.buffers.has(id) || this.decoding.has(id)) return;
    this.decoding.add(id);
    void this.raw.get(id)!.then(async (data) => {
      if (!data) { console.warn('[musique] piste introuvable', id); return; }
      // decodeAudioData détache le tampon : on en décode une copie pour pouvoir réessayer si besoin.
      this.buffers.set(id, await ctx.decodeAudioData(data.slice(0)));
    }).catch((err) => console.warn('[musique] décodage impossible', id, err)); // un échec reste définitif : pas de relance en boucle
  }

  private crossfadeTo(id: TrackId, buffer: AudioBuffer): void {
    const ctx = this.engine.ctx!;
    const bus = this.engine.musicBus!;
    const t = ctx.currentTime;
    const fade = musique.fondu;

    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.source.stop(t + fade + 0.05);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(musique.pistes[id].niveau, t + fade);
    source.connect(gain).connect(bus);
    source.start(t);
    this.current = { id, source, gain };
  }
}

/** `bus` gardé en paramètre pour que l'appel reste uniforme avec `installSfx`/`installCommentary`. */
export function installMusic(_bus: Bus, engine: AudioEngine, getState: () => GameState): MusicDirector {
  const director = new MusicDirector(engine, getState);
  director.start();
  return director;
}
