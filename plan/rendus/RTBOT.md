# Rendu RTBOT · Adversaire IA en temps réel (agent Claude Opus, 15h40 → 17h30)

Branche : `worktree-agent-ad2a7fb00893f8c65` (à jour avec `main` à 17h09, arènes agrandies LMAP3 comprises ; `npm run build` passe). Rien n'est poussé.

## En 3 lignes
1. **Un juré seul peut jouer contre le bot** : écran-titre → `vs AI` → niveau → match. Le bot pilote P2 **uniquement par les entrées** (`gameHooks.input`, comme un clavier) : il se déplace en pas chassés, tire avec l'arme adaptée à la distance, charge, bloque, tente la parade parfaite, esquive, saute, remonte au bord, prend la caisse Snap.
2. **Gemini est le stratège** : toutes les 8 s, un résumé du duel part à `/api/ai-move` ; Gemini choisit la posture (`aggressive`, `defensive`, `edgeguard`, `bait`), l'arme à privilégier et une provocation (bulle au-dessus du bot + voix de son rôle). Le réflexe (20 Hz, local) décide seul du moment de chaque geste : une IA de langage ne réagit pas en 150 ms. Gemini interprète, le code arbitre.
3. **Mesuré en vrais matchs simulés** (humain simulé contre le bot, jeu complet dans le navigateur, arènes actuelles) : **Moyen gagne 3 matchs sur 6 (50 %)**, **Facile 0 sur 6** (et 0 sur 9 sur les anciennes arènes) ; Difficile et Hardcore sont réglés au-dessus. **Gemini répond en 1,2 s (médiane)**, 3 réponses sur 4 arrivent dans les 2 s sur une machine saturée ; sinon **le bot garde sa posture dans 100 % des cas** (38/38 échecs réels, 6/6 en « Gemini lent » forcé).

## Chiffres

### Taux de victoire du bot contre l'humain simulé (réglage final, arènes actuelles LMAP3, 2 vies, 3 maps en rotation, jeu à ×1)
| Niveau | Victoires du bot | Archipel | Galion | Cuisine | Durée moy. | Coups portés humain / bot | Précision humain / bot | Parades parfaites du bot | Blocages du bot | Gemini répond en 2 s |
|---|---|---|---|---|---|---|---|---|---|---|
| **Moyen** | **3 / 6 (50 %)** | 1/2 | 1/2 | 1/2 | 89 s | 46,7 / 28,0 | 0,49 / 0,46 | 5,3 par match | 10,3 par match | 55 / 68 (81 %) |
| **Facile** | **0 / 6 (0 %)** | 0/2 | 0/2 | 0/2 | 60 s | 32,3 / 19,3 | 0,47 / 0,57 | 0,7 par match | 2,5 par match | 31 / 45 (69 %) |

Lecture : le bot Moyen encaisse plus de coups qu'il n'en donne, mais en bloque une bonne part (dégâts ÷ 3), renvoie ~5 tirs par match en parade parfaite et se place côté centre : ses coups poussent l'humain vers le bord, ceux de l'humain le repoussent vers l'intérieur.

Humain simulé (`src/gameplay/ai/sim-human.ts`, écrit AVANT les réglages et jamais retouché pour arranger les chiffres) : un joueur « moyen » qui se place à 7-11 m en pas chassés, tire dès qu'une arme est prête (0,3 à 0,9 s de délai, charge au hasard), bloque un tir sur deux ~0,3 s après l'avoir vu (sans viser la parade parfaite), évite le bord et remonte s'il tombe.

### Historique des réglages (même humain simulé, 2 vies, maps en rotation)
| Étape | Arènes | Facile | Moyen | Difficile |
|---|---|---|---|---|
| 1re version (15h55) | anciennes | 1/4 | 1/5 | 3/5 |
| pas chassés dominants, contrôle du centre, couverts contournés, plus de saut par-dessus le bastingage du Galion, point visé vérifié contre les vrais bords | anciennes | **0/9** | 6/17 (35 %) | — |
| Moyen renforcé en défense (≈ le Difficile actuel) | nouvelles (LMAP3, 26-28 m) | — | 4/4 (+1 match sans vainqueur, jeu figé à ×0,15) | — |
| **Moyen adouci (réglage final)** | nouvelles | **0/6** | **3/6** | — |

Les nouvelles arènes, plus grandes, avantagent nettement le bot (contrôle du centre, l'humain simulé recule jusqu'aux bords) : d'où le Moyen adouci en fin de lot.

### Gemini (`/api/ai-move`, `GEMINI_TEXT_MODEL`)
Deux séries, machine saturée par les autres agents (RAM libre de 0,1 à 3 Go) : A = les 12 matchs du tableau ci-dessus (réglage final, 113 appels, une seule partie à la fois) ; B = 9 matchs Moyen plus tôt (61 appels, 3 parties en même temps).

| Mesure | A (réglage final) | B |
|---|---|---|
| Réponses reçues dans les 2 s | **86 / 113 (76 %)** | 47 / 61 (77 %) |
| Temps de réponse (réponses reçues) | min 0,94 s · **médiane 1,21 s** · 90 % sous 1,78 s · max 1,95 s | min 0,96 s · médiane 1,21 s · 90 % sous 1,44 s · max 1,89 s |
| Échecs | 25 : 20 délais du serveur (1,9 s), 5 abandons du jeu à 2 s ; aucune erreur de format, aucune posture hors liste | 13 : 5 délais du serveur, 8 abandons à 2 s |
| **Posture gardée quand Gemini ne répond pas** | **25 / 25 (100 %)** | **13 / 13 (100 %)** |
| Changements de posture | 63 en 12 matchs (≈ 5 par match) ; en fin de match : `edgeguard` 7, `defensive` 3, `aggressive` 1, `bait` 1 | 28 en 9 matchs |

- Appels directs, machine plus calme (`curl`) : 1,00 s et 1,15 s.
- Test « Gemini lent » (le banc retarde chaque réponse de 2,5 s) : 6 appels sur 6 abandonnés à 2 s, posture de départ gardée tout le match, bot toujours actif (23 tirs, 14 coups portés).
- Provocations réelles : « Seventy-eight percent already? You are done! » · « Your little blaster won't break my defense! » · « One slip and you are swimming! » · « Nice blaster, but my shield is ready! » · « Over one hundred percent and on the brink! ».

Une provocation coupée en pleine phrase (« Careful, you are way too close to the ») a été vue une fois : corrigé (3 à 8 mots demandés, coupe à la dernière ponctuation, sinon phrase de secours).

## Ce que fait le bot (`src/gameplay/ai/`)
| Fichier | Rôle |
|---|---|
| `bot.ts` | Réflexe à 20 Hz. **Défense** : voit chaque tir adverse après son temps de réaction, prévoit l'impact (vol simulé, gravité comprise), puis bloque, vise la parade parfaite (appui ~75 ms avant l'impact, dispersion de `difficulty.ts`), esquive en pas chassé ou double saut, sort du rayon d'une grenade ; change de sens de pas chassé quand il voit partir un tir ; défend plus quand son % monte. **Attaque** : arme adaptée à la distance (blaster 8-12 m, grenade 10-16 m, throwable 5-9 m), ligne de tir libre (grenade : cloche libre), charge selon la distance et plus forte quand l'adversaire a un % élevé, attend une cible lisible selon sa précision, bouclier quand l'adversaire charge. **Placement** : pas chassés, côté centre de l'adversaire (ses coups l'envoient vers le bord), point visé loin des vrais bords (plus loin quand son % monte), contourne les couverts, caisse Snap si plus proche de lui. **Survie** : remonte du bord, double saut de rattrapage, jamais de saut par-dessus un bastingage. |
| `levels.ts` | 4 niveaux : réaction 450 / 300 / 200 / 130 ms, défense, parade parfaite, agressivité, précision, pas chassés, marge au bord, pauses « humaines ». Effet de chaque posture de Gemini. **Aucun bonus de stats** : la difficulté ne joue que sur les réflexes et les choix. |
| `strategist.ts` | Résumé toutes les 8 s (%, vies, distances au bord, arme préférée de l'humain, ses parades, coups des 8 dernières secondes) → `/api/ai-move` → posture + arme + provocation. **Pas de réponse en 2 s : posture gardée** (compté à chaque échec) et pas de provocation. Mesures par match dans `window.__bot.info().gemini`. |
| `taunt-bubble.ts` | Bulle au-dessus du bot (texte de Gemini, posture en tête quand elle change), projetée dans la vue visible (RTVIEW), + bark de voix du rôle (`taunt_turn`). Couleurs et polices du thème (variables CSS), aucune valeur en dur. |
| `sense.ts` | Perception partagée (sol, bords, ligne de tir, impact prévu) et manette virtuelle (8 directions relatives à la vue, même calcul que `movement.ts`). |
| `sim-human.ts` | Humain simulé des tests, jamais actif en jeu. |
| `api/ai-move.ts` | Gemini `GEMINI_TEXT_MODEL`, réflexion coupée, JSON contraint (`stance` en liste fermée), résumé borné à 2 000 caractères et encadré (`<fight_summary>`, consignes internes ignorées), provocation nettoyée (3 à 8 mots, jamais coupée en pleine phrase, ni insulte, ni « AI / bot / model »). Délai serveur 1,9 s. Repli `{ source: 'fallback', reason }`. |

L'ancien bot au tour par tour (`brain.ts`, `planner.ts`, `parry-bot.ts`) est supprimé.

Capture regardée (`captures/rtbot/medium-0.png` dans ma copie, dossier non versionné ; Archipel, vue plein écran de l'humain) : le bot (Rogue) avec sa bulle « AGGRESSIVE Stand still, I dare you. » au-dessus de la tête, lisible, dans le style des étiquettes du HUD.

## Comment tester
- Jeu : écran-titre → `vs AI` → niveau. Ou `gameHooks.startMatch({ vsAI: true, difficulty: 'medium' })`.
- `window.__bot.info()` : niveau, posture, arme conseillée, compteurs (tirs, blocages, parades parfaites, esquives), point visé, mesures Gemini. `__bot.setStance('edgeguard')`, `__bot.taunt('Hi!')`, `__bot.offline(true)` (Gemini coupé), `__bot.simHuman(true)` (P1 joué par l'humain simulé).
- Banc : `node tools/test-rtbot.mjs --port 5391 --niveaux easy,medium --matchs 10` (build figé + `vite preview`, une page, matchs en séquence, sans rendu ; `--captures` pour une image avec rendu, `--gemini-lent` pour retarder chaque réponse de 2,5 s, `--hors-ligne`). Résultats JSON dans `captures/rtbot/`. **Ne pas le couper avec `timeout`** : le navigateur resterait ouvert.

## Hors de mes chemins
- `tools/test-rtbot.mjs` : nouveau fichier (banc). Rien d'autre modifié hors `src/gameplay/ai/**` et `api/ai-move.ts`.

## Pour la fusion
- Aucune dépendance nouvelle, aucun changement de contrat. Le bot s'installe par `installAI(ctx)`, déjà appelé dans `src/gameplay/index.ts` (le commentaire « bot au tour par tour : inactif » peut être retiré par RTCORE) ; il ajoute les systèmes `ai-strategist` (ordre 38) et `ai-bot` (39), juste avant `gameplay-input` (40) : ses touches sont lues dans la même image.
- `api/ai-move.ts` change de format : `{ summary }` → `{ stance, preferredWeapon, taunt, source, reason? }`. Seul appelant : `strategist.ts`.
- Le bot ne fait rien tant que `state.vsAI` est faux.

## À faire par les autres lots (constaté en testant)
- **RTCORE / LUX, important pour le juré seul** : en `vs AI`, les touches de P2 (flèches, L, K, MAJ DROITE) pilotent encore P2 en plus du bot : un juré seul qui essaie les flèches déplace le bot. Proposition : en `vs AI`, ignorer le clavier et la 2e manette de P2 et **accepter les deux jeux de touches pour P1** (ZQSD ou flèches, F ou L, G ou K). À faire par RTCORE dans `src/gameplay/controls.ts` : un drapeau « solo » (posé au `match:start` selon `state.vsAI`) qui, dans `keydown` / `keyup` / `keyboardHeld`, range les actions des touches de P2 sous P1 ; la 2e manette ignorée. Les entrées du bot passent par `gameHooks.input`, elles ne sont pas concernées.
- **RTVIEW** : en `vs AI`, plein écran pour l'humain quand `state.split` est faux (déjà signalé dans `SUIVI.md`) ; sur ma capture, la vue unique est bien là.

## Limites connues
- **L'humain simulé n'est pas un juré.** Il ne fuit pas les dangers de map (éponge, catapulte, dalles), recule parfois jusqu'au bord et y perd une vie à bas % ; un juré débutant sera sans doute plus faible encore, un habitué des jeux de combat plus fort. Les taux servent à **ordonner** les niveaux, pas à prédire un score exact.
- **Les arènes ont changé pendant les réglages** (LMAP3, 26-28 m, fusionné à 16h50) : les chiffres du tableau sont mesurés sur les arènes actuelles ; l'historique des réglages, sur les anciennes. À relancer après toute grosse modification des maps : `node tools/test-rtbot.mjs --niveaux easy,medium --matchs 10`.
- **Machine saturée pendant les mesures** (autres agents, RAM libre de 0,1 à 3 Go) : dans le réglage final, le jeu a tourné à ×0,92-1 du temps réel (quelques matchs plus anciens beaucoup plus bas, écartés). Parade et charge se mesurent en millisecondes réelles : à vitesse < 1, elles sont un peu plus faciles pour les deux camps.
- **Gemini** : sous cette charge, 1 réponse sur 4 dépasse 2 s (surtout des délais du serveur à 1,9 s) ; le bot garde alors sa posture (voulu) et ne dit rien. Sur une machine calme, les appels directs ont pris 1,0 à 1,2 s. Si c'est trop fréquent le jour J, on peut passer le délai serveur à 1,95 s ou demander la décision 1 s plus tôt ; je ne l'ai pas fait sans mesure.
- **Perception** : le bot connaît les positions (pas de brouillard), mais ne réagit à un tir qu'après son temps de réaction ; il ne voit pas les dangers de map annoncés (`map:warn` ne donne pas la zone).
- **Difficile et Hardcore** : réglés au-dessus de Moyen (réaction 200 et 130 ms, défense et parade parfaite plus fortes) ; non remesurés sur les nouvelles arènes (un seul navigateur à la fois depuis la consigne machine de 16h40). Indice : le « Moyen renforcé », un peu plus faible que le Difficile actuel, y a gagné 4 matchs sur 4.
- **Pas en 10 matchs partout** : sous la consigne « un navigateur, matchs en séquence », un match dure 1 à 3,5 min ; les derniers lots font 6 matchs par niveau.
- Le bot n'exploite pas exprès son BRO SMASH (il part sur son prochain tir offensif, comme pour un joueur qui ne le guette pas).
