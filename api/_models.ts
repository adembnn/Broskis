// Identifiants de modèles / voix externes — regroupés ici pour être faciles à changer (lot LI).
// Vérifiés le 26/09/2026 dans AI Studio. `gemini-2.5-flash-image` s'éteint le 2/10 : ne pas l'utiliser.
// À revérifier avec `node tools/test-ia.mjs` si un modèle se met à échouer.

/** Texte + vision EN DIRECT (scan d'objet pendant un match) : le joueur attend, ça doit rester rapide. */
export const GEMINI_TEXT_MODEL = 'gemini-3.8-flash'; // testé le 26/09 : le plus récent des Flash ; Pro met 12 à 33 s, trop lent en direct

/** Texte, PRÉ-GÉNÉRATION seulement (répliques de l'animateur préparées pendant la présentation des armes) :
 *  la latence est tolérable ici (voir TIMEOUTS.commentary), donc un modèle différent/plus lourd est possible
 *  sans risque pour le direct. Même valeur que GEMINI_TEXT_MODEL par défaut ; à séparer si un modèle plus
 *  qualitatif est confirmé par `node tools/test-ia.mjs` (jamais changé à l'aveugle sans ce test). */
export const GEMINI_COMMENTARY_MODEL = 'gemini-3.1-pro-preview'; // meilleur modèle texte, pré-génération seulement

/** Image (sticker cartoon) : Nano Banana 2 Lite, ~4 s. */
export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image'; // Nano Banana Pro : meilleur rendu, ~16 s, affiché après la carte de stats

/** Voix UNIQUE de l'animateur (décision d'Adem, lot LVOX, 26/09 14h) : Gemini 3.8 Flash TTS, voix Fenrir —
 *  même modèle/voix que tools/voices/generate-barks.mjs (rôle "announcer"). Texte envoyé SANS préfixe de
 *  ton : un préfixe fait lire la consigne à voix haute au lieu de s'en servir comme direction d'acteur
 *  (découverte du lot LBK, voir tools/voices/LISEZMOI.md). */
export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_TTS_VOICE = 'Fenrir';

/** Voix Gradium : secours de l'animateur (Gemini en échec ou > GEMINI_TTS_DEADLINE_MS), et chemin utilisé
 *  quand `voiceId` est un identifiant de voix clonée d'un joueur (lot LW2 — Gemini ne clone pas de voix).
 *  Marcus par défaut, Russell en secours si l'appel Gradium lui-même échoue. */
export const GRADIUM_VOICE_PRIMARY = 'r2sIQdqqoqgRJuXw'; // Marcus
export const GRADIUM_VOICE_FALLBACK = '_6Aslh2DxfmnRLmP'; // Russell

export const GRADIUM_BASE_URL = 'https://api.gradium.ai';
export const GRADIUM_TTS_URL = `${GRADIUM_BASE_URL}/api/post/speech/tts`;
export const GRADIUM_TOKEN_URL = `${GRADIUM_BASE_URL}/api/api-keys/token`;

/** Synthèse Gradium : modèle bêta (plus expressif, < 50 ms au premier son) et réglages « HYPE » validés à l'écoute. */
export const GRADIUM_TTS_MODEL = 'gradium-tts-beta';
export const GRADIUM_TTS_CONFIG = { temp: 1.3, padding_bonus: -2.0 };
