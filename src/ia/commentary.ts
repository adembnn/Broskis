// L'animateur de ring solo (lot LI). Persona : Nigel Crankshaft — un tic de langage ("—and that's the
// WHOLE SANDWICH!", rare) et un défaut : il explique avec aplomb à quoi servent "vraiment" les objets
// scannés, et se trompe toujours (voir l'ancien prompt dans api/commentary.ts).
//
// Lot LVOX (une seule voix, 26/09 14h20) : avant, ce fichier vocalisait lui-même (Gradium) des répliques sur
// hit / parry:result / ko / crate:grab / match:start EN PLUS des barks pré-générés de src/audio/barks.ts
// (lot LBK) sur les mêmes événements — d'où deux voix d'animateur qui se chevauchaient à chaque coup.
// Décision d'Adem : les barks couvrent maintenant TOUS les moments génériques (coup, parade, KO, sortie de
// ring, caisse, victoire...). Gemini ne reste que pour les deux moments propres à une arme :
//  - la pesée (`weigh_in`) : chaque arme de l'arsenal, présentée à voix haute pendant screenReveal.ts ;
//  - la révélation d'une arme fraîchement scannée en PLEIN MATCH (Caisse Snap, `sayScanReveal`).
// Les deux sont vocalisées en Gemini TTS/Fenrir (api/tts.ts) puis remises à la file unique de barks.ts
// (`playAnnouncerCustomLine`) : plus aucun audio n'est joué directement depuis ce fichier.
import type { Ctx, Phase, Weapon } from '../core/types';
import { playAnnouncerCustomLine } from '../audio/barks';
import { getRuntimeCtx } from './runtime';
import { synthesizeLine, TTS_PRIORITY } from './tts-client';

interface PreparedLine {
  text: string;
  audioUrl?: string;
}

const weaponIntroBank = new Map<string, PreparedLine>();

/** Le scan d'une arme dans ces phases est un Caisse Snap en plein match (voir src/gameplay/crate.ts et
 *  src/ui/snapTime.ts) ; en dehors (phase 'arsenal'), c'est la constitution de l'arsenal initial — déjà
 *  annoncée par la pesée (`weigh_in`), pas la peine de la commenter une seconde fois. */
const MID_MATCH_PHASES = new Set<Phase>(['turn-intro', 'move', 'aim', 'resolve', 'snap-time']);

/** Cadence façon pesée de boxe : laisse le temps à `match_intro` (barks.ts) de se terminer, puis une arme
 *  toutes les WEIGH_IN_STEP_S secondes. screenReveal.ts (hors périmètre de ce lot) avance les cartes à son
 *  propre rythme via le bouton « Next » : ce minutage tourne en parallèle, indépendant des clics — décision
 *  documentée dans plan/SUIVI.md (ligne LVOX) faute de pouvoir émettre un événement par carte sans toucher
 *  à un fichier hors périmètre. */
const WEIGH_IN_FIRST_DELAY_S = 1.8;
const WEIGH_IN_STEP_S = 3.0;

/**
 * Lot LLOAD, appel spéculatif : vocalise la réplique de pesée d'une arme DÈS qu'elle est connue (scan arrivé ou
 * arme choisie dans l'arsenal), au lieu d'attendre la présentation. prepareCommentary retrouve ensuite la voix
 * déjà prête (même texte = même cache dans tts-client, un seul appel même s'il est encore en cours).
 */
export function primeWeapon(w: Weapon): Promise<void> {
  const text = w.lines?.intro;
  if (!text) return Promise.resolve();
  return synthesizeLine(text, undefined, TTS_PRIORITY.soon).then(() => undefined);
}

/**
 * Vocalise la ligne `intro` de chaque arme (déjà écrite par le scan/preset, voir Weapon.lines.intro) via
 * Gemini TTS Fenrir (api/tts.ts), et programme leur lecture dans la file unique de barks.ts, façon pesée de
 * boxe. Appelé une fois au tout début de la présentation des armes (screenReveal.ts).
 */
/** Pesée en cours : un nouveau numéro annule les répliques encore programmées (Skip, ou début du match). */
let weighInSession = 0;
let weighInCancelHooked = false;

export async function prepareCommentary(weapons: Weapon[]): Promise<void> {
  const session = ++weighInSession;
  weaponIntroBank.clear();

  await Promise.all(
    weapons.map(async (w) => {
      const text = w.lines.intro;
      if (!text) return;
      // Voix unique de l'animateur (pas de voiceId) : api/tts.ts synthétise en Gemini Fenrir par défaut,
      // avec repli Gradium (voir api/tts.ts) si Gemini échoue ou dépasse 6 s.
      const audioUrl = await synthesizeLine(text);
      weaponIntroBank.set(w.id, { text, audioUrl });
    }),
  );

  const ctx = getRuntimeCtx();
  if (!ctx || session !== weighInSession) return;
  if (!weighInCancelHooked) {
    weighInCancelHooked = true;
    // Après « Skip presentation », la pesée ne doit pas continuer en plein match.
    ctx.bus.on('match:start', () => { weighInSession++; });
  }
  let delay = WEIGH_IN_FIRST_DELAY_S;
  for (const w of weapons) {
    const line = weaponIntroBank.get(w.id);
    if (!line) continue;
    ctx.loop.later(delay, () => { if (session === weighInSession) playAnnouncerCustomLine(line.text, line.audioUrl, 'weigh_in'); });
    delay += WEIGH_IN_STEP_S;
  }
}

/** Caisse Snap en plein match : la nouvelle arme scannée est révélée à voix haute par l'animateur (Gemini
 *  TTS Fenrir), seulement si le scan a eu lieu pendant le match (voir MID_MATCH_PHASES). Appelé depuis
 *  src/ia/index.ts sur `scan:result`. Volontairement asynchrone (contrairement à l'ancien `say()`,
 *  synchrone) : contrairement aux répliques génériques, le texte de CETTE arme n'existe qu'une fois le scan
 *  terminé, impossible à pré-générer pendant la présentation des armes — c'est le seul moment où l'animateur
 *  fait un appel réseau en plein match, et le skill ia-en-jeu le réserve justement à ce genre de moment rare. */
export async function sayScanReveal(ctx: Ctx, weapon: Weapon): Promise<void> {
  if (!MID_MATCH_PHASES.has(ctx.state.phase)) return;
  const text = weapon.lines.intro;
  if (!text) return;
  const audioUrl = await synthesizeLine(text);
  playAnnouncerCustomLine(text, audioUrl, 'weapon_reveal');
}
