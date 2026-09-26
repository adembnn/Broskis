# HANDOFF — Bagarre de Taverne (pour la session Claude Code locale d'Adem)

Tout ce qui a été fait dans la session cloud (26/09/2026, {Tech: Europe} AI Gaming Hack, Paris). Lis ce fichier puis `GAME_SPEC.md`.

## 1. Le jeu
Duel de sorts 3D cartoon dans une taverne. Sorts écrits en texte libre → interprétés par un LLM en JSON fermé → moteur déterministe (« l'IA propose, le code décide »). Décor chimique (feu, eau, foudre, huile, gel…), réflexes souris (parade, attraper-lancer, table-bouclier, dash, glyphes), adversaires IA à personnalités, metteur en scène, foule, commentateur, moments « wow » (lois, miroir, possession, météo…).
- Contrat complet : `GAME_SPEC.md`.
- Version jouable publiée (artifact claude.ai, v6) : https://claude.ai/artifact/H2S7boZBpE2Jy5Zf5dQJwu

## 2. Lancer
```
npm install
npx vite                    # dev : http://localhost:5173
node build-artifact.mjs     # → arena-artifact.html (un seul fichier, ~5.5 Mo)
```
Git : l'historique complet est dans `../bagarre-de-taverne-handoff/bagarre-de-taverne.bundle` (`git clone bagarre-de-taverne.bundle`). Branches : `master` (tout fusionné) + `feat-visuals`, `feat-ai`, `feat-mouse`, `feat-wow`.

## 3. Architecture
- `src/main.js` crée `ctx` et installe les modules `install(ctx)` : `EXTRA_MODULES = [installReflexes, ...AI_MODULES, installWow]`.
- `src/core/` : `events.js` (bus on/emit/off), `entities.js`, `loop.js` (setSlow/clearSlow, addSystem), `combat.js` (dégâts, mana, étourdissement), `duel.js` (`ctx.duel.act`, `ctx.duel.cast`, `ctx.actionHandlers[kind]`), `ui.js`, `debug.js` (`window.arena`, `render_game_to_text()`).
- `src/chem.js` + `src/rules.js` + `src/surfaces.js` : moteur chimique (tick 250 ms, voisinage, flaques).
- `src/oracle.js` : texte → action JSON (Claude `window.claude.use('sample')` / Gemini `VITE_GEMINI_API_KEY` / parseur local de secours).
- `src/ai/` : brain, roster, llm, habits, personalities, director, crowd, commentator, firsts, modifiers.
- `src/input/` : parry, grab, defense, glyphs, dollar ($1 Unistroke), pointer.
- `src/wow/` : law, mirror, possess, weather, onomato, critical, endscreen, summon.
- `src/kaykit.js` + `src/assets/kaykit/` : personnages KayKit CC0 (GLB meshopt).

## 4. Pièges connus (importants)
- **Artifact claude.ai = CSP stricte** : aucun `fetch`, même vers `data:`. D'où le décodage base64 manuel + `loader.parse` dans `kaykit.js` (et `createImageBitmap` neutralisé). Ne pas revenir à `loadAsync`.
- **`window.claude.use('sample')`** : appels uniquement au premier plan (action du joueur). `llm.json(..., {foreground:true})` sinon il renvoie null. Jamais depuis un timer/boucle (barde, foule, director restent en local).
- `index.html` affiche les erreurs à l'écran (`#bootError`) : utile en démo.
- **Non fait** : passe d'intégration complète après fusion des 4 branches (tests `tests/*.py` à relancer, conflits sémantiques possibles : possession vs routage souris des réflexes ; brain qui combine personnalités + réflexes + wow). Draw calls ~104-115 (budget 150). Test du lustre sensible au timing. Avertissement Rapier init déprécié.
- Test CSP réaliste : `shots/real_flow.py` (non inclus dans l'archive, à recréer si besoin : envelopper l'artifact avec une meta CSP `connect-src 'none'` + mock `window.claude`).

## 5. Tests
Playwright Python, Chromium avec `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Fichiers : `tests/phase1.py`, `phase2_ai.py`, `phase2_ai_llm.py`, `phase2_mouse.py`, `phase2_wow.py`, `visuals.py`, `verify_artifact.py`, `mock_test.py`. Hooks : `window.arena`, `window.__fast`.

## 6. Documents joints (dans ce dossier)
- `recherche-hackathon-jeux-ia.md` : ce qui gagne en hackathon de jeu IA (sources).
- `design-system-cartoon.md` + `toon-kit.js` : direction artistique (toon 3 paliers, contours #2B1D14, UI parchemin, anti-« AI slop » ; vérifier avec `npx impeccable detect index.html src/style.css`).

## 7. Autres chantiers sur ce PC
- `~/repos/ai-gaming-hack/` : kit commun avec Titouan + **installeur Blender MCP** `INSTALLER.bat` (fermer Blender avant ; journal `install.log`). Pas encore exécuté. `.mcp.json` utilise `uvx mcp-for-blender`.
- `~/repos/incanta/` : premier prototype (sorts écrits contre des vagues) — artifact https://claude.ai/artifact/2ngBBQNG2S1oCKfv23FBit

## 8. Prochaines étapes suggérées
1. `npm install && npx vite`, jouer une partie, relancer tous les `tests/*.py`, corriger les régressions.
2. Évaluation : playtest, critique design (impeccable), perf (draw calls).
3. Intégrer Gradium (voix clonée du joueur, commentateur) et la photo → avatar, idée d'origine.
4. Rebuild + republier l'artifact avant 19:00.

Préférences d'Adem : réponses en français, brèves mais claires, termes techniques expliqués, sources citées, esprit critique, le tenir au courant pendant les tâches longues.
