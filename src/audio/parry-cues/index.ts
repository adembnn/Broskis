import type { Bus } from '../../core/bus';
import type { AudioEngine } from '../engine';

export function installParryCues(bus: Bus, engine: AudioEngine): void {
  // Low-pass filter for music during approach
  let lpf: BiquadFilterNode | null = null;
  if (engine.ctx && engine.musicBus && engine.master) {
    lpf = engine.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 22000; // start open
    
    engine.musicBus.disconnect(engine.master);
    engine.musicBus.connect(lpf);
    lpf.connect(engine.master);
  }

  bus.on('parry:window', ({ tImpact }) => {
    if (!engine.ctx) return;
    
    // tImpact is in performance.now() time base (ms)
    const nowMs = performance.now();
    const delayMs = tImpact - nowMs;
    const impactTimeSec = engine.now + delayMs / 1000;
    
    // Schedule tics
    const t600 = impactTimeSec - 0.6;
    const t300 = impactTimeSec - 0.3;
    const t0 = impactTimeSec;
    
    const outputLatency = engine.ctx.baseLatency || 0.05; // Approximation si non disponible

    if (t600 > engine.now) {
      engine.tone(440, { type: 'square', dur: 0.05, vol: 0.1, delay: t600 - engine.now - outputLatency });
    }
    if (t300 > engine.now) {
      engine.tone(440, { type: 'square', dur: 0.05, vol: 0.1, delay: t300 - engine.now - outputLatency });
    }
    if (t0 > engine.now) {
      engine.tone(880, { type: 'square', dur: 0.1, vol: 0.15, delay: t0 - engine.now - outputLatency });
    }
    
    // Apply low-pass filter
    if (lpf) {
      lpf.frequency.setTargetAtTime(800, engine.now, 0.1);
      lpf.frequency.setTargetAtTime(22000, t0, 0.1); // reset at impact
    }
  });

  bus.on('parry:streak', ({ streak }) => {
    // Clang monté d'un demi-ton
    if (streak > 0) {
      const baseFreq = 500;
      const freq = baseFreq * Math.pow(2, streak / 12);
      engine.tone(freq, { type: 'sawtooth', dur: 0.2, vol: 0.2 });
      engine.noise({ type: 'highpass', dur: 0.2, vol: 0.1, freq: 1000 });
    }
  });
}
