// Un bruitage synthétisé par événement du bus (voir plan/lots/LV-audio.md). Chaque son varie de ±5 % en
// hauteur à chaque lecture (AudioEngine.detune) pour éviter l'effet « mitraillette » des sons répétés.
import type { Bus } from '../core/bus';
import type { Category, ParryGrade } from '../core/types';
import type { AudioEngine } from './engine';

const CATEGORY_FREQ: Record<Category, number> = {
  blaster: 900,
  grenade: 300,
  throwable: 500,
  shield: 650,
};

function fireSound(e: AudioEngine, category: Category): void {
  switch (category) {
    case 'blaster':
      e.noise({ dur: 0.14, vol: 0.28, freq: e.detune(CATEGORY_FREQ.blaster), sweep: 1.6, q: 1.4 });
      e.tone(e.detune(220), { type: 'square', dur: 0.1, vol: 0.1, slide: 1.8 });
      break;
    case 'grenade':
      e.tone(e.detune(140), { type: 'sawtooth', dur: 0.35, vol: 0.16, slide: 2.2 });
      e.noise({ dur: 0.3, vol: 0.14, freq: e.detune(CATEGORY_FREQ.grenade), sweep: 3, q: 0.8 });
      break;
    case 'throwable':
      e.noise({ dur: 0.28, vol: 0.22, freq: e.detune(CATEGORY_FREQ.throwable), sweep: 2.5, q: 0.7 });
      e.tone(e.detune(90), { type: 'sine', dur: 0.22, vol: 0.14, slide: 0.6 });
      break;
    case 'shield':
      e.tone(e.detune(CATEGORY_FREQ.shield), { type: 'triangle', dur: 0.4, vol: 0.12, slide: 1.4 });
      e.tone(e.detune(CATEGORY_FREQ.shield * 1.5), { type: 'sine', dur: 0.4, vol: 0.07, slide: 1.4 });
      break;
  }
}

function hitSound(e: AudioEngine, crit: boolean): void {
  const base = crit ? 90 : 140;
  e.noise({ dur: crit ? 0.16 : 0.1, vol: crit ? 0.32 : 0.22, freq: e.detune(crit ? 1200 : 1800), q: 1.5 });
  e.tone(e.detune(base), { type: 'square', dur: crit ? 0.22 : 0.12, vol: crit ? 0.16 : 0.09, slide: crit ? 0.35 : 0.5 });
}

function parrySound(e: AudioEngine, grade: ParryGrade): void {
  switch (grade) {
    case 'perfect':
      [1760, 2640, 3520].forEach((f, i) => e.tone(e.detune(f), { type: 'triangle', dur: 0.35, vol: 0.09 / (i + 1), delay: i * 0.02 }));
      e.noise({ dur: 0.08, vol: 0.15, freq: e.detune(5000), q: 3 });
      break;
    case 'good':
      e.tone(e.detune(880), { type: 'triangle', dur: 0.22, vol: 0.1 });
      e.noise({ dur: 0.08, vol: 0.1, freq: e.detune(2400), q: 2 });
      break;
    case 'miss':
      e.tone(e.detune(160), { type: 'sawtooth', dur: 0.3, vol: 0.1, slide: 0.4 });
      break;
  }
}

function koSound(e: AudioEngine): void {
  [523.3, 392, 293.7, 220].forEach((f, i) => e.tone(e.detune(f), { type: 'triangle', dur: 0.7, vol: 0.12, delay: i * 0.18 }));
}

function ringoutSound(e: AudioEngine): void {
  e.noise({ dur: 0.5, vol: 0.2, freq: e.detune(1200), sweep: 0.15, q: 0.6 });
  e.tone(e.detune(500), { type: 'sine', dur: 0.5, vol: 0.15, slide: 0.15 });
}

function crateLandSound(e: AudioEngine): void {
  e.noise({ dur: 0.25, vol: 0.28, freq: e.detune(400), type: 'lowpass', q: 0.6 });
  e.tone(e.detune(80), { type: 'sine', dur: 0.3, vol: 0.22, slide: 0.5 });
}

function crateGrabSound(e: AudioEngine): void {
  [0, 2, 4, 6].forEach((n, i) => e.tone(e.detune([392, 493.9, 587.3, 784][n % 4]), { type: 'triangle', dur: 0.18, vol: 0.09, delay: i * 0.05 }));
}

function mapWarnSound(e: AudioEngine): void {
  e.tone(e.detune(660), { type: 'square', dur: 0.15, vol: 0.08 });
  e.tone(e.detune(660), { type: 'square', dur: 0.15, vol: 0.08, delay: 0.22 });
}

function mapEventSound(e: AudioEngine): void {
  e.noise({ dur: 0.6, vol: 0.3, freq: e.detune(500), type: 'lowpass', sweep: 0.1, q: 0.5 });
  e.tone(e.detune(60), { type: 'sine', dur: 0.5, vol: 0.25, slide: 0.4 });
}

function turnStartSound(e: AudioEngine): void {
  e.noise({ dur: 0.3, vol: 0.14, freq: e.detune(700), sweep: 3, q: 0.6 });
  e.tone(e.detune(523.3), { type: 'triangle', dur: 0.16, vol: 0.07 });
}

function uiClickSound(e: AudioEngine): void {
  e.tone(e.detune(1100), { type: 'square', dur: 0.04, vol: 0.05 });
}

/** Abonne tous les bruitages du lot LV au bus. Retourne une fonction de nettoyage (non utilisée à ce jour). */
export function installSfx(bus: Bus, engine: AudioEngine): () => void {
  const offs = [
    bus.on('fire', ({ weapon }) => fireSound(engine, weapon.category)),
    bus.on('hit', ({ crit }) => hitSound(engine, crit)),
    bus.on('parry:result', ({ grade }) => parrySound(engine, grade)),
    bus.on('ko', () => koSound(engine)),
    bus.on('ringout', () => ringoutSound(engine)),
    bus.on('crate:land', () => crateLandSound(engine)),
    bus.on('crate:grab', () => crateGrabSound(engine)),
    bus.on('map:warn', () => mapWarnSound(engine)),
    bus.on('map:event', () => mapEventSound(engine)),
    bus.on('turn:start', () => turnStartSound(engine)),
    bus.on('ui:click', () => uiClickSound(engine)),
  ];
  return () => { for (const off of offs) off(); };
}
