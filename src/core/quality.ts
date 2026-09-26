// Qualité graphique (lot LPERF) : les jurés jouent sur LEURS portables (puce Intel, Apple, AMD intégrée).
// 3 paliers :
//   haut  : tout (post-traitement bloom, ombres portées, ratio de pixels du jeu) ;
//   moyen : rendu direct dans le canvas (sans bloom), ombres portées, ratio de pixels 1 ;
//   bas   : rendu direct, SANS ombres portées (une ombre-disque sous chaque perso), ratio 1, particules ÷ 2,
//           sans le décor lointain instancié (userData.lointain, posé par src/scene/maps/engine.ts).
// Choix automatique : nom de la puce (WEBGL_debug_renderer_info), puis micro-banc de remplissage à l'écran-titre
// (~0,3 s de GPU, résultat gardé par puce dans le navigateur). En match, résolution dynamique (moyen et bas) :
// image médiane > 18 ms pendant 1 s → échelle 1 → 0,85 → 0,7 → 0,6 ; remonte d'un cran après 5 s stables
// (10, 20, 40 s après un essai raté). Encore trop lent à 0,6 : le palier baisse (shaders compilés d'abord).
// Mesuré (plan/rendus/LPERF.md) : sur la puce Intel UHD, le post-traitement seul coûte ~20 ms par image.
// Réglages : ?q=haut|moyen|bas (ou high|medium|low), écran Settings via setQuality('auto'|'high'|'medium'|'low').
import * as THREE from 'three';
import { rendu } from '../art/tokens.js';
import type { Bus } from './bus';
import type { Ctx } from './types';

export type Palier = 'haut' | 'moyen' | 'bas';
/** Noms de l'écran Settings (Graphics: Auto / High / Medium / Low). */
export type QualityLevel = 'auto' | 'high' | 'medium' | 'low';
/** Chemin de rendu lu par core/ctx.ts : 'haute' = post-traitement, 'basse' = rendu direct dans le canvas. */
export type Qualite = 'haute' | 'basse';

export interface QualiteCtl {
  /** Chemin de rendu (voir Qualite). */
  niveau: Qualite;
  palier: Palier;
  /** Échelle de résolution dynamique (1 = pleine définition du palier). */
  echelle: number;
  /** Temps d'image médian de la dernière fenêtre de 1 s en match (ms). */
  medianeMs: number | null;
  /** Nom de la puce graphique et coût mesuré par le micro-banc (ms par plein écran 1080p). */
  gpu: string;
  banc: number | null;
  /** Compatibilité (banc, débogage) : 'haute' = haut, 'basse' = moyen. */
  set(n: Qualite): void;
  /** Mêmes fonctions que les exports (tests par script : window.__qualite.setQuality('low')). */
  setQuality(level: QualityLevel | Palier): void;
  getQuality(): ReturnType<typeof getQuality>;
  /** Appelée à chaque image traitée par le système de rendu (core/ctx.ts). */
  frame(real: number): void;
}

export const PHASES_DE_JEU = new Set<string>(['move', 'countdown', 'fight']);
/** Phases pendant lesquelles la résolution s'adapte (le match, pas les menus). */
const PHASES_MATCH = new Set<string>(['move', 'aim', 'resolve', 'turn-intro', 'snap-time', 'countdown', 'fight', 'ko']);

// Mesuré sur la puce Intel UHD, écran scindé, palier bas : sans le décor lointain, 201 → 133 appels de dessin,
// image médiane 34,7 → 20,9 ms (voir plan/rendus/LPERF.md).
const PALIERS: Record<Palier, { postfx: boolean; ombres: boolean; ratio1: boolean; particules: number; lointain: boolean }> = {
  haut: { postfx: true, ombres: true, ratio1: false, particules: 1, lointain: true },
  moyen: { postfx: false, ombres: true, ratio1: true, particules: 1, lointain: true },
  bas: { postfx: false, ombres: false, ratio1: true, particules: 0.5, lointain: false },
};
const ORDRE: Palier[] = ['haut', 'moyen', 'bas'];
const ECHELLES = [1, 0.85, 0.7, 0.6];
const SEUIL_MS = 18;
const ATTENTE_S = 1.5; // après le début du match : préchauffe des shaders (shaders.ts), on ne la compte pas
const MONTEE_S = 5;
const CLE_REGLAGE = 'broskis.graphics.v1';
const CLE_BANC = 'broskis.gpubench.v1';
// Micro-banc : ms par plein écran 1080p (dessin plein cadre, ~ un pixel de décor toon), aller-retour GPU déduit.
// Étalonné sur le PC d'Adem : NVIDIA RTX 5060 ≈ 0,1 ; Intel UHD (16 unités) ≈ 1,5 à 4 selon la charge.
const BANC_HAUT = 0.35;
const BANC_MOYEN = 1;

const EN: Record<Palier, Exclude<QualityLevel, 'auto'>> = { haut: 'high', moyen: 'medium', bas: 'low' };
const FR: Record<string, Palier> = {
  haut: 'haut', high: 'haut', haute: 'haut', moyen: 'moyen', medium: 'moyen', basse: 'moyen', bas: 'bas', low: 'bas',
};

/** Palier probable d'après le nom de la puce (avant tout banc). */
export function palierDuNom(nom: string): Palier {
  const s = nom.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(s)) return 'bas';
  if (/nvidia|geforce|quadro|radeon rx|radeon pro|arc\(tm\) a\d|arc a\d|apple m\d (pro|max|ultra)/.test(s)) return 'haut';
  if (/apple|iris|arc|radeon|vega|adreno|mali/.test(s)) return 'moyen';
  if (/intel/.test(s)) return 'bas'; // Intel UHD / HD Graphics : les plus faibles
  return 'moyen';
}

// --- état partagé entre createQualite (ctx.ts) et installQualite (main.ts) ---
let q: QualiteCtl | null = null;
let ctxRef: Ctx | null = null;
let reglage: QualityLevel = 'auto';
let bus: Bus | null = null;
let preparerRendu: ((n: Qualite) => Promise<unknown>) | null = null;
const ecouteurs = new Set<() => void>();
let facteurParticules = 1;

/** Facteur à appliquer au nombre de particules d'une gerbe (0,5 en palier bas). */
export function particules(): number { return facteurParticules; }

function lireReglage(): QualityLevel {
  const url = new URLSearchParams(location.search).get('q');
  if (url && FR[url]) return EN[FR[url]];
  try {
    const v = localStorage.getItem(CLE_REGLAGE);
    if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') return v;
  } catch { /* sans stockage */ }
  return 'auto';
}

/** Réglage joueur (écran Settings). 'auto' relance le choix automatique (nom de la puce + banc mémorisé). */
export function setQuality(level: QualityLevel | Palier): void {
  const l: QualityLevel = level === 'auto' ? 'auto' : EN[FR[level] ?? 'moyen'];
  reglage = l;
  try { localStorage.setItem(CLE_REGLAGE, l); } catch { /* sans stockage : vaut pour la session */ }
  if (!q) return;
  appliquerPalier(l === 'auto' ? palierAuto() : FR[l]);
}

export function getQuality(): { setting: QualityLevel; active: Exclude<QualityLevel, 'auto'>; scale: number; gpu: string; frameMs: number | null } {
  return {
    setting: reglage,
    active: EN[q?.palier ?? 'haut'],
    scale: q?.echelle ?? 1,
    gpu: q?.gpu ?? '',
    frameMs: q?.medianeMs ?? null,
  };
}

/** Prévient l'interface quand le palier ou l'échelle change. Renvoie la désinscription. */
export function onQualityChange(fn: () => void): () => void {
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
}

function prevenir(): void { for (const fn of ecouteurs) { try { fn(); } catch { /* interface */ } } }

let palierBanc: Palier | null = null;
/** Carte dédiée reconnue : haut sauf banc catastrophique ; sinon le banc décide (le nom seul en attendant). */
function palierAuto(): Palier {
  const nom = palierDuNom(q?.gpu ?? '');
  if (nom === 'haut') return palierBanc === 'bas' ? 'moyen' : 'haut';
  return palierBanc ?? nom;
}

/** Crée le contrôleur (appelé par core/ctx.ts). `preparer('basse')` compile les shaders du rendu direct. */
export function createQualite(b: Bus, preparer: (n: Qualite) => Promise<unknown>): QualiteCtl {
  bus = b;
  preparerRendu = preparer;
  reglage = lireReglage();
  const fenetre: number[] = [];
  let cumul = 0;
  let dernier = 0;
  let attente = 0;
  let stable = 0;
  let montee = MONTEE_S;
  let essai = 99; // fenêtres depuis la dernière remontée (un « lent » juste après = essai raté)
  let enMatch = false;

  q = {
    niveau: 'haute',
    palier: 'haut',
    echelle: 1,
    medianeMs: null,
    gpu: '',
    banc: null,
    set(n) { setQuality(n === 'haute' ? 'high' : 'medium'); },
    setQuality: (l) => setQuality(l),
    getQuality: () => getQuality(),
    frame() {
      const t = performance.now();
      const d = dernier ? t - dernier : 0;
      dernier = t;
      if (!enMatch || !d || d > 250) return; // menus, reprise après un onglet caché
      if (attente > 0) { attente -= d / 1000; return; }
      fenetre.push(d);
      cumul += d;
      if (cumul < 1000) return;
      fenetre.sort((a, x) => a - x);
      const med = fenetre[fenetre.length >> 1];
      fenetre.length = 0;
      cumul = 0;
      q!.medianeMs = med;
      essai += 1;
      if (med > SEUIL_MS) {
        stable = 0;
        if (essai <= 2) montee = Math.min(montee * 2, 40); // la remontée n'a pas tenu : on attendra plus
        plusLeger();
      } else if (++stable >= montee && q!.echelle < 1) {
        stable = 0;
        essai = 0;
        changerEchelle(-1);
      }
    },
  };
  b.on('phase:change', ({ to }) => {
    const avant = enMatch;
    enMatch = PHASES_MATCH.has(to);
    if (enMatch && !avant) { attente = ATTENTE_S; fenetre.length = 0; cumul = 0; stable = 0; }
  });
  window.__qualite = q;
  return q;
}

/** Un cran plus léger : d'abord la résolution (moyen, bas), puis le palier (en auto seulement). */
function plusLeger(): void {
  if (!q) return;
  if (q.palier !== 'haut' && changerEchelle(+1)) return;
  if (reglage !== 'auto') return;
  const i = ORDRE.indexOf(q.palier);
  if (i < ORDRE.length - 1) appliquerPalier(ORDRE[i + 1], true);
}

function changerEchelle(sens: 1 | -1): boolean {
  if (!q) return false;
  const i = ECHELLES.indexOf(q.echelle);
  const j = Math.max(0, Math.min(ECHELLES.length - 1, i + sens));
  if (j === i) return false;
  q.echelle = ECHELLES[j];
  appliquerRatio(true);
  prevenir();
  return true;
}

// --- application au rendu (installQualite) ---
let ratioJeu = 1;

function ratioVoulu(): number | null {
  if (!q || !PALIERS[q.palier].ratio1) return null; // haut : ratio du jeu (ctx.ts / écran scindé)
  return q.echelle;
}

function appliquerRatio(signaler: boolean): void {
  const r = ctxRef?.three.renderer;
  if (!r || !q) return;
  const voulu = ratioVoulu() ?? ratioJeu;
  if (Math.abs(r.getPixelRatio() - voulu) < 1e-3) return;
  r.setPixelRatio(voulu);
  // Compositeur, particules (taille en pixels), interface : tous écoutent 'resize'.
  if (signaler) window.dispatchEvent(new Event('resize'));
}

/** Décor lointain instancié affiché ou non (palier bas : caché). */
function appliquerLointain(racine: THREE.Object3D, visible: boolean): void {
  racine.traverse((o) => { if (o.userData.lointain) o.visible = visible; });
}

/** Réapplique ombres et décor lointain à tout ce que la map a posé depuis. */
function reappliquer(): void {
  if (!q || !ctxRef) return;
  appliquerOmbres(ctxRef.three.scene, PALIERS[q.palier].ombres);
  appliquerLointain(ctxRef.three.scene, PALIERS[q.palier].lointain);
}

/** Ombres portées coupées (palier bas) : castShadow des lumières, ce qui recompile les matériaux éclairés. */
function appliquerOmbres(racine: THREE.Object3D, ombres: boolean): void {
  racine.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight) return;
    if (!ombres && l.castShadow) { l.userData.lperfOmbre = true; l.castShadow = false; }
    if (ombres && l.userData.lperfOmbre) { l.castShadow = true; delete l.userData.lperfOmbre; }
  });
}

let preparation = 0;
/** Change de palier. `compiler` : compile d'abord les shaders du nouveau palier en tâche de fond (en match). */
function appliquerPalier(p: Palier, compiler = false): void {
  if (!q || !ctxRef) return;
  const ctx = ctxRef;
  const jeton = ++preparation;
  const finir = () => {
    if (jeton !== preparation || !q) return;
    const def = PALIERS[p];
    q.palier = p;
    q.niveau = def.postfx ? 'haute' : 'basse';
    if (!def.ratio1) q.echelle = 1;
    facteurParticules = def.particules;
    appliquerOmbres(ctx.three.scene, def.ombres);
    appliquerLointain(ctx.three.scene, def.lointain);
    disques.visible = !def.ombres;
    appliquerRatio(true);
    console.info(`[qualité] palier ${p} · échelle ${q.echelle} · ${q.gpu || 'puce inconnue'}${q.banc != null ? ` · banc ${q.banc.toFixed(2)} ms` : ''}`);
    prevenir();
  };
  if (!compiler) { finir(); return; }
  // Shaders du nouveau palier compilés sans figer l'image : rendu direct (sortie sRGB) et, pour le bas,
  // variantes sans ombre (castShadow coupé seulement pendant la partie synchrone de compileAsync).
  const { renderer, scene, camera } = ctx.three;
  const def = PALIERS[p];
  const avant = renderer.getRenderTarget();
  if (!def.postfx) renderer.setRenderTarget(null);
  if (!def.ombres) appliquerOmbres(scene, false);
  const promesse = renderer.compileAsync(scene, camera);
  if (!def.ombres) appliquerOmbres(scene, true);
  renderer.setRenderTarget(avant);
  void Promise.all([promesse, !def.postfx && preparerRendu ? preparerRendu('basse') : null]).catch(() => {}).then(finir);
}

// --- ombres-disques (palier bas) ---
const disques = new THREE.Group();
disques.name = 'lperf-ombres-disques';

function installerDisques(ctx: Ctx): void {
  const geo = new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: rendu.contour.encre, transparent: true, opacity: rendu.ombres.tache, depthWrite: false });
  const d = [new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat)];
  for (const m of d) { m.renderOrder = 1; m.visible = false; disques.add(m); }
  disques.visible = false;
  ctx.three.scene.add(disques);
  // Hauteur du sol sans lancer de rayon (trop cher sur les grosses maps : 2,4 ms par image mesurées) : c'est la
  // hauteur des pieds quand le perso ne monte ni ne descend ; en l'air, on garde la dernière. Tombe dans le vide
  // (1 m sous son dernier sol) : plus d'ombre.
  const sol = [0, 0];
  const avant = [0, 0];
  const calme = [0, 0];
  ctx.loop.addSystem('lperf-ombres-disques', (_dt, real) => {
    if (!disques.visible) return;
    for (const p of [0, 1] as const) {
      const pos = ctx.state.players[p]?.pos;
      const m = d[p];
      if (!pos || !ctx.state.players[p].alive) { m.visible = false; continue; }
      const vy = real > 0 ? (pos[1] - avant[p]) / real : 0;
      avant[p] = pos[1];
      calme[p] = Math.abs(vy) < 0.25 ? calme[p] + 1 : 0;
      if (calme[p] >= 6) sol[p] = pos[1]; // ~0,1 s immobile en hauteur : pas le sommet d'un saut
      const haut = pos[1] - sol[p];
      m.visible = haut > -1;
      m.position.set(pos[0], sol[p] + 0.03, pos[2]);
      m.scale.setScalar(Math.max(0.45, 1 - Math.max(0, haut) * 0.12)); // plus petite quand il saute : le saut se lit
    }
  }, 950);
}

// --- micro-banc (écran-titre) ---
/** Coût de remplissage : ms par plein écran 1080p d'un shader proche du décor toon. ~0,3 s de GPU au total. */
async function microBanc(renderer: THREE.WebGLRenderer): Promise<number | null> {
  const W = 960;
  const H = 540; // quart de 1080p : même mesure, 4 fois moins long ; ramené au 1080p ci-dessous
  const cible = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vUv;
      void main(){ vec3 n = normalize(vec3(vUv - 0.5, 0.7)); float a = 0.0;
        for (int i = 0; i < 6; i++) { a += max(dot(n, normalize(vec3(sin(uT + float(i)), 0.6, cos(uT * 0.7 + float(i))))), 0.0); }
        gl_FragColor = vec4(vec3(floor(a * 2.0) / 6.0), 0.12); }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const COUCHES = 24;
  for (let i = 0; i < COUCHES; i++) { const c = quad.clone(); c.renderOrder = i; scene.add(c); }
  const px = new Uint8Array(4);
  const avant = renderer.getRenderTarget();
  const autoClear = renderer.autoClear;
  const sync = () => renderer.readRenderTargetPixels(cible, 0, 0, 1, 1, px); // attend la fin du GPU
  const temps: number[] = [];
  const vide: number[] = [];
  try {
    renderer.autoClear = true;
    renderer.setRenderTarget(cible);
    renderer.render(scene, cam); // compilation + 1er dessin, non compté
    sync();
    for (let k = 0; k < 5; k++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      renderer.setRenderTarget(cible);
      sync(); // vide ce que l'image du jeu a laissé en cours
      let t0 = performance.now();
      sync(); // aller-retour seul (latence fixe, à déduire)
      vide.push(performance.now() - t0);
      mat.uniforms.uT.value = k;
      t0 = performance.now();
      renderer.render(scene, cam);
      sync();
      temps.push(performance.now() - t0);
      renderer.setRenderTarget(avant);
    }
  } catch {
    return null;
  } finally {
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(avant);
    cible.dispose();
    mat.dispose();
    quad.geometry.dispose();
  }
  temps.sort((a, b) => a - b);
  vide.sort((a, b) => a - b);
  return (Math.max(0, temps[1] - vide[2]) / COUCHES) * 4; // 2e meilleur : robuste aux à-coups ; ×4 = 1080p
}

function palierDuBanc(ms: number): Palier {
  return ms <= BANC_HAUT ? 'haut' : ms <= BANC_MOYEN ? 'moyen' : 'bas';
}

/** Branche la qualité sur le rendu (appelé par main.ts avant les autres modules). */
export function installQualite(ctx: Ctx): void {
  if (!q) return;
  ctxRef = ctx;
  const { renderer } = ctx.three;
  ratioJeu = renderer.getPixelRatio();
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    q.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch { /* nom masqué par le navigateur : le banc décidera */ }
  installerDisques(ctx);

  // ctx.ts remet son propre ratio de pixels au redimensionnement : on repasse derrière (moyen, bas).
  window.addEventListener('resize', () => {
    const r = ratioVoulu();
    if (r == null) ratioJeu = renderer.getPixelRatio();
    else if (Math.abs(renderer.getPixelRatio() - r) > 1e-3) renderer.setPixelRatio(r);
  });
  // Lumières ajoutées plus tard (environnement, map) : le palier bas leur coupe aussi les ombres portées, dès leur
  // arrivée (avant que le préchargement LLOAD ne compile les shaders de la map).
  ctx.three.scene.addEventListener('childadded', (e) => { if (q) appliquerOmbres(e.child, PALIERS[q.palier].ombres); });
  // La map se construit en tâche de fond : on repasse au lancement, 1,5 s après, puis à chaque phase de jeu.
  bus?.on('match:start', () => { queueMicrotask(reappliquer); setTimeout(reappliquer, 1500); });
  bus?.on('phase:change', ({ to }) => { if (PHASES_DE_JEU.has(to)) reappliquer(); });

  // Palier de départ : réglage du joueur, sinon nom de la puce, sinon banc mémorisé pour cette puce.
  try {
    const memo = JSON.parse(localStorage.getItem(CLE_BANC) ?? 'null') as { gpu: string; ms: number } | null;
    if (memo && memo.gpu === q.gpu) { q.banc = memo.ms; palierBanc = palierDuBanc(memo.ms); }
  } catch { /* sans stockage */ }
  appliquerPalier(reglage === 'auto' ? palierAuto() : FR[reglage]);

  // Micro-banc à l'écran-titre (une fois par puce) : peut corriger le palier deviné d'après le nom.
  if (q.banc == null) {
    void (async () => {
      await new Promise((r) => setTimeout(r, 300)); // laisse l'écran-titre s'afficher
      const ms = await microBanc(renderer);
      if (ms == null || !q) return;
      q.banc = ms;
      palierBanc = palierDuBanc(ms);
      try { localStorage.setItem(CLE_BANC, JSON.stringify({ gpu: q.gpu, ms })); } catch { /* sans stockage */ }
      if (reglage === 'auto' && ctx.state.phase === 'title' && palierBanc !== q.palier) appliquerPalier(palierBanc);
      else prevenir();
    })();
  }
}

declare global { interface Window { __qualite?: QualiteCtl } }
