// Noms et données des événements du bus — figés (plan/README.md). Un nouvel événement = une ligne ici + une note dans plan/SUIVI.md.
import type { Category, MapId, Material, ParryGrade, Phase, PlayerId, Vec3, Weapon } from './types';

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
  /** Temps réel : `gravity` (m/s², 0 = tir tendu) et `owner` permettent de rejouer exactement le vol côté rendu. */
  'projectile:spawn': { id: string; weapon: Weapon; from: Vec3; vel: Vec3; gravity?: number; owner?: PlayerId; mass?: number; material?: Material | null; size?: Vec3 };
  /** Temps réel : fin d'un projectile (touché, mur, sol, paré-renvoyé, trop loin), pour retirer son visuel. */
  'projectile:end': { id: string; pos: Vec3; reason: 'hit' | 'world' | 'parried' | 'expired' };
  /** Lot LATK1 : un objet-arme touche un joueur ou le décor, avec sa matière et sa masse RÉELLES (pour le son :
   *  clang du métal, crash du verre, splash du liquide…). Émis par src/scene/weapons au moment de l'impact visible. */
  'weapon:impact': { pos: Vec3; weaponId: string; category: Category; material: Material; massKg: number; fragile: boolean; liquid: boolean; on: 'player' | 'world' };
  /** Temps réel : rebond d'un objet lancé sur le décor (selon sa `bounciness`), pour le « tok » et la poussière. */
  'projectile:bounce': { id: string; pos: Vec3; vel: Vec3 };
  /** Temps réel : un objet LIQUIDE a giclé, le sol est glissant `ms` millisecondes dans ce rayon (visuel de flaque). */
  'ground:slippery': { pos: Vec3; radius: number; ms: number };
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
  'hit': { target: PlayerId; attacker: PlayerId; weapon: Weapon; damage: number; knockback: Vec3; crit: boolean; pos: Vec3; pct?: number; launch?: Vec3; willKo?: boolean; mass?: number; material?: Material | null; size?: Vec3 };
  'shield:placed': { player: PlayerId; weapon: Weapon; pos: Vec3 };
  'map:warn': { mapId: MapId; kind: string; turnsLeft: number; area?: Vec3[] };
  'map:event': { mapId: MapId; kind: string };
  'prop:triggered': { propId: string; kind: string };
  'crate:warn': { pos: Vec3 };
  'crate:land': { pos: Vec3 };
  'crate:grab': { player: PlayerId };
  'scan:start': { player: PlayerId; source: 'webcam' | 'upload' | 'crate' | 'cache' };
  'scan:result': { player: PlayerId; weapon: Weapon };
  /** Étapes réelles d'un scan photo (lot LUX, génération « en direct ») : lecture Gemini, stats reçues, sticker prêt ou raté.
   *  Lot LLOAD : 'partial' = champs de la réponse Gemini arrivés au fil de l'eau (flux), dans `preview` (objet reconnu,
   *  nom, phrase, déjà nettoyés) ; `preview` porte aussi l'arme complète à 'stats' et 'sticker'. */
  'scan:progress': { player: PlayerId; step: 'reading' | 'partial' | 'stats' | 'sticker' | 'sticker-failed'; weaponId?: string; preview?: Partial<Weapon> };
  /** Lot LE2E : portrait d'un perso photo arrivé APRÈS le délai d'écran (réseau lent) ; `look.faceUrl` est déjà posé sur
   *  le FighterDef. La scène pose la grosse tête en plein match, l'interface met le portrait à jour. */
  'fighter:portrait': { fighterId: string; faceUrl: string; backUrl?: string };
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
  /** Temps réel : blocage maintenu (G / K par défaut) qui commence ou s'arrête. */
  'block': { player: PlayerId; on: boolean };
  /** Temps réel : une arme a fini de recharger. */
  'weapon:ready': { player: PlayerId; index: number };
  /** Temps réel : compte à rebours avant le combat (3, 2, 1), puis `match:banner { go }`. */
  'countdown': { n: number };
  'ko': { player: PlayerId; cause: 'hp' | 'ringout' };
  'match:end': { winner: PlayerId };
  'commentary:line': { text: string; priority: number; audioUrl?: string; at?: number };
  /** Lot LLOAD : le rideau de chargement s'ouvre sur une scène prête (map construite, shaders compilés). Bon moment pour « READY? ». */
  'transition:open': { mapId: MapId };
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
