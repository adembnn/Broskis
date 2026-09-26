// Moteur WebAudio bas niveau : contexte partagé, bus de gains (master → sfx / musique / voix), sons
// synthétisés (aucun fichier à charger). Repris et adapté de reference/bagarre-de-taverne/src/audio.js.
import type { Rng } from '../core/rng';

export type ToneShape = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type NoiseShape = 'lowpass' | 'highpass' | 'bandpass';

export interface ToneOpts {
  type?: ToneShape;
  dur?: number;
  vol?: number;
  /** Multiplicateur de fréquence en fin de note (glissando exponentiel) ; 0 = pas de glissando. */
  slide?: number;
  delay?: number;
}

export interface NoiseOpts {
  dur?: number;
  vol?: number;
  freq?: number;
  q?: number;
  type?: NoiseShape;
  /** Multiplicateur de fréquence du filtre en fin de bruit ; 0 = pas de balayage. */
  sweep?: number;
  delay?: number;
}

/** Moteur audio partagé par sfx / musique / voix. Un seul par partie (créé par `src/audio/index.ts`). */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  voiceBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private started = false;
  private readonly rng: Rng;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /** Idempotent ; à appeler au premier geste utilisateur (les navigateurs bloquent l'audio sinon). */
  start(): void {
    if (this.started) { void this.ctx?.resume(); return; }
    this.started = true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.7;
      this.sfxBus.connect(master);

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.35;
      this.musicBus.connect(master);

      this.voiceBus = ctx.createGain();
      this.voiceBus.gain.value = 1;
      this.voiceBus.connect(master);

      this.master = master;
    } catch {
      this.ctx = null;
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Variation aléatoire de hauteur ±ratio (par défaut ±5 %). */
  detune(freq: number, ratio = 0.05): number {
    return freq * (1 + (this.rng() * 2 - 1) * ratio);
  }

  private noiseBuffer(seconds = 2): AudioBuffer {
    const ctx = this.ctx!;
    if (this.noiseBuf) return this.noiseBuf;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rng() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(freq: number, opts: ToneOpts = {}, bus: GainNode | null = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !bus || this.muted) return;
    const { type = 'sine', dur = 0.3, vol = 0.2, slide = 0, delay = 0 } = opts;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this.env(g, t, 0.01, vol, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(opts: NoiseOpts = {}, bus: GainNode | null = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !bus || this.muted) return;
    const { dur = 0.4, vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', sweep = 0, delay = 0 } = opts;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuffer(2);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.01, vol, dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t, this.rng());
    s.stop(t + dur + 0.05);
  }
}
