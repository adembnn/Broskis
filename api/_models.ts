// Identifiants de modèles / voix externes — regroupés ici pour être faciles à changer (lot LI).
// Vérifiés le 26/09/2026 dans AI Studio. `gemini-2.5-flash-image` s'éteint le 2/10 : ne pas l'utiliser.
// À revérifier avec `node tools/test-ia.mjs` si un modèle se met à échouer.

/** Texte + vision EN DIRECT (scan d'objet pendant un match) : le joueur attend, ça doit rester rapide. */
export const GEMINI_TEXT_MODEL = 'gemini-3.5-flash';

/** Texte, PRÉ-GÉNÉRATION seulement (répliques de l'animateur préparées pendant la présentation des armes) :
 *  la latence est tolérable ici (voir TIMEOUTS.commentary), donc un modèle différent/plus lourd est possible
 *  sans risque pour le direct. Même valeur que GEMINI_TEXT_MODEL par défaut ; à séparer si un modèle plus
 *  qualitatif est confirmé par `node tools/test-ia.mjs` (jamais changé à l'aveugle sans ce test). */
export const GEMINI_COMMENTARY_MODEL = GEMINI_TEXT_MODEL;

/** Image (sticker cartoon) : Nano Banana 2 Lite, ~4 s. */
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

/** Voix Gradium de l'animateur : Marcus par défaut, Russell en secours si l'appel échoue. */
export const GRADIUM_VOICE_PRIMARY = 'r2sIQdqqoqgRJuXw'; // Marcus
export const GRADIUM_VOICE_FALLBACK = '_6Aslh2DxfmnRLmP'; // Russell

export const GRADIUM_BASE_URL = 'https://api.gradium.ai';
export const GRADIUM_TTS_URL = `${GRADIUM_BASE_URL}/api/post/speech/tts`;
export const GRADIUM_TOKEN_URL = `${GRADIUM_BASE_URL}/api/api-keys/token`;
