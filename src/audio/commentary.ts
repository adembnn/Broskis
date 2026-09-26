// Voix de l'animateur : `commentary:line` ({ text, priority, audioUrl? }).
// - File d'attente triée par priorité (plus grand = plus important, FIFO à priorité égale).
// - Une réplique en retard de plus de 1,5 s (mesuré depuis sa réception) est jetée sans être jouée.
// - Sans `audioUrl` : rien à jouer (les sous-titres sont affichés par l'UI) — on la retire juste de la file.
// - La musique baisse pendant qu'un `audioUrl` joue (voir MusicDirector.duck).
import type { Bus } from '../core/bus';
import type { AudioEngine } from './engine';
import type { MusicDirector } from './music';

const MAX_DELAY_MS = 1500;

interface QueuedLine {
  text: string;
  priority: number;
  audioUrl?: string;
  enqueuedAt: number;
}

export class CommentaryQueue {
  private readonly queue: QueuedLine[] = [];
  private playing = false;
  private currentAudio: HTMLAudioElement | null = null;
  private readonly engine: AudioEngine;
  private readonly music: MusicDirector;

  constructor(engine: AudioEngine, music: MusicDirector) {
    this.engine = engine;
    this.music = music;
  }

  push(line: { text: string; priority: number; audioUrl?: string }): void {
    this.queue.push({ ...line, enqueuedAt: performance.now() });
    this.pump();
  }

  /** Coupe la voix en cours (utilisé par le bouton muet, touche M). */
  silence(): void {
    if (this.currentAudio) { this.currentAudio.pause(); this.currentAudio = null; }
    this.queue.length = 0;
    this.playing = false;
    this.music.duck(false);
  }

  private pickNext(): QueuedLine | null {
    if (this.queue.length === 0) return null;
    let bestIndex = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority > this.queue[bestIndex].priority) bestIndex = i;
    }
    return this.queue.splice(bestIndex, 1)[0];
  }

  private pump(): void {
    if (this.playing) return;
    let next = this.pickNext();
    // Jette les répliques trop en retard plutôt que de les jouer hors-contexte.
    while (next && performance.now() - next.enqueuedAt > MAX_DELAY_MS) {
      next = this.pickNext();
    }
    if (!next) return;

    if (!next.audioUrl) {
      // Rien à jouer : l'UI affiche déjà le sous-titre depuis l'événement `commentary:line` original.
      this.pump();
      return;
    }

    this.playing = true;
    this.music.duck(true);
    const audio = new Audio(next.audioUrl);
    audio.volume = this.engine.isMuted ? 0 : 1;
    this.currentAudio = audio;
    const done = () => {
      if (this.currentAudio === audio) this.currentAudio = null;
      this.playing = false;
      this.music.duck(false);
      this.pump();
    };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    void audio.play().catch(done);
  }

  setMuted(muted: boolean): void {
    if (this.currentAudio) this.currentAudio.volume = muted ? 0 : 1;
  }
}

export function installCommentary(bus: Bus, engine: AudioEngine, music: MusicDirector): CommentaryQueue {
  const queue = new CommentaryQueue(engine, music);
  bus.on('commentary:line', (line) => queue.push(line));
  return queue;
}
