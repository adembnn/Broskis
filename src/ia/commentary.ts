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
import { synthesizeLine, synthesizeMany } from './tts-client';

interface PreparedLine {
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

/**
 * Génère 5 variantes par moment (hit, crit, miss, parry-perfect, low-hp, ko — plus match-start et
 * crate-grab, préparés dans le même appel réseau) + les 4 répliques de chaque arme, vocalise tout via
 * api/tts, et garde le résultat en mémoire pour `say`. Appelé pendant la présentation des armes.
 */
export async function prepareCommentary(weapons: Weapon[]): Promise<void> {
  genericBank.clear();
  genericCursor.clear();
  weaponBank.clear();

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

  const genericJobs = kinds.map(async (kind) => {
    const texts = linesByKind[kind]?.length ? linesByKind[kind]! : FALLBACK_COMMENTARY[kind];
    const audioUrls = await synthesizeMany(texts);
    genericBank.set(kind, texts.map((text, i) => ({ text, audioUrl: audioUrls[i] })));
    genericCursor.set(kind, 0);
  });

  const weaponJobs = weapons.map(async (w) => {
    const entry: Partial<Record<WeaponLineKey, PreparedLine>> = {};
    const keys = Object.keys(w.lines) as WeaponLineKey[];
    await Promise.all(
      keys.map(async (line) => {
        const text = w.lines[line];
        const audioUrl = await synthesizeLine(text);
        entry[line] = { text, audioUrl };
      }),
    );
    weaponBank.set(w.id, entry);
  });

  await Promise.all([...genericJobs, ...weaponJobs]);
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
