// `commentary:line` ({ text, priority, audioUrl? }) — lot LVOX (une seule voix, 26/09 14h20) :
// ce fichier ne lit plus aucun audio lui-même (avant, il jouait un HTMLAudioElement en parallèle des barks
// de src/audio/barks.ts, d'où deux voix d'animateur qui se chevauchaient). Il se contente maintenant de
// relayer toute ligne reçue vers la file unique de barks.ts (`playAnnouncerRawLine`), qui décide seule de
// la lecture, du cooldown et des priorités. En pratique plus aucun code du lot ne devrait émettre
// `commentary:line` (src/ia/commentary.ts et src/gameplay/ai/taunt-bubble.ts appellent directement
// barks.ts), ce relais reste en place par sécurité pour tout code hors périmètre qui l'émettrait encore.
import type { Bus } from '../core/bus';
import { playAnnouncerRawLine } from './barks';

export function installCommentary(bus: Bus): { dispose(): void } {
  const off = bus.on('commentary:line', ({ text, priority, audioUrl }) => {
    playAnnouncerRawLine(text, audioUrl, priority);
  });
  return { dispose: off };
}
