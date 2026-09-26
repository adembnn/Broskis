// Constantes partagées du pipeline IA côté navigateur (lot LI). Aucune clé ici : les clés restent
// côté serveur (api/*.ts), lues depuis .env. Voir skill ia-en-jeu pour la table de latence.

/** Abandon réseau : au-delà, on bascule sur la banque de secours (skill ia-en-jeu + plan/lots/LI). */
export const TIMEOUTS = {
  /** Scan JSON (api/scan-object), relance comprise. Mesuré : 2,3 à 2,7 s avec gemini-3.8-flash. Pas 2,5 s comme
   *  une action en match : ici le joueur attend SA photo (forge + photo affichées), et un repli trop tôt colle
   *  une arme sans rapport sur sa photo (vu en test : un mug devenu « Gnome Wrecker », lot LSCAN). */
  scan: 14000, // 8,7-8,9 s mesurés sous charge (17h55) : à 9 s on tombait sur une arme de secours sans rapport
  /** Sticker Nano Banana (plus lent : dessin d'image). */
  sticker: 45000, // mesuré : 9,5 à 14 s au calme, > 17 s quand la machine/le réseau sont chargés (17h55) ; l'arme se joue déjà pendant l'attente
  /** Premier essai du sticker : au-delà, l'appel est jugé bloqué et relancé une fois (dans TIMEOUTS.sticker). */
  stickerTry: 32000, // couper à 17 s tuait des dessins presque finis (ERR_ABORTED vu en jeu à 17h50) : un seul long essai
  /** Répliques de l'animateur, préparées à l'avance : un peu de marge est tolérable. */
  commentary: 40000, // pré-génération avec gemini-3.1-pro-preview (12 à 33 s mesurés)
  /** Une ligne vocalisée (Gradium TTS). */
  tts: 4000,
  /** Jeton WebSocket Gradium. */
  gradiumToken: 3000,
} as const;

export const ENDPOINTS = {
  scanObject: '/api/scan-object',
  sticker: '/api/sticker',
  commentary: '/api/commentary',
  tts: '/api/tts',
  gradiumToken: '/api/gradium-token',
} as const;

/** Les 6 moments imposés par le lot LI, plus 2 moments structurels préparés en même temps (même coût réseau). */
export const COMMENTARY_KINDS = [
  'hit',
  'crit',
  'miss',
  'parry-perfect',
  'low-hp',
  'ko',
  'match-start',
  'crate-grab',
] as const;

export type CommentaryKind = (typeof COMMENTARY_KINDS)[number];

export const VARIANTS_PER_KIND = 5;

/** Image envoyée à Gemini : côté la plus longue, en pixels (voir plan/lots/LI-pipeline-ia.md). */
export const SCAN_IMAGE_MAX_SIDE = 768;
