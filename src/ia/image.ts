// Réduit une photo à 768 px max avant de l'envoyer aux deux services IA (plan/lots/LI-pipeline-ia.md) :
// paquet plus petit, upload plus rapide, et Gemini n'a pas besoin de plus pour identifier un objet.
import { SCAN_IMAGE_MAX_SIDE } from './config';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

export interface ResizedImage {
  base64: string;
  mimeType: string;
}

/** Accepte un Blob (webcam/fichier) ou une chaîne (data URL, ou chemin public). */
export async function toResizedJpegBase64(input: Blob | string, maxSide = SCAN_IMAGE_MAX_SIDE): Promise<ResizedImage> {
  const isBlob = typeof input !== 'string';
  const url = isBlob ? URL.createObjectURL(input) : input;
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(width, height, 1));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const comma = dataUrl.indexOf(',');
    return { base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, mimeType: 'image/jpeg' };
  } finally {
    if (isBlob) URL.revokeObjectURL(url);
  }
}

export function isDataUrl(s: string): boolean {
  return /^data:[^;,]+;base64,/.test(s);
}
