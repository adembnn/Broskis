// Constantes partagées du pipeline IA côté navigateur (lot LI). Aucune clé ici : les clés restent
// côté serveur (api/*.ts), lues depuis .env. Voir skill ia-en-jeu pour la table de latence.

/** Abandon réseau : au-delà, on bascule sur la banque de secours (skill ia-en-jeu + plan/lots/LI). */
export const TIMEOUTS = {
  /** Scan JSON (api/scan-object). */
  scan: 4000, // mesuré : 2,3 s avec gemini-3.8-flash
  /** Sticker Nano Banana (plus lent : dessin d'image). */
  sticker: 25000, // mesuré : 15 s avec Nano Banana Pro (affiché après la carte de stats)
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
