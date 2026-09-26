# Lot LE · Banc d'évaluation des animations (`npm run anim`)
Responsable : Claude (sous-agent Sonnet), car c'est de l'évaluation · Dépend de : rien. Doit marcher **avant** le lot LAN : dans ce cas le score est 0 et la liste de ce qui manque est donnée.

## Tes chemins
`tools/anim/**`

## Sortie attendue
1. **`tools/anim/scenarios.json`** : un scénario = `{ name, player, camera: 'side'|'front'|'threeQuarter', steps: [{ hook, args, waitMs }], captureMs: 1600, intervalMs: 66 }`.
   - Scénarios : `idle` (3 s), `walk`, `run`, `jump`, `throw-grenade`, `throwable`, `blaster`, `shield`, `hit-front`, `hit-back`, `ko`, `teeter` (au bord du vide), `parry`, `defense-swing` (bascule vers la vue du défenseur au lâcher, via `camera:cue {shot:'turn-swing', target: défenseur}`).
   - Hooks utilisés : `startMatch`, `animCamera`, `animPlay`, `move`, `jump`, `pickWeapon`, `aim`, `fire`, `parry` (contrat dans `plan/lots/LAN-animation.md`).
2. **`tools/anim/anim-eval.mjs`** (Playwright, en reprenant le lancement du serveur de `tools/capture.mjs`) :
   - ouvre `/?demo=1&animtest=1` ;
   - pour chaque scénario, dans un **contexte navigateur séparé** (donc une vidéo `webm` par scénario, dans `captures/anim/video/<scénario>.webm`) : `animMetrics.reset()`, puis caméra, puis étapes ;
   - capture une image toutes les `intervalMs` et **compose une planche** (grille numérotée, avec le temps sous chaque image) **dans la page, via un canvas 2D** (aucun paquet à installer) → `captures/anim/<scénario>-planche.png` ;
   - lit `window.animMetrics` (échantillons et événements) et calcule les **tests de seuil** du tableau de `plan/lots/LAN-animation.md` ;
   - écrit `captures/anim/rapport.json` : `{ score/100, tests: [{nom, scenario, ok, valeur, seuil}], manquants: [...] }` et un résumé lisible ;
   - si un hook ou `animMetrics` manque : planches avec la caméra par défaut, score 0, liste `manquants`, **sans planter** ;
   - option `--no-gemini` ; sinon, lance `juge-gemini.mjs` à la fin.
3. **`tools/anim/juge-gemini.mjs`** : envoie chaque `webm` (en ligne, 20 Mo maximum) à **`gemini-3.1-pro-preview`** (identifiant en tête de fichier), avec une grille : les 8 critères de l'agent `animateur-exigeant` + les 12 principes de l'animation.
   - Réponse JSON contrainte : `{ scenario, notes: {anticipation, arcsPoids, synchroLacher, contactSol, regard, reactions, idle, environnement}, note, pires: [{ t, probleme }] }`.
   - Écrit `captures/anim/gemini-verdict.json`.
   - La clé vient de `process.env.GEMINI_API_KEY`, que le script remplit lui-même en analysant `.env` à la racine, sans paquet `dotenv`.

## Contrôles
- `node --check` sur chaque script.
- `npm run anim -- --no-gemini` doit marcher de bout en bout sur la version actuelle (planches produites, score 0, manquants listés).
- Ta copie n'a pas de `.env` : le juge Gemini sera testé par la session principale.

## Commit
Tes fichiers seulement (`tools/anim/**`), avec un message en français qui se termine par `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Ne pousse pas.
