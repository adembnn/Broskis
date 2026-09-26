// Lot LLOAD — préchargement PENDANT les menus, pour que personne ne sente les chargements.
// Principe (voir plan/rendus/LLOAD.md) : charger ce que le joueur va probablement demander pendant qu'il choisit
// (Instagram envoie la photo avant « Share », instant.page charge au survol), sans jamais bloquer l'interface.
//
// API (tout est « fire and forget », rien ne jette) :
//   preloadFighters(defs)   modèles 3D des persos choisis (priorité haute) ; les 4 prédéfinis partent dès l'écran-titre
//   preloadMap(mapId)       fichiers GLB d'une map (appelé au survol d'une vignette, puis au choix)
//   compileScene(ctx)       compile tous les shaders de la scène courante sans figer l'image (renderer.compileAsync)
//   preloadStatus()         état lisible par l'interface et les agents (aussi sur window.__preload)
// Les caches réels sont ceux des chargeurs de la scène (src/scene/*/loader.ts, cache par URL) : on ne fait
// qu'appeler ces chargeurs plus tôt, la scène retrouve ensuite le fichier déjà décodé.
import { DefaultLoadingManager, HalfFloatType, WebGLRenderTarget } from 'three';
import type { Mesh, Object3D } from 'three';
import type { Ctx, FighterDef, MapId, ModelId } from './types';
import { MAPS } from './types';
import { instantiateFighterModel } from '../scene/fighters/loader';
import * as MAP_ASSETS from '../scene/maps/assets';
import { instantiate as instantiateMapAsset } from '../scene/maps/loader';

type Status = 'queued' | 'loading' | 'ready' | 'failed';
interface Job { key: string; priority: number; run: () => Promise<unknown> }

/** Plus grand = plus urgent. */
const PRIO = { hover: 30, chosen: 20, likely: 10, idle: 0 } as const;
const PRESET_MODELS: ModelId[] = ['barbarian', 'knight', 'mage', 'rogue_hooded'];
/** Deux persos suffisent à la répétition générale : tous partagent les mêmes matériaux toon (mêmes programmes GPU). */
const REHEARSAL_MODELS = PRESET_MODELS.slice(0, 2);
/** Groupes de src/scene/maps/assets.ts → map. Un groupe inconnu (ajouté par un autre lot) part pour toutes les maps. */
const GROUP_TO_MAP: Record<string, MapId> = { HEX: 'archipel', PIRATE: 'galion', RESTAURANT: 'cuisine', FURNITURE: 'cuisine' };
const LEARNED_KEY = 'broskis:lload:map-urls:v1';

const status = new Map<string, Status>();
const queue: Job[] = [];
let running = 0;
const MAX_PARALLEL = 2;

function isModelUrl(u: unknown): u is string {
  return typeof u === 'string' && /\.(glb|gltf)$/i.test(u);
}

/** URLs de chaque map : lues dans assets.ts (sans dépendre des noms de groupe) + celles apprises aux parties précédentes. */
function mapUrls(mapId: MapId): string[] {
  const urls = new Set<string>();
  for (const [group, value] of Object.entries(MAP_ASSETS)) {
    const target = GROUP_TO_MAP[group];
    if (target && target !== mapId) continue;
    const values = typeof value === 'object' && value ? Object.values(value) : [value];
    for (const v of values) if (isModelUrl(v)) urls.add(v);
  }
  for (const u of readLearned()[mapId] ?? []) urls.add(u);
  return [...urls];
}

function readLearned(): Partial<Record<MapId, string[]>> {
  try { return JSON.parse(localStorage.getItem(LEARNED_KEY) ?? '{}'); } catch { return {}; }
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    queue.sort((a, b) => b.priority - a.priority);
    const job = queue.shift()!;
    if (status.get(job.key) !== 'queued') continue;
    status.set(job.key, 'loading');
    running++;
    // Les tâches de fond attendent un moment calme du navigateur ; une tâche urgente (survol, choix) part tout de suite.
    const start = job.priority >= PRIO.chosen ? Promise.resolve() : idle();
    start
      .then(job.run)
      .then(() => status.set(job.key, 'ready'), (e) => { status.set(job.key, 'failed'); console.warn('[preload]', job.key, e); })
      .finally(() => { running--; pump(); });
  }
}

function idle(): Promise<void> {
  return new Promise((r) => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), { timeout: 800 }) : setTimeout(r, 50)));
}

function enqueue(key: string, priority: number, run: () => Promise<unknown>): void {
  const s = status.get(key);
  if (s === 'ready' || s === 'loading') return;
  const queued = queue.find((j) => j.key === key);
  if (queued) { queued.priority = Math.max(queued.priority, priority); pump(); return; }
  status.set(key, 'queued');
  queue.push({ key, priority, run });
  pump();
}

// Pas d'envoi explicite des textures au GPU (renderer.initTexture) : mesuré, chaque envoi coûte 150 à 450 ms
// d'image figée dans les menus. Les deux images de la répétition générale envoient celles de la map probable
// (derrière l'écran-titre, statique) ; les autres maps paient sous le rideau.

/** Une copie de chaque perso préchargé, gardée pour la répétition générale (jamais laissée dans la scène). */
const warmFighters: Object3D[] = [];

function enqueueModel(def: Pick<FighterDef, 'model' | 'glbUrl'>, priority: number): void {
  const key = `fighter:${def.glbUrl ?? def.model}`;
  // Instancie une fois pour remplir le cache du chargeur des persos.
  enqueue(key, priority, () => instantiateFighterModel(def, 0).then((m) => {
    if (warmFighters.length < 2) warmFighters.push(m.root);
  }));
}

export function preloadFighters(defs: readonly FighterDef[]): void {
  for (const d of defs) enqueueModel(d, PRIO.chosen);
}

export function preloadMap(mapId: MapId, priority: number = PRIO.hover): void {
  // instantiate remplit le cache par URL du chargeur des maps ; la copie rendue est jetée.
  for (const url of mapUrls(mapId)) enqueue(`gltf:${url}`, priority, () => instantiateMapAsset(url));
}

export function preloadStatus(): { ready: number; loading: number; queued: number; failed: number; rehearsalMs: number; items: Record<string, Status> } {
  const items = Object.fromEntries(status);
  const count = (s: Status) => [...status.values()].filter((v) => v === s).length;
  return { ready: count('ready'), loading: count('loading'), queued: count('queued'), failed: count('failed'), rehearsalMs, items };
}

/** Vrai quand tous les fichiers d'une map sont décodés (l'interface peut afficher « prête »). */
export function isMapReady(mapId: MapId): boolean {
  return mapUrls(mapId).every((u) => status.get(`gltf:${u}`) === 'ready');
}

let offscreen: WebGLRenderTarget | null = null;

/**
 * Compile les shaders de tout ce qui est dans la scène, en parallèle et hors du fil principal quand le pilote le
 * permet (KHR_parallel_shader_compile). À appeler rideau fermé : l'image suivante n'a plus rien à compiler.
 * Les programmes GPU dépendent de la cible (espace de couleur de sortie), pas de la caméra ni de la vue : en qualité
 * « haute », les 2 vues de l'écran scindé sont dessinées dans la cible du post-traitement (hors écran) ; en « basse »,
 * directement dans le canvas (src/core/quality.ts). On compile les DEUX variantes : sinon la première image
 * recompilait tout (15 programmes, ~550 ms mesurés), et la bascule haute → basse aussi.
 */
export async function compileScene(ctx: Ctx, timeoutMs = 3000): Promise<void> {
  const { renderer: r, scene, camera } = ctx.three;
  offscreen ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  const previous = r.getRenderTarget();
  const jobs: Promise<unknown>[] = [];
  try {
    for (const target of [offscreen, null]) {
      r.setRenderTarget(target);
      jobs.push(r.compileAsync ? r.compileAsync(scene, camera) : Promise.resolve(r.compile(scene, camera)));
    }
  } finally {
    r.setRenderTarget(previous);
  }
  await Promise.race([Promise.all(jobs).catch(() => undefined), new Promise((res) => setTimeout(res, timeoutMs))]);
}

let curtainUp = false;

/**
 * Vrai pendant que le rideau de chargement couvre l'écran (src/ui/loading/match.ts). Contrat pour le compte à
 * rebours READY? 3-2-1 GO! : s'il est vrai au `match:start`, attendre `transition:open` pour démarrer, afin que le
 * rideau s'ouvre pile sur « 3 ». Faux (tests, hooks sans interface) : démarrer tout de suite.
 */
export function isLoadingCurtainUp(): boolean {
  return curtainUp;
}

export function setLoadingCurtainUp(up: boolean): void {
  curtainUp = up;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function meshCount(ctx: Ctx): number {
  let n = 0;
  ctx.three.scene.traverse((o) => { if ((o as Mesh).isMesh) n++; });
  return n;
}

/** Attend qu'aucun fichier ne soit en vol et que le nombre de meshes ne bouge plus (2 relevés espacés de 100 ms). */
export async function waitSceneStable(ctx: Ctx, maxMs: number): Promise<void> {
  const until = performance.now() + maxMs;
  let last = -1;
  let stable = 0;
  while (performance.now() < until) {
    await sleep(100);
    const n = meshCount(ctx);
    stable = n === last && pending === 0 ? stable + 1 : 0;
    last = n;
    if (stable >= 2) return;
  }
}

/** Coupe le rendu (rien à compiler en urgence sur le fil principal) ; renvoie la fonction qui le rétablit. */
export function pauseRender(ctx: Ctx): () => void {
  const original = ctx.three.render;
  const paused = () => {};
  ctx.three.render = paused;
  return () => { if (ctx.three.render === paused) ctx.three.render = original; };
}

declare global { interface Window { __mapTest?: (mapId: MapId) => void } }

/**
 * Répétition générale, une fois, à l'écran-titre : la map la plus probable est construite DERRIÈRE le menu (opaque),
 * avec deux persos, puis tous ses shaders sont compilés et ses ombres rendues une fois. Les programmes GPU restent
 * en cache (le moteur de map ne les libère pas en déchargeant) : l'entrée dans le vrai match n'a plus rien à compiler.
 * Passe par window.__mapTest (hook du moteur de maps) ; s'il n'existe plus, on ne fait rien.
 */
async function rehearse(ctx: Ctx): Promise<void> {
  const mapTest = window.__mapTest;
  if (!mapTest) return;
  // Attend les fichiers de la map et les persos de l'écran-titre (sinon on compilerait une scène incomplète).
  const needed = [...mapUrls(MAPS[0]).map((u) => `gltf:${u}`), ...REHEARSAL_MODELS.map((m) => `fighter:${m}`)];
  const settled = () => needed.every((k) => status.get(k) === 'ready' || status.get(k) === 'failed');
  for (let i = 0; i < 100 && !settled(); i++) await sleep(100);
  if (ctx.state.phase !== 'title') return; // le joueur est déjà parti : ne rien construire sous ses yeux
  const t0 = performance.now();
  const resume = pauseRender(ctx);
  const before = new Set(ctx.three.scene.children);
  const added: Object3D[] = [];
  try {
    mapTest(MAPS[0]);
    await waitSceneStable(ctx, 4000);
    const spawns: [number, number, number][] = ctx.state.players.map((p) => p.pos);
    warmFighters.forEach((f, i) => {
      const [x, y, z] = spawns[i % spawns.length] ?? [0, 0, 0];
      f.position.set(x, y, z);
      ctx.three.scene.add(f);
      added.push(f);
    });
    await compileScene(ctx, 4000);
  } catch (e) {
    console.warn('[preload] répétition', e);
  } finally {
    resume();
  }
  // Deux vraies images (derrière le menu) : cartes d'ombre, envoi au GPU de ce qui manquait.
  await nextFrame();
  await nextFrame();
  // On retire ensuite tout ce que la répétition a posé : les menus n'ont pas à dessiner une map cachée à chaque image.
  // Les programmes GPU restent en cache ; le vrai match reconstruit sa map (le moteur retire l'ancienne de lui-même).
  for (const c of [...ctx.three.scene.children]) if (!before.has(c)) ctx.three.scene.remove(c);
  rehearsalMs = Math.round(performance.now() - t0);
}

let rehearsalMs = -1;

let pending = 0;

/** Fichiers three.js en cours de téléchargement (tous chargeurs confondus) : 0 = plus rien n'arrive du réseau. */
export function pendingLoads(): number {
  return pending;
}

/**
 * Observe le gestionnaire de chargement par défaut de three.js (sans rien changer à son comportement) :
 * compte les fichiers en vol, et apprend ceux qu'une map charge vraiment pour les précharger dès l'écran-titre
 * la fois suivante (utile si un lot ajoute des décors hors de src/scene/maps/assets.ts).
 */
function watchLoads(ctx: Ctx): void {
  let recording: { mapId: MapId; urls: Set<string>; until: number } | null = null;
  ctx.bus.on('match:start', ({ mapId }) => { recording = { mapId, urls: new Set(), until: performance.now() + 6000 }; });
  const m = DefaultLoadingManager;
  const itemStart = m.itemStart.bind(m);
  const itemEnd = m.itemEnd.bind(m);
  const itemError = m.itemError.bind(m);
  m.itemStart = (url: string) => {
    pending++;
    const rec = recording;
    if (rec && performance.now() < rec.until && isModelUrl(url) && !url.includes('/assets/characters/') && !status.has(`gltf:${url}`)) {
      rec.urls.add(url);
      try {
        const all = readLearned();
        all[rec.mapId] = [...new Set([...(all[rec.mapId] ?? []), ...rec.urls])].slice(0, 80);
        localStorage.setItem(LEARNED_KEY, JSON.stringify(all));
      } catch { /* stockage indisponible : on garde la liste statique */ }
    }
    itemStart(url);
  };
  m.itemEnd = (url: string) => { pending = Math.max(0, pending - 1); itemEnd(url); };
  m.itemError = (url: string) => { pending = Math.max(0, pending - 1); itemError(url); };
}

declare global { interface Window { __preload?: typeof preloadStatus } }

export function installPreload(ctx: Ctx): void {
  window.__preload = preloadStatus;
  watchLoads(ctx);
  if (new URLSearchParams(location.search).has('nopreload')) return; // comparaison avant/après (tools/lload/mesure.mjs)
  // Dès l'écran-titre, en tâche de fond : la map la plus probable (la première) et deux persos, la répétition
  // générale, puis les deux autres persos, puis les autres maps.
  preloadMap(MAPS[0], PRIO.likely);
  for (const model of REHEARSAL_MODELS) enqueueModel({ model }, PRIO.likely);
  enqueue('rehearsal', PRIO.likely - 1, () => rehearse(ctx));
  for (const model of PRESET_MODELS) enqueueModel({ model }, PRIO.likely - 2);
  for (const m of MAPS.slice(1)) preloadMap(m, PRIO.idle);
}
