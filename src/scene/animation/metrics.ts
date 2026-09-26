import type { AnimSample, AnimEvent } from '../../core/types';

const MAX_SAMPLES = 600;

class MetricsImpl {
  samples: AnimSample[] = [];
  events: AnimEvent[] = [];

  reset() {
    this.samples = [];
    this.events = [];
  }

  addSample(sample: AnimSample) {
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  addEvent(event: AnimEvent) {
    this.events.push(event);
    // On garde un peu plus d'événements si besoin, mais limitons aussi
    if (this.events.length > 2000) {
      this.events.shift();
    }
  }
}

export const animMetricsImpl = new MetricsImpl();

if (typeof window !== 'undefined') {
  window.animMetrics = animMetricsImpl;
}
