// Noms et données des événements du bus — figés (plan/README.md). Un nouvel événement = une ligne ici + une note dans plan/SUIVI.md.
import type { MapId, ParryGrade, Phase, PlayerId, Vec3, Weapon } from './types';

export interface EventMap {
  'phase:change': { from: Phase; to: Phase };
  'match:start': { mapId: MapId; seed: number };
  'turn:start': { turn: number; active: PlayerId };
  'turn:end': { turn: number; active: PlayerId };
  'move:update': { player: PlayerId; pos: Vec3; moveLeft: number };
  'move:jump': { player: PlayerId };
  'weapon:pick': { player: PlayerId; index: number };
  'anim:release': { player: PlayerId; weapon: Weapon; handPos: Vec3 };
  /** Aides de visée : trajectoire prévue, point d'impact, recul prévu, éjection probable. */
  'aim:update': { player: PlayerId; dir: Vec3; power: number; path?: Vec3[]; impact?: Vec3; knockback?: Vec3; ejects?: boolean };
  'fire': { player: PlayerId; weapon: Weapon; dir: Vec3; power: number };
  'projectile:spawn': { id: string; weapon: Weapon; from: Vec3; vel: Vec3 };
  /** Part ~1,2 s avant l'impact : déclenche les repères de parade. */
  'projectile:incoming': { id: string; target: PlayerId; etaMs: number };
  'parry:cue': { defender: PlayerId; attacker: PlayerId };
  'parry:window': { defender: PlayerId; tImpact: number; perfectMs: number; goodMs: number; index: number; count: number };
  'parry:streak': { player: PlayerId; streak: number; multiplier: number };
  'bro:gauge': { player: PlayerId; value: number };
  'super:ready': { player: PlayerId };
  'attack:nice': { player: PlayerId };
  'feint': { player: PlayerId };
  'parry:result': { player: PlayerId; grade: ParryGrade; deltaMs: number };
  /** pct = % du défenseur après le coup ; launch = vitesse d'éjection (m/s) ; willKo = l'éjection sortira de l'arène (déclenche le zoom KO). */
  'hit': { target: PlayerId; attacker: PlayerId; weapon: Weapon; damage: number; knockback: Vec3; crit: boolean; pos: Vec3; pct?: number; launch?: Vec3; willKo?: boolean };
  'shield:placed': { player: PlayerId; weapon: Weapon; pos: Vec3 };
  'map:warn': { mapId: MapId; kind: string; turnsLeft: number; area?: Vec3[] };
  'map:event': { mapId: MapId; kind: string };
  'prop:triggered': { propId: string; kind: string };
  'crate:warn': { pos: Vec3 };
  'crate:land': { pos: Vec3 };
  'crate:grab': { player: PlayerId };
  'scan:start': { player: PlayerId; source: 'webcam' | 'upload' | 'crate' | 'cache' };
  'scan:result': { player: PlayerId; weapon: Weapon };
  'ringout': { player: PlayerId };
  /** Règles v2 (LSMASH) : perte d'une vie, point de sortie de l'arène et côté (bas = chute, haut = éjection vers le ciel). */
  'stock:lost': { player: PlayerId; stocksLeft: number; exitPos: Vec3; side: 'side' | 'top' | 'bottom' };
  'respawn': { player: PlayerId; pos: Vec3 };
  'ledge:grab': { player: PlayerId; pos: Vec3 };
  'ledge:climb': { player: PlayerId };
  /** Au bord du vide (animation d'équilibre + avertissement). */
  'teeter': { player: PlayerId; on: boolean };
  'super:fire': { player: PlayerId };
  /** Début (READY?/GO!) et fin (GAME!) de match, pour les bandeaux et la voix. */
  'match:banner': { kind: 'ready' | 'go' | 'game' };
  'ko': { player: PlayerId; cause: 'hp' | 'ringout' };
  'match:end': { winner: PlayerId };
  'commentary:line': { text: string; priority: number; audioUrl?: string; at?: number };
  /** Lot LVOX (une seule voix) : émis par src/audio/barks.ts quand une réplique démarre RÉELLEMENT (que ce
   *  soit un bark pré-généré ou une ligne Gemini). Le sous-titre affiché doit toujours venir d'ici, jamais
   *  de `commentary:line` (qui ne garantit pas que la ligne est effectivement jouée à voix haute). */
  'voice:line': { text: string; speaker: 'announcer' | PlayerId };
  'camera:cue': { shot: 'turn-swing' | 'follow-projectile' | 'impact' | 'ko-orbit' | 'overview'; target?: PlayerId };
  /** Demande de ralenti : facteur (0,3 = ×0,3) pendant ms millisecondes de temps réel. */
  'slowmo': { factor: number; ms: number };
  /** Régie de démo (?demo=1) : F1 à F5, F9 = panique. */
  'demo:cue': { key: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F9' };
  /** Clic d'interface (bouton, onglet…) ; émis par le lot LU. `kind` optionnel pour varier le son (ex. 'confirm'). */
  'ui:click': { kind?: string };
}

export type EventName = keyof EventMap;
