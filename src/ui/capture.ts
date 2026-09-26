// Capture d'image partagée : webcam (getUserMedia), import de fichier ou glisser-déposer. Toujours réduite à
// 768 px max (le plus long côté) et réencodée en JPEG avant de partir vers scanObject/scanFighter.
import { button, el } from './dom';

export interface CaptureResult {
  blob: Blob;
  url: string;
}

const MAX_SIDE = 768;

function downscale(source: CanvasImageSource, w: number, h: number): Promise<CaptureResult> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d')!;
  g.drawImage(source, 0, 0, cw, ch);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, url: URL.createObjectURL(blob) }) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.85,
    );
  });
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('invalid image'));
    img.src = url;
  });
}

export interface CaptureWidget {
  root: HTMLDivElement;
  /** Résolu une seule fois, à la première image obtenue (webcam, import ou glisser-déposer). */
  result: Promise<CaptureResult>;
  dispose(): void;
}

/** Monte le widget de capture (aperçu webcam + import + glisser-déposer) et attend une image. */
export function mountCapture(hint: string): CaptureWidget {
  const root = el('div', 'capture');
  const zone = el('div', 'capture-zone');
  const video = el('video', 'capture-video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.hidden = true;
  const dropHint = el('p', 'capture-hint', hint);
  zone.append(video, dropHint);

  const row = el('div', 'capture-row');
  const camBtn = button('Use webcam', 'b-btn small');
  const shotBtn = button('Capture', 'b-btn small alt');
  shotBtn.hidden = true;
  const fileBtn = button('Import a photo', 'b-btn small alt');
  const fileInput = el('input', 'capture-file-input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  row.append(camBtn, shotBtn, fileBtn, fileInput);
  const errorEl = el('p', 'capture-error');
  errorEl.hidden = true;
  root.append(zone, row, errorEl);

  let stream: MediaStream | null = null;
  let settled = false;
  const stopStream = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const showError = (msg: string) => {
    errorEl.hidden = false;
    errorEl.textContent = msg;
  };

  let resolveResult!: (r: CaptureResult) => void;
  const result = new Promise<CaptureResult>((resolve) => {
    resolveResult = resolve;
  });
  const settle = (r: CaptureResult) => {
    if (settled) return;
    settled = true;
    stopStream();
    resolveResult(r);
  };

  camBtn.addEventListener('click', async () => {
    errorEl.hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      video.srcObject = stream;
      video.hidden = false;
      dropHint.hidden = true;
      shotBtn.hidden = false;
      camBtn.hidden = true;
    } catch {
      showError('Camera unavailable — try importing a photo instead.');
    }
  });

  shotBtn.addEventListener('click', async () => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const r = await downscale(video, w, h);
    settle(r);
  });

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const img = await fileToImage(file);
      settle(await downscale(img, img.naturalWidth, img.naturalHeight));
    } catch {
      showError('Could not read that file — try another image.');
    }
  });

  for (const evt of ['dragover', 'dragenter']) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
  }
  for (const evt of ['dragleave', 'dragend']) {
    zone.addEventListener(evt, () => zone.classList.remove('drag-over'));
  }
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const img = await fileToImage(file);
      settle(await downscale(img, img.naturalWidth, img.naturalHeight));
    } catch {
      showError('Could not read that file — try another image.');
    }
  });

  return {
    root,
    result,
    dispose() {
      stopStream();
    },
  };
}
