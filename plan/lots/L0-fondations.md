# Lot L0 · Fondations et contrats
Responsable : Adem (session principale Claude) · Coût : moyen · **À pousser avant tout autre lot de code**

## Contexte
Pose les contrats décrits dans `plan/README.md` pour que tous les autres lots puissent coder en parallèle sans se toucher.

## Tes chemins
- `src/core/**`
- `src/main.ts`, `index.html`, `src/style.css`
- `package.json`, `package-lock.json`
- les **stubs** `src/{scene,gameplay,ui,ia,audio}/index.ts` : chacun exporte un `install(ctx)` vide, que le lot propriétaire remplacera
- `public/assets/characters/`

## Sortie attendue
- `src/core/` :
  - `types.ts` (contrats du README) ;
  - `events.ts` (noms figés) ;
  - `bus.ts` (on, off, emit, once ; repris de `bagarre-de-taverne/src/core/events.js`) ;
  - `loop.ts` (boucle, `setSlow`, `addSystem`) ;
  - `state.ts` (état central + `window.gameState`) ;
  - `rng.ts` (graine) ;
  - `hooks.ts` (`window.gameHooks`, des stubs qui émettent les événements) ;
  - `demo.ts` (`?demo=1`, régie F1 à F5 et F9) ;
  - `physics.ts` (initialisation de Rapier) ;
  - `ctx.ts`.
- `src/main.ts` : crée le rendu three, le `ctx`, puis appelle les `install()` de chaque dossier. **Il ne fait qu'assembler.**
- Dépendances : `@dimforge/rapier3d-compat`, `@google/genai`.
- Les 6 persos KayKit sont copiés dans `public/assets/characters/`.
- Un écran de test minimal : fond coloré par les tokens et un perso KayKit en `idle`. `window.gameState` est exposé.

## Contrôles
`npm run build`, puis `node tools/capture.mjs` : une capture non vide, `gameState exposé : OUI`.

## Commit
Tes fichiers seulement, puis `git pull --no-rebase` et `git push`. Mets `plan/SUIVI.md` à jour.
