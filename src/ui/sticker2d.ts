// Visuel 2D d'une arme dans toute l'interface (arsenal, présentation, barre d'armes, fin de match) : le sticker
// Nano Banana détouré dans le navigateur (fond magenta #FF00FF retiré, bords rognés), jamais une forme générique.
// Arme scannée dont le sticker n'est pas encore arrivé : petite forge, puis fondu dès que `scan:result` ramène
// `stickerUrl`. Aucun sticker possible (échec, objet de cache sans image) : étiquette au nom de l'objet.
import type { Ctx, Weapon } from '../core/types';
import { PRESET_WEAPONS } from '../ia/presets';
import { el } from './dom';
import { mountForge } from './forge';

/** Côté le plus long du sticker détouré (px) : assez net pour la carte de présentation en 1080p. */
const MAX_SIDE = 420;
/** Même tolérance que src/scene/sticker (JPEG bruité autour du magenta). */
const KEY_TOL = 0.4;
/** Une rangée/colonne avec moins de pixels opaques est une poussière JPEG, pas l'objet. */
const MIN_OPAQUE = 3;
/** Au-delà, un sticker attendu est déclaré perdu (le service met ~15 s, délai max côté client 25 s). */
const PENDING_GIVE_UP_MS = 32000;

const detoured = new Map<string, Promise<string | null>>();
/** Sticker arrivé en cours de route (scan:result), par id d'arme d'origine. */
const arrived = new Map<string, string>();
/** Scans dont le sticker a échoué (scan:progress sticker-failed), par id d'arme d'origine. */
const failed = new Set<string>();
let ctxRef: Ctx | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('sticker image failed'));
    img.src = src;
  });
}

/** Retire le fond magenta, adoucit le liseré, rogne au plus près de l'objet. Mis en cache par URL. */
export function detourSticker(src: string): Promise<string | null> {
  let p = detoured.get(src);
  if (p) return p;
  p = (async () => {
    try {
      const img = await loadImage(src);
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      const s = Math.min(1, MAX_SIDE / Math.max(w0, h0, 1));
      const w = Math.max(1, Math.round(w0 * s));
      const h = Math.max(1, Math.round(h0 * s));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (!g) return src;
      g.drawImage(img, 0, 0, w, h);
      const image = g.getImageData(0, 0, w, h);
      const d = image.data;
      const maxDist = Math.sqrt(3 * 255 * 255);
      const cols = new Uint16Array(w);
      const rows = new Uint16Array(h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = d[i];
          const gr = d[i + 1];
          const b = d[i + 2];
          const dist = Math.sqrt((r - 255) ** 2 + gr * gr + (b - 255) ** 2) / maxDist;
          if (dist < KEY_TOL) {
            d[i + 3] = 0;
            continue;
          }
          const excess = Math.min(r, b) - gr; // liseré magenta : on le ramène vers le vert local
          if (excess > 0) {
            const pull = Math.min(1, excess / 128);
            d[i] = r - pull * excess * 0.5;
            d[i + 2] = b - pull * excess * 0.5;
            if (dist < KEY_TOL * 1.5) d[i + 3] = Math.round(Math.max(0, Math.min(1, (dist - KEY_TOL) / (KEY_TOL * 0.5))) * 255);
          }
          if (d[i + 3] > 128) {
            cols[x]++;
            rows[y]++;
          }
        }
      }
      g.putImageData(image, 0, 0);
      let x0 = 0;
      while (x0 < w && cols[x0] < MIN_OPAQUE) x0++;
      let x1 = w - 1;
      while (x1 > x0 && cols[x1] < MIN_OPAQUE) x1--;
      let y0 = 0;
      while (y0 < h && rows[y0] < MIN_OPAQUE) y0++;
      let y1 = h - 1;
      while (y1 > y0 && rows[y1] < MIN_OPAQUE) y1--;
      if (x1 - x0 < 8 || y1 - y0 < 8) return null;
      const pad = 3;
      const cw = x1 - x0 + 1 + pad * 2;
      const ch = y1 - y0 + 1 + pad * 2;
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d')!.drawImage(canvas, x0 - pad, y0 - pad, cw, ch, 0, 0, cw, ch);
      return await new Promise<string | null>((resolve) =>
        out.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png'),
      );
    } catch {
      return null;
    }
  })();
  detoured.set(src, p);
  return p;
}

/** Les armes sont clonées (`<id>-p0-1`, `<id>-3187`) : on retrouve l'id d'origine par préfixe. */
function sameOrigin(id: string, originId: string): boolean {
  return id === originId || id.startsWith(`${originId}-`);
}

function trailingWords(s: string): string[] {
  return s.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** « yellow rubber duck » ↔ « rubber duck », « cast iron frying pan » ↔ « black frying pan ». */
function sameObject(a: string, b: string): boolean {
  const wa = trailingWords(a);
  const wb = trailingWords(b);
  const need = Math.min(2, wa.length, wb.length);
  if (!need) return false;
  for (let k = 1; k <= need; k++) if (wa[wa.length - k] !== wb[wb.length - k]) return false;
  return true;
}

/** URL du sticker d'une arme : le sien, celui arrivé en route, ou celui de la vraie arme prédéfinie équivalente. */
export function stickerSource(w: Weapon): string | undefined {
  if (w.stickerUrl) return w.stickerUrl;
  for (const [id, url] of arrived) if (sameOrigin(w.id, id)) return url;
  const byId = PRESET_WEAPONS.find((p) => p.stickerUrl && sameOrigin(w.id, p.id));
  if (byId) return byId.stickerUrl;
  return PRESET_WEAPONS.find((p) => p.stickerUrl && sameObject(p.object, w.object))?.stickerUrl;
}

function isPending(w: Weapon): boolean {
  if (w.source !== 'scan') return false;
  for (const id of failed) if (sameOrigin(w.id, id)) return false;
  return true;
}

function showLabel(box: HTMLElement, w: Weapon): void {
  box.classList.remove('is-forging');
  box.replaceChildren(el('span', 'wsticker-label', w.object));
}

function showImage(box: HTMLElement, src: string, w: Weapon, fadeIn: boolean): void {
  void detourSticker(src).then((url) => {
    if (!url) {
      showLabel(box, w);
      return;
    }
    const img = el('img', 'wsticker-img');
    img.alt = w.name;
    img.draggable = false;
    img.src = url;
    box.classList.remove('is-forging');
    if (fadeIn) box.classList.add('forged');
    box.replaceChildren(img);
  });
}

/**
 * Pastille-sticker d'une arme, à poser n'importe où (taille donnée par le CSS du parent via `.wsticker`).
 * Se met à jour seule quand un sticker attendu arrive (fondu « sorti de la forge »).
 */
export function weaponSticker(w: Weapon, cls = ''): HTMLDivElement {
  const box = el('div', `wsticker ${cls}`.trim());
  const src = stickerSource(w);
  if (src) {
    showImage(box, src, w, false);
    return box;
  }
  if (!isPending(w) || !ctxRef) {
    showLabel(box, w);
    return box;
  }
  box.classList.add('is-forging');
  box.append(mountForge('').root);
  const bus = ctxRef.bus;
  const offs: (() => void)[] = [];
  const stop = () => {
    for (const off of offs) off();
    window.clearTimeout(giveUp);
  };
  offs.push(
    bus.on('scan:result', ({ weapon }) => {
      if (!weapon.stickerUrl || !sameOrigin(w.id, weapon.id)) return;
      stop();
      w.stickerUrl = weapon.stickerUrl;
      showImage(box, weapon.stickerUrl, w, true);
    }),
    bus.on('scan:progress', ({ step, weaponId }) => {
      if (step !== 'sticker-failed' || !weaponId || !sameOrigin(w.id, weaponId)) return;
      stop();
      showLabel(box, w);
    }),
  );
  const giveUp = window.setTimeout(() => {
    stop();
    if (!stickerSource(w)) showLabel(box, w);
  }, PENDING_GIVE_UP_MS);
  return box;
}

/** À appeler une fois (install de l'UI) : suit les stickers qui arrivent en route et les recopie sur les
 *  armes déjà clonées dans l'état du match (sinon la scène 3D ne les verrait jamais). */
export function installStickers(ctx: Ctx): void {
  ctxRef = ctx;
  ctx.bus.on('scan:progress', ({ step, weaponId }) => {
    if (step === 'sticker-failed' && weaponId) failed.add(weaponId);
  });
  ctx.bus.on('scan:result', ({ weapon }) => {
    if (!weapon.stickerUrl) return;
    arrived.set(weapon.id, weapon.stickerUrl);
    void detourSticker(weapon.stickerUrl);
    for (const p of ctx.state.players) {
      for (const w of p.weapons) if (!w.stickerUrl && sameOrigin(w.id, weapon.id)) w.stickerUrl = weapon.stickerUrl;
    }
  });
}

/** Détoure d'avance les stickers des armes prédéfinies (écran d'arsenal instantané). */
export function preloadPresetStickers(): void {
  for (const p of PRESET_WEAPONS) if (p.stickerUrl) void detourSticker(p.stickerUrl);
}
