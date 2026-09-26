// Onomatopée-sticker (règle 6, consigne DA du 26/09) : chaque coup colle un mot ("BONK", "KABOOM"...) en
// sticker sur le décor, qui Y RESTE (jusqu'à `rendu.traces.max`, le plus ancien retiré — FIFO). Dessiné en
// canvas (police d'affichage, contour encre, fond vinyle) plutôt qu'en géométrie 3D de lettres : plus simple,
// cohérent avec le langage "sticker" du reste du jeu, et pas de police à embarquer. Remplace l'idée initiale
// de lettres 3D qui rebondissent (`onomato.js` de bagarre-de-taverne) : ce n'est plus ce que veut la DA.
import * as THREE from 'three';
import { polices, rendu } from '../../art/tokens.js';
import type { Category, Ctx } from '../../core/types';
import { LOCAL_TOKENS } from '../localTokens';
import { excludeFromOcclusion } from '../registry';

const WORDS: Record<Category, string[]> = {
  blaster: ['PEW', 'ZAP', 'BZZT'],
  grenade: ['KABOOM', 'BOOM'],
  throwable: ['BONK', 'WHACK'],
  shield: ['CLANG', 'PING'],
};
const CANVAS_W = 512;
const CANVAS_H = 256;

function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawSticker(word: string, accent: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const c = canvas.getContext('2d')!;
  const fontSize = Math.round(Math.min(150, 1500 / Math.max(3, word.length)));
  c.font = `900 ${fontSize}px ${polices.titre}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  const margin = 14;
  roundRectPath(c, margin, margin, CANVAS_W - margin * 2, CANVAS_H - margin * 2, 28);
  c.fillStyle = rendu.contour.vinyle;
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = rendu.contour.encre;
  c.stroke();

  c.lineWidth = fontSize * 0.16;
  c.lineJoin = 'round';
  c.strokeStyle = rendu.contour.encre;
  c.strokeText(word, CANVAS_W / 2, CANVAS_H / 2 + 4);
  c.fillStyle = accent;
  c.fillText(word, CANVAS_W / 2, CANVAS_H / 2 + 4);
  return canvas;
}

const textureCache = new Map<string, THREE.CanvasTexture>();
function stickerTexture(word: string, accent: string): THREE.CanvasTexture {
  const key = `${word}|${accent}`;
  let tex = textureCache.get(key);
  if (!tex) {
    tex = new THREE.CanvasTexture(drawSticker(word, accent));
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, tex);
  }
  return tex;
}

export interface OnomatoSystem {
  /** Colle une onomatopée au sol près de `pos`, avec la couleur `accent` (typiquement weapon.palette[0]). */
  spawn(category: Category, pos: [number, number, number], accent: string): void;
}

export function installOnomato(ctx: Ctx): OnomatoSystem {
  const root = new THREE.Group();
  root.name = 'la-onomato';
  ctx.three.scene.add(root);
  excludeFromOcclusion(root);

  const alive: THREE.Group[] = [];
  const size = rendu.traces.taille;
  const aspect = CANVAS_W / CANVAS_H;

  function spawn(category: Category, pos: [number, number, number], accent: string): void {
    const word = pick(WORDS[category] ?? WORDS.blaster);
    const tex = stickerTexture(word, accent);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size * aspect, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.z = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * rendu.traces.alea);
    const flat = new THREE.Group();
    flat.rotation.x = -Math.PI / 2;
    flat.add(mesh);
    const wrap = new THREE.Group();
    wrap.position.set(pos[0], 0.02 + alive.length * 0.0005, pos[2]);
    wrap.add(flat);
    wrap.scale.setScalar(0.01);
    root.add(wrap);
    alive.push(wrap);

    // Petite claque : pop-in élastique (durees.snap), pas un simple fondu (design system §5).
    const start = performance.now();
    const dur = 220;
    const anim = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const k = t < 1 ? 1 + 0.3 * Math.sin(t * Math.PI) * (1 - t) : 1;
      wrap.scale.setScalar(k);
      if (t < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);

    while (alive.length > LOCAL_TOKENS.onomato.maxAlive) {
      const oldest = alive.shift();
      oldest?.removeFromParent();
    }
  }

  return { spawn };
}
