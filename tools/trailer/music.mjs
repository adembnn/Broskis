// Bande-son du trailer, générée par code (aucun fichier de musique externe) : 130 BPM, calée sur timeline.js.
// Musique par intensité de plan + bruitages posés sur les VRAIS événements du rendu (tirs, impacts, parades,
// textes qui claquent) + répliques de l'animateur (voix Gradium déjà générées dans public/assets).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BEAT, CUTS, totalBeats } from '../../src/trailer/timeline.js';

const SR = 48000;

// ------------------------------------------------------------------------------------------------ outils
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
const noise = rng(20260926);
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

class Bus {
  constructor(seconds) { this.L = new Float32Array(Math.ceil(seconds * SR) + SR); this.R = new Float32Array(this.L.length); }
  add(i, l, r = l) { if (i >= 0 && i < this.L.length) { this.L[i] += l; this.R[i] += r; } }
}

function onePole(cut) { const a = Math.exp(-2 * Math.PI * cut / SR); let y = 0; return (x) => (y = x * (1 - a) + y * a); }
function biquadBP(f, q) {
  const w = 2 * Math.PI * f / SR; const al = Math.sin(w) / (2 * q); const c = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

// ------------------------------------------------------------------------------------------------ instruments
function kick(bus, t, g = 1) {
  const i0 = Math.round(t * SR);
  for (let n = 0, ph = 0; n < 0.45 * SR; n++) {
    const s = n / SR;
    const f = 45 + 110 * Math.exp(-s * 28);
    ph += 2 * Math.PI * f / SR;
    const v = (Math.sin(ph) * Math.exp(-s * 7.5) + (s < 0.004 ? noise() * 0.5 : 0)) * 0.9 * g;
    bus.add(i0 + n, v);
  }
}
function clap(bus, t, g = 1) {
  const i0 = Math.round(t * SR); const bp = biquadBP(1500, 0.9);
  for (let n = 0; n < 0.25 * SR; n++) {
    const s = n / SR;
    const burst = s < 0.03 ? (Math.floor(s / 0.009) % 2 === 0 ? 1 : 0.4) : 1;
    const v = bp(noise()) * Math.exp(-s * 16) * burst * 1.6 * g + Math.sin(2 * Math.PI * 185 * s) * Math.exp(-s * 40) * 0.3 * g;
    bus.add(i0 + n, v * 0.9, v);
  }
}
function hat(bus, t, g = 1, open = false) {
  const i0 = Math.round(t * SR); const lp = onePole(7000); const dec = open ? 9 : 45;
  for (let n = 0; n < (open ? 0.3 : 0.08) * SR; n++) {
    const s = n / SR; const x = noise(); const v = (x - lp(x)) * Math.exp(-s * dec) * 0.28 * g;
    bus.add(i0 + n, v * 0.8, v);
  }
}
function tom(bus, t, f, g = 1) {
  const i0 = Math.round(t * SR);
  for (let n = 0, ph = 0; n < 0.3 * SR; n++) {
    const s = n / SR; ph += 2 * Math.PI * (f * (1 + Math.exp(-s * 20) * 0.6)) / SR;
    bus.add(i0 + n, Math.sin(ph) * Math.exp(-s * 11) * 0.5 * g);
  }
}
function saw(ph) { return 2 * (ph - Math.floor(ph + 0.5)); }
function bass(bus, t, note, dur, g = 1) {
  const i0 = Math.round(t * SR); const f = midi(note); const lp = onePole(900);
  for (let n = 0, ph = 0; n < dur * SR; n++) {
    const s = n / SR; ph += f / SR;
    const env = Math.min(1, s / 0.004) * Math.exp(-s * 3.2) * (s > dur - 0.02 ? (dur - s) / 0.02 : 1);
    const v = (lp(saw(ph)) * 0.55 + Math.sin(2 * Math.PI * ph) * 0.6) * env * 0.55 * g;
    bus.add(i0 + n, v);
  }
}
function stab(bus, t, notes, dur, g = 1) {
  const i0 = Math.round(t * SR);
  const voices = notes.flatMap((nt) => [-0.08, 0, 0.09].map((d) => ({ f: midi(nt) * 2 ** (d / 12), ph: Math.random() })));
  const lpL = onePole(2600); const lpR = onePole(2600);
  for (let n = 0; n < dur * SR; n++) {
    const s = n / SR; let l = 0; let r = 0;
    voices.forEach((v, k) => { v.ph += v.f / SR; const x = saw(v.ph); if (k % 2) l += x; else r += x; });
    const env = Math.min(1, s / 0.006) * Math.exp(-s * 5.5);
    bus.add(i0 + n, lpL(l) * env * 0.09 * g, lpR(r) * env * 0.09 * g);
  }
}
function pad(bus, t, notes, dur, g = 1) {
  const i0 = Math.round(t * SR);
  const voices = notes.flatMap((nt) => [-0.12, 0.11].map((d) => ({ f: midi(nt) * 2 ** (d / 12), ph: 0 })));
  const lp = onePole(1200);
  for (let n = 0; n < dur * SR; n++) {
    const s = n / SR; let x = 0;
    for (const v of voices) { v.ph += v.f / SR; x += saw(v.ph); }
    const env = Math.min(1, s / 0.4) * Math.min(1, (dur - s) / 0.6);
    const y = lp(x) * env * 0.05 * g;
    bus.add(i0 + n, y, y * 0.95);
  }
}
function riser(bus, t, dur, g = 1) {
  const i0 = Math.round(t * SR);
  for (let n = 0; n < dur * SR; n++) {
    const s = n / SR; const k = s / dur;
    const bp = riser.bp ?? (riser.bp = biquadBP(400, 1.2));
    if (n % 256 === 0) riser.bp = biquadBP(300 + 5000 * k * k, 1.4);
    const v = riser.bp(noise()) * k * k * 0.9 * g;
    bus.add(i0 + n, v, v * 0.9);
  }
  riser.bp = null;
}
function whoosh(bus, t, g = 1) {
  const i0 = Math.round(t * SR); let bp = biquadBP(600, 1);
  for (let n = 0; n < 0.32 * SR; n++) {
    const s = n / SR; const k = s / 0.32;
    if (n % 128 === 0) bp = biquadBP(500 + 2500 * Math.sin(Math.PI * k), 1.3);
    const v = bp(noise()) * Math.sin(Math.PI * k) * 0.8 * g;
    bus.add(i0 + n, v * (1 - k * 0.5), v * (0.5 + k * 0.5));
  }
}
function impact(bus, t, g = 1, big = false) {
  const i0 = Math.round(t * SR); const lp = onePole(big ? 900 : 1600); const len = big ? 1.6 : 0.55;
  for (let n = 0, ph = 0; n < len * SR; n++) {
    const s = n / SR; ph += (big ? 38 : 60) * (1 + Math.exp(-s * 12) * 2) / SR;
    const v = (Math.sin(2 * Math.PI * ph) * Math.exp(-s * (big ? 2.6 : 7)) + lp(noise()) * Math.exp(-s * (big ? 5 : 14)) * 0.9) * 0.95 * g;
    bus.add(i0 + n, v);
  }
}
function ting(bus, t, g = 1) {
  const i0 = Math.round(t * SR);
  for (let n = 0; n < 0.9 * SR; n++) {
    const s = n / SR;
    const v = (Math.sin(2 * Math.PI * 1318 * s) + Math.sin(2 * Math.PI * 2637 * s) * 0.5 + Math.sin(2 * Math.PI * 3951 * s) * 0.2) * Math.exp(-s * 5) * 0.35 * g;
    bus.add(i0 + n, v, v);
  }
}
function slap(bus, t, g = 1) { // sticker qui claque : claquement sec + petit « pok »
  const i0 = Math.round(t * SR); const hp = onePole(1200);
  for (let n = 0; n < 0.12 * SR; n++) {
    const s = n / SR; const x = noise();
    const v = ((x - hp(x)) * Math.exp(-s * 60) * 1.1 + Math.sin(2 * Math.PI * 220 * s) * Math.exp(-s * 35) * 0.5) * g;
    bus.add(i0 + n, v, v);
  }
}
function shutter(bus, t, g = 1) { slap(bus, t, 0.8 * g); slap(bus, t + 0.07, 0.5 * g); }

// ------------------------------------------------------------------------------------------------ voix (WAV PCM)
function readWav(path) {
  const b = readFileSync(path);
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4); const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(off + 8), ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) return null;
  const frames = Math.floor(data.length / (fmt.ch * fmt.bits / 8));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let v = 0;
    for (let c = 0; c < fmt.ch; c++) {
      const p = (i * fmt.ch + c) * fmt.bits / 8;
      if (fmt.format === 3 && fmt.bits === 32) v += data.readFloatLE(p);
      else if (fmt.bits === 16) v += data.readInt16LE(p) / 32768;
      else if (fmt.bits === 24) v += (data.readIntLE(p, 3)) / 8388608;
      else if (fmt.bits === 32) v += data.readInt32LE(p) / 2147483648;
    }
    out[i] = v / fmt.ch;
  }
  return { samples: out, sr: fmt.sr };
}
function placeVoice(bus, duckEnv, t, path, g = 1) {
  if (!existsSync(path)) return 0;
  const w = readWav(path); if (!w) return 0;
  const ratio = w.sr / SR; const len = Math.floor(w.samples.length / ratio); const i0 = Math.round(t * SR);
  for (let n = 0; n < len; n++) {
    const x = n * ratio; const k = Math.floor(x); const fr = x - k;
    const v = ((w.samples[k] ?? 0) * (1 - fr) + (w.samples[k + 1] ?? 0) * fr) * g;
    bus.add(i0 + n, v, v);
    if (i0 + n < duckEnv.length) duckEnv[i0 + n] = 1;
  }
  return len / SR;
}

// ------------------------------------------------------------------------------------------------ partition
const CHORDS = [ // vi – IV – I – V en do majeur, une mesure chacun (4 temps)
  { root: 45, notes: [69, 72, 76] }, // la mineur
  { root: 41, notes: [65, 69, 72] }, // fa
  { root: 48, notes: [67, 72, 76] }, // do
  { root: 43, notes: [67, 71, 74] }, // sol
];

function playSection(music, fx, kind, b0, beats, cutEndBeat) {
  const T = (b) => b * BEAT;
  for (let b = b0; b < b0 + beats; b++) {
    const chord = CHORDS[Math.floor(b / 4) % 4];
    const inBar = b % 4;
    const t = T(b);
    if (kind === 'intro') {
      if (inBar === 0 || inBar === 2) kick(music, t, 0.8);
      hat(music, t + BEAT / 2, 0.6);
      bass(music, t, chord.root, BEAT * 0.9, 0.7);
      if (inBar === 0) pad(music, t, chord.notes, BEAT * 4, 1);
    } else if (kind === 'build') {
      kick(music, t, 0.9);
      if (inBar === 1 || inBar === 3) clap(music, t, 0.8);
      hat(music, t + BEAT / 2, 0.8); hat(music, t, 0.4);
      bass(music, t, chord.root, BEAT * 0.45, 0.8); bass(music, t + BEAT / 2, chord.root + 12, BEAT * 0.4, 0.6);
      if (inBar === 0) stab(music, t, chord.notes, BEAT * 1.5, 0.8);
    } else if (kind === 'riser') {
      const subdiv = 4;
      for (let s = 0; s < subdiv; s++) clap(music, t + (s * BEAT) / subdiv, 0.3 + 0.5 * ((b - b0) / beats));
    } else if (kind === 'drop' || kind === 'drop2') {
      kick(music, t, 1);
      if (inBar === 1 || inBar === 3) clap(music, t, 1);
      for (let s = 0; s < 4; s++) hat(music, t + (s * BEAT) / 4, s === 2 ? 0.9 : 0.5, s === 2 && inBar === 3);
      bass(music, t, chord.root, BEAT * 0.4, 1); bass(music, t + BEAT * 0.5, chord.root + 12, BEAT * 0.25, 0.8); bass(music, t + BEAT * 0.75, chord.root, BEAT * 0.2, 0.8);
      if (kind === 'drop') { if (inBar === 0 || inBar === 2.5) stab(music, t, chord.notes.map((n) => n + 12), BEAT * 1.2, 1); if (inBar === 2) stab(music, t + BEAT / 2, chord.notes.map((n) => n + 12), BEAT, 0.8); }
      else { stab(music, t, chord.notes.map((n) => n + 12), BEAT * 0.8, 0.9); if (inBar === 3) { tom(music, t + BEAT / 2, 140, 0.7); tom(music, t + BEAT * 0.75, 110, 0.7); } }
    } else if (kind === 'climax') {
      if (b === b0) { impact(fx, t, 1, true); pad(music, t, [57, 64, 69, 72], BEAT * beats, 1.4); }
      if (inBar === 0 && b > b0) kick(music, t, 0.6);
    } else if (kind === 'outro') {
      if (inBar === 0 || b === b0) { stab(music, t, [60, 64, 67, 72], BEAT * 2.5, 1.1); kick(music, t, 1); }
      if (inBar === 2) clap(music, t, 0.7);
      bass(music, t, 48, BEAT * 0.9, 0.7);
    } else if (kind === 'end') {
      if (b === b0) { stab(music, t, [60, 64, 67, 72, 76], BEAT * 6, 1.4); kick(music, t, 1.2); impact(fx, t, 0.6, true); }
    }
  }
}

// ------------------------------------------------------------------------------------------------ assemblage
const VOICE = {
  hook: ['voices/announcer/crit-1.wav', 'hit'],
  card: ['presets/rubber-duck.wav', 'start'],
  fighter: ['voices/barbarian/taunt_turn-1.wav', 'start'],
  m3: ['voices/announcer/perfect-1.wav', 'parry:result'],
  climax: ['voices/announcer/ko-1.wav', 'ko'],
  ko: ['voices/announcer/victory-1.wav', 'start'],
};

export function renderSoundtrack({ cut, fps, events, out, fromFrame = 0, toFrame, root }) {
  const shots = CUTS[cut];
  const seconds = totalBeats(cut) * BEAT + 2;
  const music = new Bus(seconds); const fx = new Bus(seconds); const voice = new Bus(seconds);
  const duck = new Float32Array(music.L.length);
  const frameT = (f) => f / fps;

  for (const s of shots) {
    if (s.music && s.music !== 'none') playSection(music, fx, s.music, s.at, s.beats, s.at + s.beats);
    if (s.music === 'riser') riser(fx, s.at * BEAT, s.beats * BEAT, 0.8);
  }

  const shotAt = (frame) => shots.find((s) => frame >= Math.round(s.at * BEAT * fps) && frame < Math.round((s.at + s.beats) * BEAT * fps));
  const voiceDone = new Set();
  const seenFire = new Set();
  for (const e of events) {
    const t = frameT(e.frame);
    const s = shotAt(e.frame);
    const d = e.data ?? {};
    if (e.name === 'fire' && !seenFire.has(`${s?.id}`)) { seenFire.add(`${s?.id}`); whoosh(fx, t, 0.7); }
    else if (e.name === 'hit') impact(fx, t, d.crit ? 1 : 0.8, false);
    else if (e.name === 'parry:result' && d.grade === 'perfect') ting(fx, t, 1);
    else if (e.name === 'ko') impact(fx, t, 1, ['hook', 'climax', 'ko'].includes(s?.id));
    else if (e.name === 'shield:placed') impact(fx, t, 0.5, false);
    else if (e.name === 'ui:slam' || e.name === 'ui:logo' || e.name === 'ui:sticker' || e.name === 'ui:callout') slap(fx, t, e.name === 'ui:logo' ? 1.3 : 0.9);
    else if (e.name === 'ui:flash') shutter(fx, t, 1);
    else if (e.name === 'ui:card') whoosh(fx, t, 0.5);
    if (s && VOICE[s.id] && !voiceDone.has(s.id) && VOICE[s.id][1] === e.name) {
      voiceDone.add(s.id);
      placeVoice(voice, duck, t + 0.05, join(root, 'public/assets', VOICE[s.id][0]), 1.1);
    }
  }
  for (const s of shots) {
    if (VOICE[s.id]?.[1] === 'start' && !voiceDone.has(s.id)) { voiceDone.add(s.id); placeVoice(voice, duck, s.at * BEAT + 0.05, join(root, 'public/assets', VOICE[s.id][0]), 1.1); }
  }

  // Mixage : la musique s'efface de 7 dB sous la voix (attaque 30 ms, relâche 250 ms), limiteur doux.
  const i0 = Math.round(frameT(fromFrame) * SR);
  const i1 = Math.round(frameT(toFrame ?? Math.round(totalBeats(cut) * BEAT * fps)) * SR);
  const n = i1 - i0;
  const pcm = Buffer.alloc(n * 4);
  let g = 1;
  const att = Math.exp(-1 / (0.03 * SR)); const rel = Math.exp(-1 / (0.25 * SR));
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const target = duck[i] ? 0.45 : 1;
    g = target < g ? g * att + target * (1 - att) : g * rel + target * (1 - rel);
    let l = music.L[i] * 0.55 * g + fx.L[i] * 0.7 + voice.L[i] * 1.0;
    let r = music.R[i] * 0.55 * g + fx.R[i] * 0.7 + voice.R[i] * 1.0;
    l = Math.tanh(l * 1.1) * 0.92; r = Math.tanh(r * 1.1) * 0.92;
    pcm.writeInt16LE(Math.round(l * 32767), k * 4);
    pcm.writeInt16LE(Math.round(r * 32767), k * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(out, Buffer.concat([header, pcm]));
  return out;
}

// Utilisable seul : node tools/trailer/music.mjs 60 30 events.json out.wav
if (process.argv[1] && process.argv[1].endsWith('music.mjs')) {
  const [cut = '60', fps = '30', evPath, out = 'soundtrack.wav'] = process.argv.slice(2);
  const events = evPath && existsSync(evPath) ? JSON.parse(readFileSync(evPath, 'utf8')).events : [];
  renderSoundtrack({ cut, fps: Number(fps), events, out, root: process.cwd() });
  console.log(`Bande-son : ${out}`);
}
