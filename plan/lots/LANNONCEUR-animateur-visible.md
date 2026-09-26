# Lot LANNONCEUR · L'animateur visible à l'écran, tout excité, avec ses bulles
Exécution : **Gemini CLI** (+ Nano Banana pour les images), délégué par la session Claude « Map design ». Demande d'Adem (17h14). **Fini et commité à 17h55.**
Lis `CLAUDE.md`, skills `anti-slop`, `threejs-game-ui-designer`, `src/ui/hud.ts` (carte animateur existante, écoute `voice:line` avec `speaker === 'announcer'`), `src/audio/barks.ts`, `src/core/events.ts`.

## Objectif (façon commentateur de Smash / Punch-Out)
Un personnage d'animateur de ring **visible toute la partie** en haut au centre (au-dessus du chrono, sans masquer les 2 vues : ≤ 140 px de haut à 1080p), qui :
1. a **5 expressions** : neutre, excité (bouche grande ouverte), choqué, rieur, cri de KO. Images générées par l'API Gemini image (`gemini-3-pro-image`, appel REST comme `api/sticker.ts` ; clé lue par le script Node dans le fichier d'environnement du dépôt principal, comme `tools/anim/juge-gemini.mjs`, jamais affichée) : un même personnage cohérent (même visage, même tenue : animateur de ring moustachu, micro rétro, veste à paillettes), style sticker cartoon épais qui colle au HUD existant, fond transparent (détourage). Script `tools/annonceur/generate.mjs`, images dans `public/assets/annonceur/<expression>.webp` (≤ 80 Ko chacune).
2. **parle** : pendant chaque `voice:line` de l'animateur, il sautille (échelle 1→1,08 en rythme), et une **bulle de BD** sort de sa tête avec le texte (sous-titre existant déplacé dans la bulle), durée = durée de la ligne, texte tronqué proprement.
3. **réagit** : expression choisie selon l'événement (`hit` crit → choqué, `parry:result` perfect → excité, `stock:lost`/`ko` → cri de KO, `match:start`/`countdown` → excité, sinon neutre) ; retour au neutre après 1,5 s.
4. Entre deux lignes : petite respiration (léger flottement), jamais figé.
Animations en CSS `transform`/`opacity` seulement (60 i/s), valeurs dans les tokens (`src/art/tokens.js` ou `src/ui/theme.ts`).

## Périmètre
Nouveau fichier `src/ui/announcer.ts` (+ styles dans un nouveau bloc de `src/ui/stylesLux.ts` ou nouveau fichier de styles), branché par ≤ 5 lignes dans `src/ui/hud.ts` ou `src/ui/index.ts` ; remplace la carte animateur actuelle au lieu d'en ajouter une 2e. L'agent LUX de l'autre session travaille dans `src/ui/**` : changements minimaux, signale chaque ligne. Interdits : `src/gameplay/**`, `src/scene/**`.

## Preuve
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5370-5379 ; `startMatch({ map: 'galion', split: true })`, `phase === 'fight'` ; déclenche des lignes par `window.ctx.bus.emit('voice:line', …)` et de vrais événements ; captures RÉELLES des 5 expressions en jeu dans `captures/lannonceur/`, regardées. `npm run build` passe. Arrête ton Vite (ton PID seulement).
Rendu : `plan/rendus/LANNONCEUR.md`.
