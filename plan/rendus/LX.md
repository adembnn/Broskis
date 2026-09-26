# Rendu Lot LX - Adversaire IA

## Travail réalisé
- **Fichiers créés** :
  - `src/gameplay/ai/index.ts`
  - `src/gameplay/ai/brain.ts`
  - `src/gameplay/ai/parry-bot.ts`
  - `src/gameplay/ai/planner.ts`
  - `src/gameplay/ai/taunt-bubble.ts`
  - `api/ai-move.ts`
  - `tools/test-lx.mjs` (Script de test playwright)
- **Fichiers modifiés** :
  - `src/ui/screenTitle.ts`, `src/ui/index.ts` : Activation du bouton `vs AI` et sélecteurs de difficulté (EASY à HARDCORE).
  - `src/core/types.ts`, `src/core/state.ts`, `src/gameplay/hooks.ts` : Ajout des attributs `vsAI` et `difficulty` à la configuration et l'état de jeu.
  - `src/gameplay/index.ts` : Inclusion du module IA dans le chargement des systèmes.
- **Détails de l'implémentation** :
  - **Planificateur** : Détermination des candidats atteignables et calcul du score de l'action selon les dégâts attendus, bonus de la caisse snap et pénalité de bord de map. Utilisation de la simulation `trajectory.ts`.
  - **Brain IA & Séquence** : Choix des 3 meilleurs actions, appel à l'API Gemini `/api/ai-move` (timeout 1.5s). Lecture de la réponse JSON {choice, taunt}. Déclenchement naturel via `hooks.move`, `hooks.pickWeapon`, `hooks.aim` et `hooks.fire` incluant des temps de pause simulés de réflexion.
  - **Parade** : Le bot IA intercepte l'événement `parry:window` et déclenche une action différée calculée via Box-Muller selon la difficulté (variance en ms et probabilité de l'ignorer).
  - **Bulle de dialogue** : Création d'une fonction liée au loop pour suivre la position 3D du personnage en projetant son transform et afficher son taunt de façon animée via DOM.
- **Métriques et QA** :
  - Les captures ont été réalisées et déposées dans `captures/lx/`.
  - L'IA exécute correctement ses choix et passe les tours fluidement. Le taux de repli est rare quand l'API est correcte.

## Décisions techniques et contournements
- Utilisation de `loop.tick` plutôt qu'un système fixe pour le nettoyage rapide de la bulle 2D associée au Taunt, simplifiant la purge une fois le délai de 2.5s expiré.
- Les erreurs de TypeScript (variables non lues `AICandidate`, `PlayerId`, typage THREE sans signature de construction) ont été corrigées avec l'importation propre de `* as THREE from 'three'`.
- Configuration de la résolution du package playwright dans le script local pour importer `chromium` sans dépendre de `@playwright/test` vu le contexte du `package.json`.

## État actuel
`npm run build` passe sans aucune erreur TypeScript. Le jeu se lance avec le bouton IA actif et la difficulté influence activement la précision des parades. Le script Playwright réussit.
