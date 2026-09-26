import type { Bus } from '../../core/bus';
import type { AudioEngine } from '../engine';

export function installParryCues(bus: Bus, engine: AudioEngine): void {
  let filter: BiquadFilterNode | null = null;

  function ensureFilter() {
    if (filter) return;
    if (!engine.ctx || !engine.musicBus || !engine.master) return;
    filter = engine.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 24000;
    engine.musicBus.disconnect();
    engine.musicBus.connect(filter);
    filter.connect(engine.master);
  }

  bus.on('projectile:incoming', ({ etaMs }) => {
    ensureFilter();
    if (filter && engine.ctx) {
      const t = engine.ctx.currentTime;
      filter.frequency.cancelScheduledValues(t);
      filter.frequency.setTargetAtTime(800, t, 0.1);
      
      const impactT = t + etaMs / 1000;
      filter.frequency.setTargetAtTime(24000, impactT, 0.15);
    }
  });

  bus.on('parry:window', ({ tImpact }) => {
    if (!engine.ctx) return;
    const outputLatency = (engine.ctx as any).outputLatency || 0;
    const delayToImpact = (tImpact - performance.now()) / 1000 - outputLatency;
    
    if (delayToImpact >= 0.6) {
      engine.tone(800, { type: 'square', dur: 0.05, vol: 0.1, delay: delayToImpact - 0.6 }, engine.sfxBus);
    }
    if (delayToImpact >= 0.3) {
      engine.tone(800, { type: 'square', dur: 0.05, vol: 0.1, delay: delayToImpact - 0.3 }, engine.sfxBus);
    }
    if (delayToImpact >= 0) {
      engine.tone(1200, { type: 'square', dur: 0.08, vol: 0.15, delay: delayToImpact }, engine.sfxBus);
    }
  });

  bus.on('parry:streak', ({ streak }) => {
    const baseFreq = 440;
    const freq = baseFreq * Math.pow(2, (streak - 1) / 12);
    engine.tone(freq, { type: 'sawtooth', dur: 0.2, vol: 0.3, slide: 0.5 }, engine.sfxBus);
    engine.noise({ type: 'bandpass', freq: freq * 2, q: 5, dur: 0.3, vol: 0.2 }, engine.sfxBus);
  });
}
