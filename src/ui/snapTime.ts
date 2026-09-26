// Overlay « SNAP TIME! » sur crate:grab : webcam + compte à rebours de 10 s + capture, puis scanObject,
// puis ctx.bus.emit('scan:result', …). Remplace l'arme actuellement sélectionnée du joueur qui a la caisse.
import type { Ctx, PlayerId } from '../core/types';
import { scanObject } from '../ia';
import { button, clear, el, overlay, strokeNum } from './dom';
import { mountForge } from './forge';
import { renderWeaponCard } from './weaponCard';

const COUNTDOWN_S = 10;
const CAPTURE_MAX_SIDE = 768;

async function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
}

async function runSnap(ctx: Ctx, screenLayer: HTMLElement, player: PlayerId): Promise<void> {
  clear(screenLayer);
  const { root, card } = overlay('snap-time-card');
  screenLayer.append(root);
  card.append(el('h2', 'b-title', 'SNAP TIME!'));
  card.append(el('p', 'b-lede', `Player ${player + 1}: show an object to the camera before the count runs out.`));
  const video = el('video', 'capture-video snap-video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  const countdown = strokeNum(String(COUNTDOWN_S), 'snap-countdown');
  const captureBtn = button('Capture now', 'b-btn alt');
  card.append(video, countdown, captureBtn);

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    video.srcObject = stream;
  } catch {
    video.hidden = true;
    card.append(el('p', 'capture-error', 'Camera unavailable — capturing a mystery object instead.'));
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    let remaining = COUNTDOWN_S;
    let settled = false;
    const timer = window.setInterval(() => {
      remaining -= 1;
      countdown.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) finish();
    }, 1000);
    function finish() {
      if (settled) return;
      settled = true;
      window.clearInterval(timer);
      if (!stream) {
        resolve(null);
        return;
      }
      captureFrame(video).then(resolve);
    }
    captureBtn.addEventListener('click', finish);
  });
  stream?.getTracks().forEach((t) => t.stop());

  clear(card);
  card.append(el('h2', 'b-title', 'SNAP TIME!'));
  const forge = mountForge('Scanning your snap…');
  card.append(forge.root);
  const weapon = await scanObject(blob ?? 'mystery object', { player });

  const slot = ctx.state.players[player].selected;
  ctx.state.players[player].weapons[slot] = weapon;
  ctx.bus.emit('scan:result', { player, weapon });

  clear(card);
  const photoUrl = blob ? URL.createObjectURL(blob) : undefined;
  card.append(el('h2', 'b-title', 'New weapon!'), renderWeaponCard(weapon, { player, cardNumber: slot + 1, photoUrl, reveal: true }));
  await new Promise<void>((resolve) => card.append(button('Continue', 'b-btn', () => resolve())));
  clear(screenLayer);
}

const IN_MATCH_PHASES = new Set(['turn-intro', 'move', 'aim', 'resolve', 'snap-time']);

/** À appeler une seule fois au démarrage : écoute crate:grab pendant toute la durée de vie du jeu. */
export function installSnapTime(ctx: Ctx, screenLayer: HTMLElement): void {
  let busy = false;
  ctx.bus.on('crate:grab', ({ player }) => {
    if (busy || !IN_MATCH_PHASES.has(ctx.state.phase)) return;
    busy = true;
    runSnap(ctx, screenLayer, player).finally(() => {
      busy = false;
    });
  });
}
