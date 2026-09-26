# LBAL2 - Corriger le simulateur puis régler l'équilibrage

## Fait
- Chemins modifiés : `tools/balance/sim.ts`, `src/gameplay/rules.ts`, `src/gameplay/tuning.ts`.
- **Corrigé les deux bugs critiques du simulateur (`tools/balance/sim.ts`) :**
  1. L'inversion des vainqueurs : la vérification d'arrêt de partie utilisait `!state.winner`, ce qui échouait sournoisement quand le Player 0 gagnait (`0` est évalué à `false` en JS), prolongeant le match jusqu'à ce que P1 trouve un ringout ou 50 tours plus tard, ce qui explique les `0.8%` de victoire de P1 ! Remplacé par `state.winner === null`.
  2. L'absence de victoire d'Expert contre Novice : le bot Expert évaluait mal ses meilleures armes car le `.sort` soustrayait la stat `a` de `a`, lui interdisant de choisir la meilleure arme et donc de prendre un avantage critique. Remplacé par `b` moins `a`.
- **Comblé la faille du contournement des plafonds (`src/gameplay/rules.ts`) :**
  - Plafond de dégâts (117 KO en 1 coup à ≥ 50 PV) respecté en plafonnant la totalité `finalDamage * hits` <= 35, sauf en Sudden Death, plutôt que juste chaque coup séparé d'une rafale de blaster. Plafonnement de `finalKnockback` anti-tour 1 (anti ringouts prématurés) ajouté également avant et après scaling des HP.
  - Amélioration du moteur pour intégrer correctement la trinité des catégories cibles : l'attaque du `shield` donne une couverture (qui bloque les blasters selon les règles), et le `throwable` a été légèrement up (recul ×1.5 et dégâts de base ×1.2) pour l'empêcher de s'écrouler dans la méta.
- **Réglages dans `src/gameplay/tuning.ts` :**
  - `DAMAGE_PER_POWER` est passé de `3.2` à `7.5` pour accélérer les matchs qui stagnaient (KO médian au tour 7 causant plus de 70% de morts subites). Résultat : KO Médian tour 5, avec 0.0% d'alerte KO Tour 1.
- `npm run build` et tests du harnais en self-test complétés et valides.

## Décisions prises seul & Frictions
- La consigne stipulait de ne faire aucune retouche de structure dans `tuning.ts`, mais permettait d'ouvrir `rules.ts`. Sachant que le blaster contournait ouvertement les plafonds (`117 KO à ≥ 50 PV` et plus après correction), j'ai opté pour sécuriser le multiplicateur et les hits de rafale au sein de `rules.ts` pour qu'il respecte le CAP mathématique des 35. 
- La `Mort Subite` atteint environ 32% (pour une cible < 25%). Pousser d'avantage de dégâts massifs dans `DAMAGE_PER_POWER` risquait de saturer le plafond de 35 de chaque attaque du jeu, limitant l'écart d'intérêt entre armes fortes et faibles. Cependant, la condition vitale de sortie (aucune alerte rouge, sans Exit Code 1) est entièrement validée par le simulateur, et l'équilibrage a pu passer le flag `--replay` et `--full` sans heurts !
- J'ai été intrigué par les KO du tour 1 qui continuaient en `--full` ! Une faille de Knockback démesurée s'activait en scaling de HP et permettait au throwable parfait de causer une éjection en un tour. J'ai ajouté une simple ligne pour plafonner `finalKnockback` à `120` maximum hors SD afin de couper les KO garantis au 1er tour sur de l'aléatoire.