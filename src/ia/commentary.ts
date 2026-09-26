// L'animateur de ring solo (lot LI). Persona : Nigel Crankshaft — un tic de langage ("—and that's the
// WHOLE SANDWICH!", rare) et un défaut : il explique avec aplomb à quoi servent "vraiment" les objets
// scannés, et se trompe toujours (voir le prompt complet dans api/commentary.ts).
// Principe (skill ia-en-jeu) : tout se prépare et se vocalise PENDANT la présentation des armes
// (prepareCommentary) ; pendant le match, `say` ne fait plus AUCUN appel réseau, elle pioche dans ce qui
// est déjà prêt et émet `commentary:line` de façon synchrone.
import type { PlayerId, Weapon } from '../core/types';
import type { EventMap } from '../core/events';
import { COMMENTARY_KINDS, ENDPOINTS, TIMEOUTS, VARIANTS_PER_KIND, type CommentaryKind } from './config';
import { loadDemoCommentaryBank } from './demo-cache';
import { postJson } from './fetch-json';
import { FALLBACK_COMMENTARY } from './presets';
import { getRuntimeCtx } from './runtime';
import { cachedLine, synthesizeLine, synthesizeMany, TTS_PRIORITY } from './tts-client';

export interface PreparedLine {
  text: string;
  audioUrl?: string;
}

type WeaponLineKey = keyof Weapon['lines'];

const PRIORITY: Record<CommentaryKind, number> = {
  hit: 2,
  crit: 4,
  miss: 1,
  'parry-perfect': 4,
  'low-hp': 3,
  ko: 5,
  'match-start': 2,
  'crate-grab': 2,
};

const genericBank = new Map<CommentaryKind, PreparedLine[]>();
const genericCursor = new Map<CommentaryKind, number>();
const weaponBank = new Map<string, Partial<Record<WeaponLineKey, PreparedLine>>>();

function pickGeneric(kind: CommentaryKind): PreparedLine | null {
  const prepared = genericBank.get(kind);
  if (prepared?.length) {
    const cursor = genericCursor.get(kind) ?? 0;
    genericCursor.set(kind, cursor + 1);
    return prepared[cursor % prepared.length];
  }
  const fallback = FALLBACK_COMMENTARY[kind];
  if (!fallback?.length) return null;
  return { text: fallback[Math.floor(Math.random() * fallback.length)] };
}

function pickWeaponLine(weaponId: string | undefined, line: WeaponLineKey): PreparedLine | null {
  if (!weaponId) return null;
  return weaponBank.get(weaponId)?.[line] ?? null;
}

function hpRatio(player: PlayerId): number | null {
  const ctx = getRuntimeCtx();
  const p = ctx?.state.players[player];
  if (!p) return null;
  const max = p.fighter?.hpMax ?? 100;
  return max > 0 ? p.hp / max : null;
}

// Lot LLOAD : tout part de façon SPÉCULATIVE, dès que l'information existe, au lieu d'attendre la fin de
// l'arsenal. Une arme connue (scan ou râtelier) → ses 4 répliques partent tout de suite (intro d'abord) ; la banque
// générique part dès l'écran d'arsenal, puis est refaite avec les vraies armes (la plus récente gagne, l'ancienne
// reste utilisable en attendant). Rien ici ne bloque un écran.
const weaponJobs = new Map<string, Promise<void>>();
let bankGeneration = 0;
let appliedGeneration = 0;
let bankKey: string | null = null;
let bankJob: Promise<void> | null = null;

/** Vocalise les 4 répliques d'une arme dès qu'elle est connue (intro en priorité : c'est elle qu'on entend en premier). */
export function primeWeapon(w: Weapon): Promise<void> {
  const existing = weaponJobs.get(w.id);
  if (existing) return existing;
  const job = (async () => {
    const entry: Partial<Record<WeaponLineKey, PreparedLine>> = weaponBank.get(w.id) ?? {};
    weaponBank.set(w.id, entry);
    const keys = Object.keys(w.lines) as WeaponLineKey[];
    await Promise.all(
      keys.map(async (line) => {
        const text = w.lines[line];
        const audioUrl = await synthesizeLine(text, undefined, line === 'intro' ? TTS_PRIORITY.soon : TTS_PRIORITY.normal);
        entry[line] = { text, audioUrl };
      }),
    );
  })();
  weaponJobs.set(w.id, job);
  return job;
}

/**
 * Banque générique (5 variantes × 8 moments), vocalisée en fond. Appelée plusieurs fois sans risque : même lot
 * d'armes = même appel ; lot différent = nouvel appel, dont le résultat remplace l'ancien seulement s'il est plus récent.
 */
export function warmGenericBank(weapons: Weapon[] = []): Promise<void> {
  const key = weapons.map((w) => `${w.name}|${w.object}`).join(',');
  if (bankJob && key === bankKey) return bankJob;
  const generation = ++bankGeneration;
  bankKey = key;
  bankJob = (async () => {
    const ctx = getRuntimeCtx();
    const kinds = [...COMMENTARY_KINDS];
    const demoBank = ctx?.demo ? await loadDemoCommentaryBank() : null;
    const apiResult = demoBank
      ? null
      : await postJson<{ lines: Record<string, string[]> }>(
          ENDPOINTS.commentary,
          {
            kinds,
            variantsPerKind: VARIANTS_PER_KIND,
            weapons: weapons.map((w) => ({ name: w.name, object: w.object, category: w.category })),
          },
          TIMEOUTS.commentary,
        );
    const linesByKind: Partial<Record<CommentaryKind, string[]>> = demoBank ?? apiResult?.lines ?? {};
    const next = new Map<CommentaryKind, PreparedLine[]>();
    await Promise.all(
      kinds.map(async (kind) => {
        const texts = linesByKind[kind]?.length ? linesByKind[kind]! : FALLBACK_COMMENTARY[kind];
        const audioUrls = await synthesizeMany(texts, undefined, TTS_PRIORITY.background);
        next.set(kind, texts.map((text, i) => ({ text, audioUrl: audioUrls[i] })));
      }),
    );
    if (generation < appliedGeneration) return; // une banque plus récente est déjà en place
    appliedGeneration = generation;
    genericBank.clear();
    genericCursor.clear();
    for (const [kind, lines] of next) { genericBank.set(kind, lines); genericCursor.set(kind, 0); }
  })();
  return bankJob;
}

/** Réplique de présentation d'une arme, avec sa voix si elle arrive avant `maxWaitMs` (sinon texte seul). */
export async function weaponIntro(w: Weapon, maxWaitMs = 1200): Promise<PreparedLine> {
  const text = w.lines.intro;
  const ready = cachedLine(text);
  if (ready) return { text, audioUrl: ready };
  void primeWeapon(w);
  const audioUrl = await Promise.race([
    synthesizeLine(text, undefined, TTS_PRIORITY.now),
    new Promise<undefined>((r) => setTimeout(() => r(undefined), maxWaitMs)),
  ]);
  return { text, audioUrl };
}

/**
 * Génère 5 variantes par moment (hit, crit, miss, parry-perfect, low-hp, ko — plus match-start et
 * crate-grab, préparés dans le même appel réseau) + les 4 répliques de chaque arme, vocalise tout via
 * api/tts, et garde le résultat en mémoire pour `say`. Signature inchangée ; depuis le lot LLOAD, l'appelant
 * n'a plus besoin de l'attendre (`say` retombe sur la banque de secours tant que rien n'est prêt).
 */
export async function prepareCommentary(weapons: Weapon[]): Promise<void> {
  await Promise.all([...weapons.map(primeWeapon), warmGenericBank(weapons)]);
}

interface ResolvedLine {
  text: string;
  priority: number;
  audioUrl?: string;
}

function resolveLine(event: string, data: unknown): ResolvedLine | null {
  switch (event) {
    case 'hit': {
      const d = data as EventMap['hit'];
      if (!d) return null;
      let kind: CommentaryKind = d.crit ? 'crit' : 'hit';
      if (!d.crit) {
        const ratio = hpRatio(d.target);
        if (ratio !== null && ratio <= 0.2) kind = 'low-hp';
      }
      const line = (kind === 'hit' && pickWeaponLine(d.weapon?.id, 'hit')) || pickGeneric(kind);
      return line && { ...line, priority: PRIORITY[kind] };
    }
    case 'parry:result': {
      const d = data as EventMap['parry:result'];
      if (d?.grade !== 'perfect') return null; // good/miss : le 'hit' qui suit commente déjà l'impact
      const line = pickGeneric('parry-perfect');
      return line && { ...line, priority: PRIORITY['parry-perfect'] };
    }
    case 'ko': {
      const line = pickGeneric('ko');
      return line && { ...line, priority: PRIORITY.ko };
    }
    case 'crate:grab': {
      const line = pickGeneric('crate-grab');
      return line && { ...line, priority: PRIORITY['crate-grab'] };
    }
    case 'match:start': {
      const line = pickGeneric('match-start');
      return line && { ...line, priority: PRIORITY['match-start'] };
    }
    default:
      return null;
  }
}

/** Choisit une réplique déjà prête pour cet événement et l'émet sur le bus (`commentary:line`). Synchrone :
 *  aucun appel réseau ici, tout doit déjà avoir été préparé par `prepareCommentary`. */
export function say(event: string, data?: unknown): void {
  const ctx = getRuntimeCtx();
  if (!ctx) return;
  const resolved = resolveLine(event, data);
  if (!resolved) return;
  ctx.bus.emit('commentary:line', { text: resolved.text, priority: resolved.priority, audioUrl: resolved.audioUrl, at: ctx.loop.time });
}
