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
import { DefaultLoadingManager } from 'three';
import type { Ctx, FighterDef, MapId, ModelId } from './types';
import { MAPS } from './types';
import { instantiateFighterModel } from '../scene/fighters/loader';
import * as MAP_ASSETS from '../scene/maps/assets';
import { preload as preloadGltf } from '../scene/maps/loader';

type Status = 'queued' | 'loading' | 'ready' | 'failed';
interface Job { key: string; priority: number; run: () => Promise<unknown> }

/** Plus grand = plus urgent. */
const PRIO = { hover: 30, chosen: 20, likely: 10, idle: 0 } as const;
const PRESET_MODELS: ModelId[] = ['barbarian', 'knight', 'mage', 'rogue_hooded'];
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

function enqueueModel(def: Pick<FighterDef, 'model' | 'glbUrl'>, priority: number): void {
  const key = `fighter:${def.glbUrl ?? def.model}`;
  // Instancie une fois pour remplir le cache du chargeur des persos (la copie est jetée, jamais ajoutée à la scène).
  enqueue(key, priority, () => instantiateFighterModel(def, 0));
}

export function preloadFighters(defs: readonly FighterDef[]): void {
  for (const d of defs) enqueueModel(d, PRIO.chosen);
}

export function preloadMap(mapId: MapId, priority: number = PRIO.hover): void {
  for (const url of mapUrls(mapId)) enqueue(`gltf:${url}`, priority, () => preloadGltf([url]));
}

export function preloadStatus(): { ready: number; loading: number; queued: number; failed: number; items: Record<string, Status> } {
  const items = Object.fromEntries(status);
  const count = (s: Status) => [...status.values()].filter((v) => v === s).length;
  return { ready: count('ready'), loading: count('loading'), queued: count('queued'), failed: count('failed'), items };
}

/** Vrai quand tous les fichiers d'une map sont décodés (l'interface peut afficher « prête »). */
export function isMapReady(mapId: MapId): boolean {
  return mapUrls(mapId).every((u) => status.get(`gltf:${u}`) === 'ready');
}

/**
 * Compile les shaders de tout ce qui est dans la scène, en parallèle et hors du fil principal quand le pilote le
 * permet (KHR_parallel_shader_compile). À appeler rideau fermé : l'image suivante n'a plus rien à compiler.
 */
export async function compileScene(ctx: Ctx, timeoutMs = 3000): Promise<void> {
  const { renderer, scene, camera } = ctx.three;
  const compile = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera));
  await Promise.race([compile.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}

/** Apprend les fichiers réellement chargés par une map (pour les précharger dès l'écran-titre la fois suivante). */
function learnMapUrls(ctx: Ctx): void {
  let recording: { mapId: MapId; urls: Set<string>; until: number } | null = null;
  ctx.bus.on('match:start', ({ mapId }) => { recording = { mapId, urls: new Set(), until: performance.now() + 6000 }; });
  // three.js signale chaque fichier au gestionnaire par défaut ; on observe sans rien changer à son comportement.
  const itemStart = DefaultLoadingManager.itemStart.bind(DefaultLoadingManager);
  DefaultLoadingManager.itemStart = (url: string) => {
    const rec = recording;
    if (rec && performance.now() < rec.until && isModelUrl(url) && !url.includes('/assets/characters/')) {
      rec.urls.add(url);
      try {
        const all = readLearned();
        all[rec.mapId] = [...new Set([...(all[rec.mapId] ?? []), ...rec.urls])].slice(0, 80);
        localStorage.setItem(LEARNED_KEY, JSON.stringify(all));
      } catch { /* stockage indisponible : on garde la liste statique */ }
    }
    itemStart(url);
  };
}

declare global { interface Window { __preload?: typeof preloadStatus } }

export function installPreload(ctx: Ctx): void {
  window.__preload = preloadStatus;
  learnMapUrls(ctx);
  // Dès l'écran-titre, en tâche de fond : les 4 persos prédéfinis, puis la map la plus probable (la première), puis les autres.
  for (const model of PRESET_MODELS) enqueueModel({ model }, PRIO.likely);
  preloadMap(MAPS[0], PRIO.likely);
  for (const m of MAPS.slice(1)) preloadMap(m, PRIO.idle);
}
