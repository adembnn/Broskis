// Réalisateur du trailer : enchaîne les plans de timeline.js, prépare chaque plan hors caméra (pré-roulage
// non capturé), puis pilote caméra + couche 2D image par image. `window.trailer` dit au rendu quelle image garder.
import * as THREE from 'three';
import { maps } from '../art/tokens.js';
import type { Ctx, FighterDef, PlayerId, Weapon } from '../core/types';
import { FIGHTER_PRESETS } from '../ui/presets';
import { applyPose, type Pose } from './cam';
import { createOverlay, keyed, type Overlay } from './overlay';
import { SHOTS, type Shot } from './shots';
import { planFrames } from './timeline.js';

interface Planned { id: string; index: number; start: number; end: number; beats: number; trim?: number }

export interface TrailerEvent { name: string; t: number; data: unknown }

export interface Env {
  ctx: Ctx;
  o: Overlay;
  fps: number;
  /** Armes des 8 préréglages (clé = nom du fichier sticker, ex. « banana »), copiées à chaque plan. */
  weapon(key: string): Weapon;
  fighter(model: string): FighterDef;
  /** Événements du jeu reçus pendant ce plan (temps local en s, négatif pendant le pré-roulage). */
  events: TrailerEvent[];
  first(name: string): TrailerEvent | undefined;
  p(i: PlayerId): THREE.Vector3;
  scratch: Record<string, unknown>;
  cut: string;
  trim: number;
}

declare global {
  interface Window {
    trailer?: { ready: boolean; capture: boolean; done: boolean; frame: number; events: { frame: number; name: string; data?: unknown }[] };
    __vt?: { realNow(): number };
  }
}

const RECORDED = ['fire', 'hit', 'parry:result', 'ko', 'projectile:spawn', 'shield:placed', 'move:jump', 'crate:land', 'scan:result'] as const;

export async function startTrailer(ctx: Ctx, opts: { cut: string; fps: number; shots: string | null }): Promise<void> {
  const plan = planFrames(opts.cut, opts.fps) as Planned[];
  const [from, to] = (opts.shots ?? `0-${plan.length - 1}`).split('-').map(Number);
  const todo = plan.filter((s) => s.index >= from && s.index <= to);
  const api = { ready: false, capture: false, done: false, frame: -1, events: [] as { frame: number; name: string; data?: unknown }[] };
  window.trailer = api;

  ctx.three.uiRoot.style.visibility = 'hidden'; // l'interface du jeu est remplacée par la couche du trailer
  // Brouillon : `&px=0.5` rend la 3D en moitié de résolution (bien plus rapide), la couche 2D reste nette.
  const px = Number(new URLSearchParams(location.search).get('px'));
  if (px > 0) { ctx.three.renderer.setPixelRatio(px); window.dispatchEvent(new Event('resize')); }
  const o = createOverlay();
  o.onCue = (name) => { if (shot && local >= 0) api.events.push({ frame: todo[si].start + local, name }); };

  // Armes réelles (stickers Nano Banana + répliques) : public/assets/presets/presets.json.
  const presets: (Weapon & { weaponName?: string })[] = await fetch('/assets/presets/presets.json').then((r) => r.json());
  const byKey = new Map<string, Weapon>();
  for (const p of presets) {
    const key = (p.stickerUrl ?? p.id).split('/').pop()!.replace(/\.(jpg|png)$/, '').replace(/^preset-/, '');
    byKey.set(key, { ...p, name: p.weaponName ?? p.name, source: 'preset', cooldown: 0 });
  }
  await Promise.all([...byKey.values()].map((w) => (w.stickerUrl ? keyed(w.stickerUrl).catch(() => '') : '')));
  await waitForFonts();

  const env: Env = {
    ctx, o, fps: opts.fps, cut: opts.cut, trim: 0,
    weapon(key) {
      const w = byKey.get(key);
      if (!w) throw new Error(`[trailer] arme inconnue : ${key}`);
      return { ...w, stats: { ...w.stats }, lines: { ...w.lines }, palette: [...w.palette] as [string, string], cooldown: 0 };
    },
    fighter(model) {
      const f = FIGHTER_PRESETS.find((x) => x.model === model) ?? FIGHTER_PRESETS[0];
      return { ...f };
    },
    events: [],
    first(name) { return env.events.find((e) => e.name === name); },
    p(i) { const q = ctx.state.players[i].pos; return new THREE.Vector3(q[0], q[1], q[2]); },
    scratch: {},
  };

  // Horloge du plan (en images) : négative pendant le pré-roulage, 0 = première image capturée.
  let si = 0;
  let shot: Shot | null = null;
  let local = 0;
  let prerollFrames = 0;
  let waitingUntilReal = 0;
  let setupPending: Promise<void> | null = null;
  let actionsDone = new Set<number>();
  const localT = () => local / opts.fps;

  for (const name of RECORDED) {
    ctx.bus.on(name, (data: unknown) => {
      if (!shot) return;
      env.events.push({ name, t: localT(), data });
      if (local >= 0) api.events.push({ frame: todo[si].start + local, name, data: slim(data) });
    });
  }

  // Pas de rendu 3D pendant le pré-roulage ni derrière un plan 100 % couche 2D : c'est le poste le plus cher.
  const render = ctx.three.render;
  let renderThis = false;
  ctx.three.render = () => { if (renderThis) render(); };
  const sample = new URLSearchParams(location.search).get('sample') === '1';

  function begin(): void {
    const p = todo[si];
    shot = SHOTS[p.id] ?? SHOTS[p.id.replace(/\d+$/, '')] ?? null;
    if (!shot) throw new Error(`[trailer] plan sans définition : ${p.id}`);
    env.events = [];
    env.scratch = {};
    o.newShot();
    env.trim = p.trim ?? 0;
    prerollFrames = Math.round((shot.preroll ?? 0) * opts.fps);
    local = -prerollFrames;
    actionsDone = new Set();
    waitingUntilReal = 0;
    ctx.loop.clearSlow('trailer');
    setupPending = shot.setup ? Promise.resolve(shot.setup(env)).then(() => {
      if (shot?.settleMs) waitingUntilReal = (window.__vt?.realNow() ?? 0) + shot.settleMs;
      setupPending = null;
    }) : null;
  }

  // Le ciel physique (three/addons Sky, lot LDA2) sature en blanc face au soleil rasant : masqué dans le
  // trailer, le fond retombe sur la couleur de brouillard de la map (tokens `maps.*.ciel`). `?sky=1` le garde.
  const keepSky = new URLSearchParams(location.search).get('sky') === '1';
  const skies: THREE.Object3D[] = [];
  ctx.three.scene.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (mat && !Array.isArray(mat) && mat.uniforms && 'sunPosition' in mat.uniforms) skies.push(obj);
  });

  // À la place : le dégradé de ciel de la direction artistique (tokens `maps.<map>.ciel` : haut → horizon → bas).
  const gradients = new Map<string, THREE.Texture>();
  const skyGradient = (mapId: string): THREE.Texture | null => {
    const c = (maps as Record<string, { ciel?: { haut: string; horizon: string; bas: string } }>)[mapId]?.ciel;
    if (!c) return null;
    let tex = gradients.get(mapId);
    if (!tex) {
      const cv = document.createElement('canvas');
      cv.width = 4; cv.height = 256;
      const g = cv.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, c.haut); grad.addColorStop(0.58, c.horizon); grad.addColorStop(1, c.bas);
      g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      gradients.set(mapId, tex);
    }
    return tex;
  };

  function frame(): void {
    if (!keepSky) {
      for (const s of skies) s.visible = false;
      const bg = skyGradient(ctx.state.mapId);
      if (bg && ctx.three.scene.background !== bg) ctx.three.scene.background = bg;
    }
    if (!shot?.parryLook) { ctx.three.canvas.style.transition = 'none'; ctx.three.canvas.style.filter = 'none'; }
    if (api.done) { api.capture = false; renderThis = false; return; }
    if (!shot) begin();
    if (!shot) return;
    // Préparation : on attend la fin du setup (chargements réels) avant de faire courir le pré-roulage.
    if (setupPending || (waitingUntilReal && (window.__vt?.realNow() ?? 0) < waitingUntilReal)) { api.capture = false; renderThis = false; return; }
    const t = localT();
    shot.at?.forEach(([at, fn], i) => {
      if (!actionsDone.has(i) && t >= at) { actionsDone.add(i); try { fn(env); } catch (e) { console.error(`[trailer] ${todo[si].id}`, e); } }
    });
    shot.every?.(env, t);
    const p = todo[si];
    const dur = (p.end - p.start) / opts.fps;
    const pose: Pose | null = shot.camera ? shot.camera(env, t, dur) : null;
    if (pose) applyPose(ctx.three.camera, pose);
    o.reset();
    if (local >= 0) {
      shot.overlay?.(env, t, dur);
      api.capture = !sample || local === Math.floor((p.end - p.start) / 2);
      api.frame = p.start + local;
    } else {
      api.capture = false;
    }
    renderThis = api.capture && shot.showGame !== false;
    local++;
    if (local >= 0 && p.start + local >= p.end) {
      // Dernière image de ce plan : elle est capturée après ce rendu, puis on passe au suivant.
      shot.cleanup?.(env);
      si++;
      shot = null;
      if (si >= todo.length) api.done = true;
    }
  }

  // Juste après la caméra du jeu (300) et AVANT les effets qui se calent sur la caméra (smash-fx 410,
  // parry-fx…) : sinon leurs calques plein écran restent posés devant l'ancienne caméra, en plein décor.
  ctx.loop.addSystem('trailer', () => frame(), 305);
  api.ready = true;
}

function slim(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ['player', 'target', 'attacker', 'crit', 'grade', 'pos', 'damage', 'cause']) if (k in d) out[k] = d[k];
  if (d.weapon && typeof d.weapon === 'object') {
    const w = d.weapon as Weapon;
    out.weapon = { category: w.category, trait: w.trait, name: w.name };
  }
  return out;
}

/** Les textes du trailer sont en Lilita One / Nunito (tokens `polices`) : on attend que la feuille Google Fonts
 * (injectée par src/ui/theme.ts) soit chargée PUIS les fontes elles-mêmes, sinon les premiers plans partent en
 * police de secours. 8 s maximum : sans réseau, on rend quand même. */
async function waitForFonts(): Promise<void> {
  const deadline = new Promise((r) => setTimeout(r, 8000));
  const load = async () => {
    let link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800&display=swap';
      document.head.appendChild(link);
    }
    if (!link.sheet) await new Promise((r) => { link!.addEventListener('load', r, { once: true }); link!.addEventListener('error', r, { once: true }); });
    await Promise.all([document.fonts.load('400 120px "Lilita One"'), document.fonts.load('800 30px "Nunito"'), document.fonts.load('700 30px "Nunito"')]);
    await document.fonts.ready;
  };
  try { await Promise.race([load(), deadline]); } catch { /* police de secours */ }
}
