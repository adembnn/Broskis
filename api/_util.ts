// Petits utilitaires serveur partagés par les fonctions api/*.ts (lot LI).

/** Abandon défensif côté serveur (indépendant du budget côté client) pour ne jamais laisser une requête pendre. */
export function serverTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** Décode un champ image base64, en acceptant un préfixe data URL ou des octets bruts. */
export function stripDataUrlPrefix(input: string): { data: string; mimeType: string } {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(input);
  if (m) return { mimeType: m[1] || 'image/jpeg', data: m[2] };
  return { mimeType: 'image/jpeg', data: input };
}

/** Retire "epic"/"legendary" (et variantes) : bannis par la direction artistique du jeu. */
export function stripBannedWords(text: string): string {
  return text
    .replace(/\b(epic|legendary)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Coupe une phrase à N mots maximum. */
export function capWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

/** Coupe une chaîne à N caractères maximum, sans laisser de mot coupé en plein milieu si possible. */
export function capChars(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}
