// Couleurs d'équipe (tokens.js `joueurs`, direction Vinyle) : J1 rouge, J2 bleu. Petit module partagé pour
// éviter de dupliquer le ternaire `player === 0 ? ... : ...` dans chaque fichier qui en a besoin.
import { joueurs } from '../art/tokens.js';
import type { PlayerId } from '../core/types';

export function teamColor(player: PlayerId): string {
  return player === 0 ? joueurs.p1.principal : joueurs.p2.principal;
}

export function teamColorDark(player: PlayerId): string {
  return player === 0 ? joueurs.p1.fonce : joueurs.p2.fonce;
}

export function teamColorLight(player: PlayerId): string {
  return player === 0 ? joueurs.p1.clair : joueurs.p2.clair;
}
