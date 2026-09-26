# Lot LBAL2 · Corriger le simulateur puis régler l'équilibrage jusqu'aux cibles
Exécution : **Gemini** · Évaluation : agent `equilibreur` · Dépend de : LBAL (fusionné)

## Constat (premier `node tools/balance/sim.ts --quick`, 13h45)
- **Bugs probables du simulateur**, parce qu'impossibles en jeu :
  - avantage du joueur 1 = **0,9 %** (cible 47 à 53 %) ;
  - expert contre novice = **0,0 %** (cible 75 à 90 %).
  - Cherche l'inversion (gagnant compté à l'envers, rôles ou profils mal passés, graine partagée).
- **Réglage** :
  - KO médian au tour 7 (cible 5 ou 6) et 68,8 % de mort subite (cible ≤ 25 %) : les dégâts sont trop faibles au début ;
  - **117 KO en un coup à ≥ 50 PV** (rouge) : plafonnement absent ou contourné ;
  - sortie de ring à 78 % (cible 35 à 60 %) : recul trop fort ;
  - retours à 48,9 % (cible 20 à 35 %).
- **Déjà bon** : la matrice entre catégories (47 à 53 %).

## Tes chemins
`tools/balance/**`, `src/gameplay/rules.ts`, `src/gameplay/difficulty.ts`, **et cette fois `src/gameplay/tuning.ts`** (valeurs seulement, pas de changement de structure).

## Méthode
1. Corrige d'abord les 2 bugs du simulateur, et prouve-le : un test simple (bot Expert contre bot Aléatoire) doit donner plus de 80 % pour l'Expert.
2. Puis règle `tuning.ts` par petites touches, en relançant `--quick` après chaque changement :
   - un seul paramètre à la fois ;
   - aucune retouche d'un écart de moins de 3 points ;
   - respecte les plafonds de `plan/lots/LBAL-equilibrage.md` (35 PV par coup, produit des multiplicateurs ≤ ×2,5).
3. Termine par `--full` puis `--replay`. Objectif : **aucune alerte rouge** et toutes les métriques en cible, ou au moins en orange.
4. Écris le journal des réglages (avant → après → effet mesuré) dans `captures/balance/journal.md`, et copie le rapport final dans `plan/rendus/LBAL2-rapport.md`, car `captures/` n'est pas versionné.

## Contrôles
`npm run build` ; `node tools/balance/sim.ts --full` sans alerte rouge ; `window.__selftest()` reste vert (lot LG).
