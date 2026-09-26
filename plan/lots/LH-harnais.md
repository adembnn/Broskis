# Lot LH · Correctifs du harnais
Responsable : Adem (sous-agent Sonnet) · Coût : faible · Dépend de : rien

## Contexte
L'agent `inspecteur-harnais` a noté le harnais 6/10. Ce lot corrige ce qui peut coûter des heures aujourd'hui.

## Tes chemins
`.claude/**`, `tools/**`, `LISEZMOI.md`, `CLAUDE.md`, `.env.example`, `.gitignore`

## Sortie attendue
1. **Base du pack** : interdire le script `create_threejs_game.py` du pack threejs-game-skills, qui écrase `package.json` et `tsconfig.json`. Le dépôt actuel EST la base. Corriger LISEZMOI (étape 0) et `CLAUDE.md`.
2. **Skills** : déplacer 7 skills `threejs-*` vers `reference/threejs-game-skills/` (garder `threejs-debug-profiler` et `threejs-game-ui-designer`). Mettre à jour les renvois dans `rendu-premium` et `game-feel`. Dans `CLAUDE.md`, nommer le skill par tâche :
   - scène → `rendu-premium` ;
   - action → `game-feel` + `son` ;
   - IA → `ia-en-jeu` ;
   - git → `discipline-code`.
3. **LISEZMOI, section « 2e PC »** : clone, `npm ci`, `npx playwright install chromium`, `git config user.name/email`, `.env`, `claude`. L'installeur reste réservé au 1er PC.
4. **Captures** : `tools/capture.mjs` prend une option `--out captures/<nom>`, pour que deux agents en parallèle ne s'écrasent plus. Il signale aussi un hook absent de `parcours.json` au lieu de l'ignorer.
5. **Build** : `fin-de-tour.mjs`, au 2e passage (`stop_hook_active`), relance le build. Succès → commit ; échec → `systemMessage` visible par l'humain. Utiliser le `cwd` du JSON reçu (pour les worktrees).
6. **Garde-fou** : `garde-fou.mjs` bloque aussi `git push origin +main`, `git clean --force`, `git checkout -- .` et `git restore .`, ainsi que toute lecture de `.env` (insensible à la casse ; grep, sed, node, Select-String).
7. **Heure** : un hook `UserPromptSubmit` d'une ligne donne l'heure et le temps restant avant le gel de 18h.
8. **Modèles et descriptions des agents** :
   - `inspecteur-harnais` passe en `model: sonnet` ;
   - tous les agents sonnet reçoivent `effort: medium` ;
   - la description de `critique-aaa` est alignée sur `CLAUDE.md` (une fois par heure, refus sous 7 avant 15h, sous 8 ensuite) ;
   - `directeur-artistique` : le mode 3 directions se déclenche si `tokens.js` contient encore `#000000` ou TODO.
9. **Divers** :
   - `settings.json` : `npm install` et `npm i` passent en `ask` ;
   - ajouter `.env.example` avec `GEMINI_API_KEY=`, `GRADIUM_API_KEY=`, `TRIPO_API_KEY=` (sans préfixe VITE) ;
   - rituel de synchro dans LISEZMOI : `git pull --no-rebase`, puis `git push`, au moins toutes les heures.

## Contrôles
`node --check` sur chaque script `.mjs`. Test du hook de fin de tour dans une copie jetable du dépôt (voir le rapport de l'inspecteur).

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
