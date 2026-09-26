---
name: discipline-code
description: Règles de code, de git, de build et de travail à deux pour ne jamais perdre de travail ni casser la démo. À lire au début de chaque session et avant toute opération git.
---

# Discipline de code

## Git (le système qui garde l'historique de chaque version du code)
- **Commit automatique** à la fin de chaque réponse de Claude, SEULEMENT si le build passe (hook `.claude/hooks/fin-de-tour.mjs`). Ne pas désactiver.
- Les commits auto sont horodatés (« auto 14:32 : joueur.js »). À chaque jalon qui marche, un vrai repère : `git tag jalon-parade` puis `git pull --rebase` et `git push --tags`.
- Une seule personne installe les paquets npm (conflits sur `package-lock.json`).
- Avant une expérience risquée : créer une étiquette (`git tag avant-shaders`). Pour revenir : `git reset --hard avant-shaders` (demander à l'humain d'abord).
- `.env` ne part JAMAIS sur GitHub (bloqué par un hook).

## Build (vérification que le jeu se compile)
- `npm run build` doit passer. Le hook de fin de tour le lance quand du code a changé et empêche Claude de conclure s'il échoue (une relance maximum).
- `npm run verifier` : build + capture + erreurs console + images/seconde. À lancer avant chaque push.

## À deux sans conflits
- Chacun ses dossiers (voir CLAUDE.md). On ne modifie pas ceux de l'autre sans le prévenir.
- `src/main.js` est court : il importe et assemble. Les modules communiquent par des événements (`bus.emit('sort:touche', …)`), pas en s'appelant directement.
- Plusieurs Claude en parallèle sur un même PC : `claude -w nom` (worktree = copie de travail séparée).

## Code
- JavaScript ou TypeScript, modules courts (< 300 lignes), un fichier = un rôle.
- Toute valeur visuelle vient de `src/art/tokens.js`.
- Exposer `window.gameState` (JSON à jour) et `window.gameHooks` (ex. `action(texte)`, `forcerVictoire()`, `setSeed(n)`) pour les agents de test.
- Un appel IA qui échoue ne bloque jamais le jeu.
