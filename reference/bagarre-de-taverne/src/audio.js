// Sons 100 % synthétisés (Web Audio) : aucun fichier à charger.
let ctx = null;
let master = null;
let muted = false;
let NOISE = null;

export function initAudio() {
  if (ctx) { ctx.resume?.(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    startAmbience();
  } catch { ctx = null; }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;

function noiseBuffer(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(freq, { type = 'sine', dur = 0.3, vol = 0.2, slide = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  env(g, t, 0.01, vol, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise({ dur = 0.4, vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', sweep = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  NOISE ||= noiseBuffer(2);
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = NOISE;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
export const sfx = {
  type() { tone(1700 + Math.random() * 500, { type: 'triangle', dur: 0.03, vol: 0.025 }); },
  tick() { tone(1200, { type: 'square', dur: 0.03, vol: 0.03 }); },
  weave() { for (let i = 0; i < 4; i++) tone(SCALE[i + 2] * 2, { dur: 0.35, vol: 0.05, delay: i * 0.06 }); },
  cast(element) {
    noise({ dur: 0.45, vol: 0.22, freq: element === 'glace' ? 4000 : 900, sweep: 3, q: 1.2 });
    tone(element === 'ombre' ? 80 : 170, { type: 'sawtooth', dur: 0.3, vol: 0.07, slide: 2.5 });
  },
  whoosh() { noise({ dur: 0.35, vol: 0.18, freq: 500, sweep: 4, q: 0.7 }); },
  hit() { noise({ dur: 0.1, vol: 0.2, freq: 1800, q: 1.5 }); tone(140, { type: 'square', dur: 0.12, vol: 0.08, slide: 0.5 }); },
  boom(big = 1) {
    noise({ dur: 0.9 * big, vol: 0.5, freq: 700, sweep: 0.08, type: 'lowpass', q: 0.5 });
    tone(65, { type: 'sine', dur: 0.7 * big, vol: 0.4, slide: 0.35 });
  },
  crack() { // bois qui casse
    for (let i = 0; i < 4; i++) noise({ dur: 0.05, vol: 0.25, freq: 900 + i * 400, q: 3, delay: i * 0.03 });
    tone(90, { type: 'triangle', dur: 0.25, vol: 0.15, slide: 0.5, delay: 0.05 });
  },
  thud() { tone(75, { type: 'sine', dur: 0.25, vol: 0.3, slide: 0.5 }); noise({ dur: 0.15, vol: 0.2, freq: 300, type: 'lowpass' }); },
  clang() { [880, 1320, 1760].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.8, vol: 0.06 / (i + 1) })); noise({ dur: 0.2, vol: 0.15, freq: 3000, q: 2 }); },
  splash() { noise({ dur: 0.6, vol: 0.3, freq: 1400, sweep: 0.3, q: 0.9 }); noise({ dur: 0.4, vol: 0.15, freq: 3000, q: 3, delay: 0.1 }); },
  zap() { for (let i = 0; i < 3; i++) noise({ dur: 0.06, vol: 0.2, freq: 5000, q: 4, delay: i * 0.04 }); },
  sizzle() { noise({ dur: 0.7, vol: 0.18, freq: 5200, sweep: 0.5, q: 0.6, type: 'highpass' }); },
  ignite() { noise({ dur: 0.8, vol: 0.4, freq: 300, sweep: 4, q: 0.6 }); tone(90, { type: 'sine', dur: 0.5, vol: 0.25, slide: 0.5 }); },
  freeze() { [2400, 3200, 4100].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.35, vol: 0.04, delay: i * 0.05 })); noise({ dur: 0.3, vol: 0.12, freq: 6000, q: 2 }); },
  shatter() { for (let i = 0; i < 6; i++) noise({ dur: 0.08, vol: 0.18, freq: 3000 + i * 700, q: 5, delay: i * 0.025 }); tone(1800, { type: 'triangle', dur: 0.3, vol: 0.05, slide: 0.6 }); },
  zapBig() { for (let i = 0; i < 6; i++) noise({ dur: 0.07, vol: 0.28, freq: 4200, q: 3, delay: i * 0.05 }); tone(60, { type: 'sawtooth', dur: 0.4, vol: 0.12, slide: 1.5 }); },
  mana() { tone(SCALE[2] * 2, { type: 'triangle', dur: 0.12, vol: 0.05 }); },
  hurt() { tone(120, { type: 'square', dur: 0.2, vol: 0.1, slide: 0.6 }); },
  heal() { [0, 2, 4, 6].forEach((n, i) => tone(SCALE[n] * 2, { dur: 0.4, vol: 0.07, delay: i * 0.06 })); },
  shield() { tone(330, { type: 'triangle', dur: 0.6, vol: 0.08, slide: 1.5 }); tone(495, { type: 'sine', dur: 0.6, vol: 0.05, slide: 1.5 }); },
  fizzle() { tone(300, { type: 'sawtooth', dur: 0.4, vol: 0.06, slide: 0.3 }); },
  turn() { tone(SCALE[4], { type: 'triangle', dur: 0.18, vol: 0.07 }); tone(SCALE[6], { type: 'triangle', dur: 0.25, vol: 0.07, delay: 0.09 }); },
  ko() { [6, 4, 2, 0].forEach((n, i) => tone(SCALE[n], { type: 'triangle', dur: 0.7, vol: 0.1, delay: i * 0.18 })); },
  win() { [0, 2, 4, 6, 4, 6].forEach((n, i) => tone(SCALE[n] * 2, { type: 'triangle', dur: 0.3, vol: 0.08, delay: i * 0.1 })); },
};

// Ambiance de taverne : feu qui crépite + nappe grave très discrète.
function startAmbience() {
  const g = ctx.createGain(); g.gain.value = 0.025;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  [98, 146.8].forEach((fr, i) => {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; o.detune.value = i * 6; o.connect(f); o.start();
  });
  f.connect(g).connect(master);
  const crackle = () => {
    if (!ctx) return;
    if (!muted) noise({ dur: 0.03 + Math.random() * 0.04, vol: 0.02 + Math.random() * 0.04, freq: 2000 + Math.random() * 3000, q: 3 });
    setTimeout(crackle, 80 + Math.random() * 500);
  };
  crackle();
}
