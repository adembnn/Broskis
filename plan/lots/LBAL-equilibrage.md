# Lot LBAL · Simulateur d'équilibrage + niveaux de difficulté
> **Obsolète depuis le pivot temps réel (15h25)** pour : simulation au tour par tour, feintes, KO compté en tours ; l'agent `equilibreur` juge désormais le temps réel. Référence : `plan/PIVOT-TEMPS-REEL.md`.
Exécution : **Gemini** · Évaluation : agent `equilibreur` · Dépend de : LG (fusionné)

## Pourquoi
Adem veut 4 niveaux (facile, moyen, difficile, hardcore) et un jeu « équilibré en fonction de la personne ». Source : recherche game design du 26/09. Règle d'or : **l'IA interprète, le code arbitre** ; Gemini ne fixe jamais les nombres.

## Tes chemins
`tools/balance/**`, `src/gameplay/rules.ts` (nouveau), `src/gameplay/difficulty.ts` (nouveau). **Ne modifie pas `tuning.ts`** : propose les nouvelles valeurs dans ton rendu, elles seront appliquées après validation.

## À livrer
1. **`src/gameplay/rules.ts`** : moteur de règles **pur**, de la forme `(état, action, rng) → état`, sans three, Rapier ni DOM, qui réutilise les valeurs de `tuning.ts` et le hasard de `src/core/rng.ts`.
   - Résolution analytique : la touche dépend de la précision, de la distance et du couvert ; la parade est tirée d'un profil ; il y a éjection si le recul dépasse la distance au bord (carte 2D simplifiée).
2. **`tools/balance/sim.ts`**, lancé par `node tools/balance/sim.ts --quick|--full|--replay` (Node 25 exécute le TypeScript directement ; sinon passe par `tsx` s'il est déjà installé, sans rien ajouter).
   - **Profils de parade** (erreur de timing suivant une loi normale) : novice (σ 140 ms, biais +30 ms, 10 % sans appui), moyen (σ 90 ms), expert (σ 50 ms).
   - **Bots** : Aléatoire, Glouton, Pousseur (vers le vide), Tortue (couvert et bouclier), Expert (un coup + riposte), plus des bots restreints (« jamais X », « toujours X »).
   - **Volume** : `--quick` = 10 000 matchs, `--full` = environ 110 000. Contenu testé : les 864 archétypes (27 répartitions × 8 traits × 4 catégories), les 8 presets, et les persos de 80 à 120 PV.
   - **Métriques et seuils** :

| Métrique | Cible | Rouge |
|---|---|---|
| Victoire par catégorie et par trait | 45 à 55 % | < 40 ou > 60 |
| Écart entre répartitions | ≤ 10 pts | > 15 |
| Avantage du premier joueur | 47 à 53 % | > 56 |
| KO médian | tour 5 ou 6 ; < 5 % avant le tour 3 ; ≤ 25 % en mort subite | un coup à ≥ 50 PV |
| KO par sortie de ring | 35 à 60 % | < 20 ou > 75 |
| Retours (le vainqueur a été mené de 30 PV) | 20 à 35 % | < 10 |
| Expert contre novice | 75 à 90 % | < 65 ou > 95 |

   - **Matrice cible entre catégories** (victoire de la ligne contre la colonne) :

| | BLASTER | GRENADE | THROWABLE | SHIELD |
|---|---|---|---|---|
| BLASTER | — | 55 | 55 | 40 |
| GRENADE | 45 | — | 45 | 60 |
| THROWABLE | 45 | 55 | — | 50 |
| SHIELD | 60 | 40 | 50 | — |

   - **Plafonds anti-arme dominante** :
     - 35 PV par coup (hors SUPER) ;
     - 6 projectiles par tour ;
     - 25 PV de soin par match ;
     - produit NICE × série × renvoi × trait ≤ ×2,5 ;
     - un trait vaut 1 point de stat et a un défaut visible (tableau des traits de la recherche, à reprendre).
   - **Sortie** : `captures/balance/rapport.json` + `rapport.md` (IC 95 %, archétypes extrêmes, 3 réglages proposés au plus). Code de sortie 1 en cas d'alerte rouge. Les 50 graines rejouées doivent donner le même résultat.
3. **`src/gameplay/difficulty.ts`** : les 4 niveaux contre l'IA.

| Levier | Facile | Moyen | Difficile | Hardcore |
|---|---|---|---|---|
| Visée IA (σ lacet / σ puissance) | 6° / 15 % | 4° / 10 % | 3° / 6 % | 2° / 4 % |
| Choix du coup | au hasard dans la meilleure moitié, 25 % d'erreurs | top 5, 10 % d'erreurs | top 3 + riposte | meilleur coup, profondeur 2 |
| Parade IA (σ / sans appui) | 150 ms / 20 % | 100 / 10 % | 65 / 5 % | 45 / 2 % |
| Feintes / NICE / mord à tes feintes | 0 / 10 / 50 % | 30 / 30 / 30 % | 60 / 50 / 15 % | 90 / 70 / 5 % |
| Fenêtres du joueur | ×1,4 | ×1,15 | ×1 | ×0,85 pour les deux, plancher 40 ms |
| Dégâts reçus | ×0,8 | ×1 | ×1 | ×1 |
| Aides de visée | complètes + « PRESS SPACE » | trajectoire + cercle | 60 % de la trajectoire | 35 %, sans cercle |
| Victoire visée (joueur moyen) | 85 % | 60 % | 45 % | 25 % |

   - L'IA pare sur **les mêmes fenêtres** que l'humain. Pas d'IA surhumaine ni de bonus caché.
   - **Adaptation solo** : une cote s de 0 à 100, avec les bandes Facile 0-30, Moyen 25-55, Difficile 50-80, Hardcore figé.
     - Après un match : +6 (large victoire), +3, −3, −6, et −8 de plus après 2 défaites de suite.
     - 1er match en bas de bande.
     - Pendant un match, seuls les choix de l'IA bougent : si elle mène de 40 PV, température ×1,5.
     - Affiché honnêtement : « Adaptive bot: ON », « Bot Lv 42 → 47 ».
   - **2 joueurs** : aides choisies et visibles (Chill : fenêtres ×1,4, jauge BRO ×0,5 ; Big Shield une fois par match). « Bro Boost? » est proposé au perdant après ≥ 50 PV d'écart ou 3 défaites. Rattrapage écrit dans les règles : la Caisse tombe du côté du joueur mené (60/40).

## Contrôles
- `node tools/balance/sim.ts --quick` tourne en moins de 30 s et produit le rapport.
- `npm run build` passe.
- L'agent `equilibreur` note ensuite le rapport.
