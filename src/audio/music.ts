// Musique de fond : boucle synthétisée simple (basse + arpège), plus entraînante et plus rapide pendant
// la mort subite (state.suddenDeath). Utilise un ordonnanceur « lookahead » classique en Web Audio
// (on programme les notes un peu à l'avance plutôt qu'au moment exact, pour éviter le décalage du timer JS).
import type { Bus } from '../core/bus';
import type { GameState } from '../core/types';
import type { AudioEngine } from './engine';

const SCALE = [220, 246.9, 261.6, 293.7, 329.6, 392, 440]; // la mineure, ambiance de duel cartoon
const BASS_PATTERN = [0, 0, 4, 4];
const ARP_PATTERN = [0, 2, 4, 2, 0, 2, 4, 6];

const LOOKAHEAD_MS = 100;
const SCHEDULE_AHEAD_S = 0.25;

export class MusicDirector {
  private readonly engine: AudioEngine;
  private readonly getState: () => GameState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private stepDur = 0.22; // secondes par pas d'arpège à tension nulle
  private tension = 0; // 0..1, monte pendant la mort subite
  private duckDepth = 0; // 0..1, monté quand l'animateur parle

  constructor(engine: AudioEngine, getState: () => GameState) {
    this.engine = engine;
    this.getState = getState;
  }

  start(): void {
    if (this.timer) return;
    this.nextNoteTime = this.engine.now;
    this.timer = setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Baisse (ou remonte) la musique pendant que l'animateur parle. */
  duck(active: boolean): void {
    this.duckDepth = active ? 0.75 : 0;
    this.applyBusGain();
  }

  private applyBusGain(): void {
    const bus = this.engine.musicBus;
    const ctx = this.engine.ctx;
    if (!bus || !ctx) return;
    const base = 0.35 + this.tension * 0.15;
    const target = base * (1 - this.duckDepth);
    bus.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
  }

  private scheduler(): void {
    if (!this.engine.ctx) return;
    this.tension = this.getState().suddenDeath ? 1 : 0;
    this.applyBusGain();
    while (this.nextNoteTime < this.engine.now + SCHEDULE_AHEAD_S) {
      this.playStep(this.step, this.nextNoteTime);
      const dur = this.stepDur / (1 + this.tension * 0.6); // deux fois plus vite en mort subite
      this.nextNoteTime += dur;
      this.step = (this.step + 1) % ARP_PATTERN.length;
    }
  }

  private playStep(step: number, t: number): void {
    const e = this.engine;
    const bus = e.musicBus;
    if (!bus || !e.ctx) return;
    const delay = Math.max(0, t - e.now);

    // Basse : joue une fois toutes les deux notes d'arpège.
    if (step % 2 === 0) {
      const bassNote = SCALE[BASS_PATTERN[(step / 2) % BASS_PATTERN.length]] / 2;
      e.tone(bassNote, { type: 'triangle', dur: this.stepDur * 1.8, vol: 0.16 + this.tension * 0.06, delay }, bus);
    }

    // Arpège : plus perçant et plus fort quand la tension monte.
    const arpNote = SCALE[ARP_PATTERN[step]] * (this.tension > 0.5 ? 2 : 1);
    e.tone(arpNote, { type: this.tension > 0.5 ? 'sawtooth' : 'triangle', dur: this.stepDur * 0.9, vol: 0.05 + this.tension * 0.05, delay }, bus);

    // Percussion synthétisée (bruit filtré) qui s'ajoute pendant la mort subite pour marquer le tempo.
    if (this.tension > 0.5 && step % 2 === 1) {
      e.noise({ dur: 0.06, vol: 0.12, freq: 2200, q: 2, delay }, bus);
    }
  }
}

/** `bus` n'est pas encore utilisé ici : la tension est relue directement depuis `state.suddenDeath` à
 *  chaque pas du scheduler (voir `scheduler()`). Gardé en paramètre pour que l'appel reste uniforme avec
 *  `installSfx`/`installCommentary` si un événement dédié à la mort subite est ajouté plus tard. */
export function installMusic(_bus: Bus, engine: AudioEngine, getState: () => GameState): MusicDirector {
  const director = new MusicDirector(engine, getState);
  director.start();
  return director;
}
