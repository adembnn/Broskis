// Lecture de public/demo-cache/ (mode ?demo=1, voir CLAUDE.md et skill ia-en-jeu) : en démo, on lit le
// cache AVANT de songer au réseau, pour un résultat instantané et identique à chaque répétition.
// `public/**` est servi tel quel par Vite à la racine du site, donc public/demo-cache/x -> /demo-cache/x.
import type { Weapon } from '../core/types';
import type { CommentaryKind } from './config';

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'object';
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Résultat de scan pré-généré pour un objet de démo connu (voir public/demo-cache/objects/). */
export function loadDemoObject(key: string): Promise<Weapon | null> {
  return getJson<Weapon>(`/demo-cache/objects/${slugify(key)}.json`);
}

interface DemoManifest {
  /** Objets de demo/OBJETS.md dans l'ordre du script (lot LSCAN) : arme rendue quand le réseau tombe. */
  fallback?: string[];
}
let manifest: Promise<DemoManifest | null> | null = null;

/** ?demo=1, réseau coupé pendant un scan photo : la n-ième photo devient le n-ième objet de démo (mug d'abord). */
export async function loadDemoFallback(index: number): Promise<Weapon | null> {
  manifest ??= getJson<DemoManifest>('/demo-cache/manifest.json');
  const list = (await manifest)?.fallback ?? [];
  return list.length ? loadDemoObject(list[index % list.length]) : null;
}

/** Banque de répliques génériques pré-générées (voir public/demo-cache/commentary/bank.json). */
export function loadDemoCommentaryBank(): Promise<Partial<Record<CommentaryKind, string[]>> | null> {
  return getJson(`/demo-cache/commentary/bank.json`);
}

/** URL d'un .wav pré-généré pour une réplique de démo, si présent (aucune garantie qu'il existe). */
export function demoAudioUrl(key: string): string {
  return `/demo-cache/audio/${slugify(key)}.wav`;
}

export async function demoAudioExists(key: string): Promise<boolean> {
  try {
    const res = await fetch(demoAudioUrl(key), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
