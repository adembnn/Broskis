import { el, clear } from '../../ui/dom';
import type { PlayerId } from '../../core/types';
import type { BarkEvent } from '../../audio/barks';
import { setVoiceOverride } from '../../audio/barks';

const SCRIPT_TEXT = "I am the greatest Broski of all time! Nobody touches my snacks! Bring it on, you little toaster! Victory is MINE! Ha ha ha!";

export async function promptVoiceClone(player: PlayerId, container: HTMLElement, onReady: () => void): Promise<void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('Mic blocked: using the default voice', err);
    return;
  }

  clear(container);
  const panel = el('div', 'voice-clone-panel');
  const title = el('h3', 'b-title', 'Scream this, loud!');
  const script = el('p', 'voice-script', `"${SCRIPT_TEXT}"`);
  const visualizer = el('div', 'voice-visualizer');
  const ring = el('div', 'voice-ring');
  const ringFill = el('div', 'voice-ring-fill');
  
  ring.append(ringFill);
  visualizer.append(ring);
  panel.append(title, script, visualizer);
  container.append(panel);

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyzer = audioCtx.createAnalyser();
  analyzer.fftSize = 256;
  source.connect(analyzer);
  const data = new Uint8Array(analyzer.frequencyBinCount);
  
  let active = true;
  const updateMeter = () => {
    if (!active) return;
    analyzer.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const scale = 1 + (avg / 255) * 0.5;
    ring.style.transform = `scale(${scale})`;
    requestAnimationFrame(updateMeter);
  };
  updateMeter();

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  
  const durationMs = 12000;
  const startT = performance.now();
  const updateRing = () => {
    if (!active) return;
    const elapsed = performance.now() - startT;
    const pct = Math.min(100, (elapsed / durationMs) * 100);
    ringFill.style.height = `${pct}%`;
    if (elapsed < durationMs) requestAnimationFrame(updateRing);
  };
  updateRing();

  recorder.onstop = async () => {
    active = false;
    stream.getTracks().forEach(t => t.stop());
    void audioCtx.close();
    
    const blob = new Blob(chunks, { type: 'audio/webm' });
    clear(container);
    
    // Process background
    processClone(blob, player).then((barks) => {
      if (barks) {
        setVoiceOverride(player, barks);
        onReady();
      }
    }).catch(err => {
      console.warn('Clone failed', err);
    });
  };
  
  recorder.start();
  setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, durationMs);
}

async function processClone(blob: Blob, player: PlayerId): Promise<Partial<Record<BarkEvent, string[]>> | null> {
  const reader = new FileReader();
  const b64 = await new Promise<string>((resolve) => {
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });

  const cloneRes = await fetch('/api/voice-clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'clone', audioBase64: b64, mime: blob.type, playerId: player })
  });
  
  if (!cloneRes.ok) throw new Error('Clone API failed');
  const cloneData = await cloneRes.json();
  const voiceId = cloneData.voiceId;
  
  // Cleanup on unload
  window.addEventListener('unload', () => {
    navigator.sendBeacon('/api/voice-clone', JSON.stringify({ action: 'delete', voiceId }));
  });

  const lines = [
    { id: 'taunt_turn_1', text: 'THAT IS ALL YOU GOT?!' },
    { id: 'taunt_turn_2', text: 'BROSKI POWEEER!' },
    { id: 'hit_heavy', text: 'NOT MY FAAACE!' },
    { id: 'parry_perfect', text: 'NICE TRYYY!' },
    { id: 'ringout_scream', text: 'NOOOOOOOOOOO!' },
    { id: 'ko', text: 'UGH!' },
    { id: 'victory', text: 'I TOLD YOU SO!' },
    { id: 'low_hp', text: 'THIS IS FINE!' }
  ];

  const linesRes = await fetch('/api/voice-lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceId, lines })
  });

  if (!linesRes.ok) throw new Error('Lines API failed');
  const linesData = await linesRes.json();
  const results = linesData.results;

  const barks: Partial<Record<BarkEvent, string[]>> = {};
  for (const line of lines) {
    if (results[line.id]) {
      const buffer = Uint8Array.from(atob(results[line.id]), c => c.charCodeAt(0));
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const eventId = line.id.startsWith('taunt_turn_') ? 'taunt_turn' : line.id as BarkEvent;
      if (!barks[eventId]) barks[eventId] = [];
      barks[eventId]!.push(url);
    }
  }

  return barks;
}
