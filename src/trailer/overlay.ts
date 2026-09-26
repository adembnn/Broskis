// Couche 2D du trailer (textes qui claquent, viseur photo, carte d'arme, onde de voix, titre final).
// Tout est recalculé à CHAQUE image à partir du temps local du plan : rien ne dépend d'une animation CSS,
// donc le rendu image par image est exact. Styles tirés de src/art/tokens.js (anatomie d'un sticker `ui`).
import { joueurs, palette, polices, ui } from '../art/tokens.js';
import type { Weapon } from '../core/types';
import { chromaKey } from '../scene/sticker';
import { renderWeaponCard } from '../ui/weaponCard';
import { clamp01, ease } from './cam';

type Style = Partial<Record<string, string>>;

function el(tag: string, cls: string, parent: HTMLElement, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function css(e: HTMLElement, s: Style): void {
  for (const [k, v] of Object.entries(s)) e.style.setProperty(k, v ?? '');
}

const STICKER_SHADOW = (scale = 1) =>
  `0 0 0 ${ui.marge * scale}px ${ui.vinyle}, 0 0 0 ${(ui.marge + ui.lisere) * scale}px ${ui.encre}, ${ui.epaisseur * 1.6 * scale}px ${ui.epaisseur * 1.9 * scale}px 0 ${(ui.marge + ui.lisere) * scale}px ${ui.encre}`;

/** Contour vinyle autour d'une image détourée (8 ombres dures décalées = trait épais). */
const VINYL_OUTLINE = (px: number) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]
    .map(([x, y]) => `drop-shadow(${(x * px).toFixed(1)}px ${(y * px).toFixed(1)}px 0 ${ui.vinyle})`).join(' ');

const STYLE = `
#trailer { position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden; font-family: ${polices.titre}; }
#trailer > * { position: absolute; display: none; }
#trailer .tr-full { inset: 0; }
#trailer .tr-slam { left: 50%; top: 50%; padding: 18px 44px 14px; background: ${ui.papier}; color: ${ui.encre};
  border: ${ui.trait * 1.6}px solid ${ui.encre}; border-radius: ${ui.rayon * 1.4}px; box-shadow: ${STICKER_SHADOW(1.6)};
  font-size: 150px; line-height: 1; letter-spacing: 0.01em; white-space: nowrap; text-transform: uppercase; }
#trailer .tr-slam b { font-weight: 400; }
#trailer .tr-callout { left: 7%; bottom: 13%; padding: 10px 34px 8px; background: ${ui.encre}; color: ${ui.vinyle};
  border-radius: ${ui.rayon}px; font-size: 96px; line-height: 1; white-space: nowrap; box-shadow: 0 0 0 10px ${ui.vinyle}, 12px 14px 0 10px ${ui.encre}; }
#trailer .tr-callout small { display: block; font-family: ${polices.texte}; font-weight: 800; font-size: 30px; letter-spacing: 0.12em; color: ${ui.alerte}; margin-top: 6px; }
#trailer .tr-photo { left: 50%; top: 50%; width: 900px; height: 560px; }
#trailer .tr-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
#trailer .tr-bracket { width: 90px; height: 90px; border: 0 solid ${ui.vinyle}; }
#trailer .tr-chip { left: 50%; top: 79%; padding: 12px 26px; background: ${ui.encre}; color: ${ui.vinyle}; border-radius: 999px;
  font-family: ${polices.texte}; font-weight: 800; font-size: 34px; letter-spacing: 0.08em; white-space: nowrap; }
#trailer .tr-chip i { font-style: normal; color: ${ui.alerte}; }
#trailer .tr-shutter { left: 50%; bottom: 5%; width: 104px; height: 104px; border-radius: 50%; border: 9px solid ${ui.vinyle}; }
#trailer .tr-shutter::after { content: ''; position: absolute; inset: 9px; border-radius: 50%; background: ${ui.vinyle}; }
#trailer .tr-rec { left: 5%; top: 6%; font-family: ${polices.texte}; font-weight: 800; font-size: 30px; color: ${ui.vinyle}; letter-spacing: 0.1em; }
#trailer .tr-card { left: 50%; top: 50%; perspective: 1600px; }
#trailer .tr-wave { left: 50%; bottom: 12%; height: 180px; display: none; align-items: center; gap: 7px; }
#trailer .tr-wave span { display: block; width: 12px; border-radius: 6px; background: ${ui.vinyle}; box-shadow: 0 0 0 3px ${ui.encre}; }
#trailer .tr-logo { left: 50%; top: 44%; padding: 26px 70px 18px; background: ${ui.papier}; color: ${ui.encre};
  border: ${ui.trait * 2}px solid ${ui.encre}; border-radius: ${ui.rayon * 2}px; box-shadow: ${STICKER_SHADOW(2.2)};
  font-size: 250px; line-height: 0.9; letter-spacing: 0.02em; }
#trailer .tr-logo .p1 { color: ${joueurs.p1.principal}; }
#trailer .tr-logo .p2 { color: ${joueurs.p2.principal}; }
#trailer .tr-tag { left: 50%; top: 71%; color: ${ui.encre}; font-size: 76px; white-space: nowrap; }
#trailer .tr-sub { left: 50%; top: 83%; font-family: ${polices.texte}; font-weight: 800; font-size: 30px; letter-spacing: 0.2em; color: ${ui.encre}; opacity: 0.8; white-space: nowrap; }
#trailer .tr-sticker { width: 300px; height: 190px; }
#trailer .tr-sticker img { width: 100%; height: 100%; object-fit: contain; }
#trailer .tr-lines { inset: 0; }
`;

export interface Overlay {
  root: HTMLElement;
  /** Signale au rendu (bande-son) qu'un élément vient d'apparaître : un claquement par apparition. */
  onCue: ((name: string) => void) | null;
  newShot(): void;
  reset(): void;
  black(alpha: number): void;
  paper(alpha: number): void;
  flash(alpha: number): void;
  slam(text: string, u: number, o?: { x?: number; y?: number; tilt?: number; size?: number; accent?: string }): void;
  callout(title: string, sub: string, u: number): void;
  viewfinder(img: string, label: string, u: number, flashAt: number): void;
  card(weapon: Weapon, u: number): void;
  wave(t: number, level: number): void;
  logo(u: number, tagU: number, subU: number): void;
  stickers(imgs: string[], u: number, beat: number): void;
  speedLines(alpha: number, t: number): void;
}

/** Détoure une image sur fond magenta une seule fois (data URL mise en cache). */
const keyedCache = new Map<string, string>();
export async function keyed(url: string): Promise<string> {
  const hit = keyedCache.get(url);
  if (hit) return hit;
  const img = new Image();
  img.src = url;
  await img.decode();
  const data = chromaKey(img).toDataURL('image/png');
  keyedCache.set(url, data);
  return data;
}
export function keyedSync(url: string): string { return keyedCache.get(url) ?? url; }

export function createOverlay(): Overlay {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'trailer';
  document.body.appendChild(root);
  // Tout est dessiné pour 1920 px de large : on met à l'échelle de la fenêtre réelle (rendu en 1280 × 1,5).
  const fit = () => { root.style.setProperty('zoom', String(window.innerWidth / 1920)); };
  fit();
  window.addEventListener('resize', fit);

  const paperEl = el('div', 'tr-full', root);
  css(paperEl, { background: palette.fond });
  const photo = el('div', 'tr-photo', root);
  const photoImg = el('img', '', photo) as HTMLImageElement;
  const brackets = [0, 1, 2, 3].map(() => el('div', 'tr-bracket', root));
  const chip = el('div', 'tr-chip', root);
  const shutter = el('div', 'tr-shutter', root);
  const rec = el('div', 'tr-rec', root, '● SNAP');
  const vignette = el('div', 'tr-full', root);
  css(vignette, { background: `radial-gradient(ellipse at center, transparent 55%, ${ui.voile} 100%)` });
  const cardWrap = el('div', 'tr-card', root);
  let cardFor: Weapon | null = null;
  let cardInner: HTMLElement | null = null;
  const waveEl = el('div', 'tr-wave', root);
  const bars = Array.from({ length: 56 }, () => el('span', '', waveEl));
  const stickerEls = Array.from({ length: 8 }, () => { const s = el('div', 'tr-sticker', root); el('img', '', s); return s; });
  const logoEl = el('div', 'tr-logo', root);
  logoEl.innerHTML = '<span class="p1">BRO</span><span class="p2">SKIS</span>';
  const tag = el('div', 'tr-tag', root, 'Snap anything. Fight with it.');
  const sub = el('div', 'tr-sub', root, 'EVERY WEAPON IS A REAL OBJECT · POWERED BY GEMINI');
  const lines = el('canvas', 'tr-lines', root) as HTMLCanvasElement;
  const slamEl = el('div', 'tr-slam', root);
  const calloutEl = el('div', 'tr-callout', root);
  const flashEl = el('div', 'tr-full', root);
  css(flashEl, { background: palette.lumiere });
  const blackEl = el('div', 'tr-full', root);
  css(blackEl, { background: ui.encre });

  const show = (e: HTMLElement, on: boolean, display = 'block') => { e.style.display = on ? display : 'none'; };
  const all = Array.from(root.children) as HTMLElement[];
  const cued = new Set<string>();
  const cue = (name: string, key: string) => {
    if (cued.has(key)) return;
    cued.add(key);
    api.onCue?.(name);
  };

  const api: Overlay = {
    root,
    onCue: null,
    newShot() { cued.clear(); },
    reset() { for (const e of all) e.style.display = 'none'; },
    black(alpha) { show(blackEl, alpha > 0); blackEl.style.opacity = String(alpha); },
    paper(alpha) { show(paperEl, alpha > 0); paperEl.style.opacity = String(alpha); },
    flash(alpha) { show(flashEl, alpha > 0.01); flashEl.style.opacity = String(clamp01(alpha)); if (alpha >= 0.99) cue('ui:flash', 'flash'); },

    slam(text, u, o = {}) {
      if (u < 0) return;
      show(slamEl, true);
      cue('ui:slam', `slam:${text}`);
      const k = clamp01(u / 0.22);
      const scale = 1.4 - 0.4 * ease.outBack(k, 2.2);
      const tilt = (o.tilt ?? -3) + (1 - k) * -6;
      const size = o.size ?? 150;
      if (slamEl.dataset.text !== text) {
        slamEl.dataset.text = text;
        slamEl.innerHTML = text.replace(/\*(.+?)\*/g, `<b style="color:${o.accent ?? joueurs.p1.principal}">$1</b>`);
      }
      css(slamEl, {
        'font-size': `${size}px`,
        transform: `translate(-50%, -50%) translate(${(o.x ?? 0) * 960}px, ${(o.y ?? 0) * 540}px) rotate(${tilt}deg) scale(${scale})`,
      });
    },

    callout(title, subText, u) {
      if (u < 0) return;
      show(calloutEl, true);
      cue('ui:callout', `callout:${title}`);
      calloutEl.innerHTML = `${title}<small>${subText}</small>`;
      const k = ease.outQuint(clamp01(u / 0.18));
      css(calloutEl, { transform: `translateX(${(1 - k) * -900}px) rotate(-4deg) skewX(${(1 - k) * -18}deg)` });
    },

    viewfinder(img, label, u, flashAt) {
      show(paperEl, true); paperEl.style.opacity = '1';
      show(vignette, true); show(rec, true); show(shutter, true, 'block');
      show(photo, true);
      if (photoImg.src !== img) photoImg.src = img;
      const lift = clamp01((u - flashAt) / 0.25);
      const bob = Math.sin(u * 3.1) * 6 * (1 - lift);
      css(photo, {
        transform: `translate(-50%, -50%) translateY(${bob - lift * 30}px) rotate(${lift * -4}deg) scale(${1 + ease.outBack(lift, 2) * 0.1})`,
        filter: lift > 0 ? `${VINYL_OUTLINE(9 * lift)} drop-shadow(18px 22px 0 ${ui.encre})` : 'saturate(0.9)',
      });
      // Crochets de mise au point : se referment sur l'objet en 3 petits sauts (verrouillage façon appareil photo).
      const lock = Math.floor(clamp01(u / 0.55) * 3) / 3;
      const spreadX = 560 - lock * 150;
      const spreadY = 330 - lock * 70;
      const corners: [number, number, string][] = [[-1, -1, 'top left'], [1, -1, 'top right'], [-1, 1, 'bottom left'], [1, 1, 'bottom right']];
      brackets.forEach((b, i) => {
        const [sx, sy] = corners[i];
        show(b, u < flashAt + 0.05);
        const w = `${Math.max(6, 11 - lock * 3)}px`;
        css(b, {
          left: `calc(50% + ${sx * spreadX}px - 45px)`, top: `calc(50% + ${sy * spreadY}px - 45px)`,
          'border-top-width': sy < 0 ? w : '0', 'border-bottom-width': sy > 0 ? w : '0',
          'border-left-width': sx < 0 ? w : '0', 'border-right-width': sx > 0 ? w : '0',
          'border-color': lock >= 1 ? ui.alerte : ui.vinyle,
        });
      });
      // Étiquette de reconnaissance (l'IA dit ce qu'elle voit), tapée lettre par lettre.
      const typed = Math.floor(clamp01((u - 0.45) / 0.4) * label.length);
      if (typed > 0) {
        show(chip, true);
        chip.innerHTML = `${label.slice(0, typed)}${typed < label.length ? '▌' : ' <i>✓</i>'}`;
        css(chip, { transform: 'translate(-50%, 0)' });
      }
      css(shutter, { transform: `translate(-50%, 0) scale(${u >= flashAt && u < flashAt + 0.12 ? 0.86 : 1})` });
    },

    card(weapon, u) {
      if (u < 0) return;
      show(cardWrap, true);
      cue('ui:card', 'card');
      if (cardFor !== weapon) {
        cardFor = weapon;
        cardWrap.innerHTML = '';
        const c = renderWeaponCard(weapon, { reveal: false });
        cardWrap.appendChild(c);
        cardInner = c;
      }
      const flip = ease.outBack(clamp01(u / 0.45), 1.3);
      const slide = u * 90; // travelling latéral continu
      css(cardWrap, { transform: `translate(-50%, -50%) translate(${200 - slide}px, 20px) scale(1.7)` });
      if (cardInner) css(cardInner, { transform: `rotateY(${(1 - flip) * 180}deg) rotateZ(${-3 + (1 - flip) * 8}deg)`, 'transform-style': 'preserve-3d' });
    },

    wave(t, level) {
      show(waveEl, true, 'flex');
      css(waveEl, { transform: 'translate(-50%, 0)' });
      bars.forEach((b, i) => {
        const x = i / bars.length;
        const env = Math.sin(Math.PI * x) ** 0.6;
        const n = Math.abs(Math.sin(t * 17 + i * 1.3) * 0.6 + Math.sin(t * 29 + i * 0.7) * 0.4);
        b.style.height = `${Math.max(12, 170 * level * env * (0.25 + 0.75 * n))}px`;
      });
    },

    logo(u, tagU, subU) {
      if (u >= 0) {
        show(logoEl, true);
        cue('ui:logo', 'logo');
        const k = clamp01(u / 0.3);
        css(logoEl, { transform: `translate(-50%, -50%) rotate(${-2 - (1 - k) * 10}deg) scale(${1.5 - 0.5 * ease.outBack(k, 2.4)})` });
      }
      if (tagU >= 0) {
        show(tag, true);
        const k = clamp01(tagU / 0.25);
        css(tag, { transform: `translate(-50%, -50%) translateY(${(1 - ease.outBack(k, 1.8)) * 60}px)`, opacity: String(k) });
      }
      if (subU >= 0) { show(sub, true); css(sub, { transform: 'translate(-50%, -50%)', opacity: String(clamp01(subU / 0.3)) }); }
    },

    stickers(imgs, u, beat) {
      const spots: [number, number, number][] = [[14, 20, -12], [84, 22, 9], [10, 70, 8], [88, 72, -10], [30, 88, 5], [70, 90, -6], [26, 10, 7], [74, 8, -8]];
      stickerEls.forEach((s, i) => {
        const img = imgs[i % imgs.length];
        const since = u - i * beat * 0.5;
        if (since < 0 || !img) { show(s, false); return; }
        show(s, true);
        cue('ui:sticker', `sticker:${i}`);
        const im = s.firstChild as HTMLImageElement;
        if (im.src !== img) im.src = img;
        const k = clamp01(since / 0.16);
        const [x, y, r] = spots[i];
        css(s, {
          left: `${x}%`, top: `${y}%`,
          transform: `translate(-50%, -50%) rotate(${r}deg) scale(${1.5 - 0.5 * ease.outBack(k, 2.6)})`,
          filter: `${VINYL_OUTLINE(7)} drop-shadow(10px 12px 0 ${ui.encre})`,
        });
      });
    },

    speedLines(alpha, t) {
      if (alpha <= 0.01) return;
      show(lines, true);
      if (lines.width !== 960) { lines.width = 960; lines.height = 540; }
      const g = lines.getContext('2d')!;
      g.clearRect(0, 0, 960, 540);
      g.strokeStyle = ui.vinyle;
      g.globalAlpha = alpha;
      g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const y = ((i * 97.3 + t * 900) % 560) - 10;
        const x = ((i * 211.7) % 960);
        const len = 120 + ((i * 53) % 220);
        g.lineWidth = 2 + (i % 3);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
      }
      css(lines, { width: '100%', height: '100%' });
    },
  };
  return api;
}
