# Lot LSMASH · Règles v2 façon Smash / Brawlhalla, jouables par un débutant
> **Obsolète depuis le pivot temps réel (15h25)** pour : tour par tour, bascule, invulnérabilité « jusqu'à son prochain tour », tir automatique après 15 s ; les règles v2 (%, vies, éjection, bords ouverts, rattrapage) restent valables. Référence : `plan/PIVOT-TEMPS-REEL.md`.
Exécution : **agent Claude (Opus, game design)** · Priorité 1 · Retours d'Adem et Titouan à 14h, en jouant : « pas vraiment jouable », « on ne comprend pas les mécaniques au clavier ni quelles attaques on peut lancer », « on a dit qu'on pouvait tomber, mais les arènes sont fermées », « pas assez inspiré de Smash et Brawlhalla ».

## Principe
On garde le **tour par tour** (déplacement → tir → parade du défenseur, bascule de caméra validée), mais tout ce qui se lit à l'écran et se ressent vient de **Super Smash Bros. Ultimate** : **dégâts en %**, **éjection hors de l'arène**, **vies**, **bords ouverts**, **rattrapage au bord**. Un joueur occasionnel doit comprendre en 10 secondes : « plus mon % monte, plus je vole loin ; si je sors de l'arène, je perds une vie ».

## Contrat déjà posé sur main (commit de Claude, ne le change pas sans raison)
- `PlayerState` : `pct`, `stocks`, `onLedge` ; `StartMatchOptions.stocks`.
- Événements : `hit` (+ `pct`, `launch`, `willKo`), `stock:lost`, `respawn`, `ledge:grab`, `ledge:climb`, `teeter`, `super:fire`, `match:banner`.
- D'autres lots travaillent **en parallèle** et s'appuient sur ces événements : l'interface (LUX, `src/ui/**`), les effets (LSMASH-FX, `src/scene/fx/smash/**`), les arènes (LMAP2, `src/scene/maps/**`), la caméra (LFIX2), le rendu (LDA2). **Émets-les fidèlement.**

## Règles v2 (arbitrage de Claude ; ajuste les nombres avec le simulateur)
1. **Dégâts en %** : chaque joueur commence à 0 %. Un coup ajoute ses dégâts actuels au %. **Plus de KO à 0 PV** : `hp` n'est plus utilisé pour la victoire (garde le champ pour compatibilité).
2. **Recul** (formule Smash simplifiée) : `vitesse = (base_arme + puissance × k1) × (1 + pct_après_coup / 100 × k2)`, direction = axe du tir + 35° vers le haut. Visés :
   - à 0-40 %, un coup moyen pousse de 1 à 3 m ;
   - à 100 %, un coup moyen **éjecte** depuis le centre d'une arène moyenne ;
   - à 150 % et plus, presque tout éjecte.
   Retire le plafond de recul de LBAL2 (`finalKnockback > 120`) : le % fait ce travail naturellement.
3. **Sortie = perte d'une vie** : sous `RINGOUT_Y`, ou au-delà du rayon de l'arène + 8 m (zone d'explosion). Émets `stock:lost` avec le côté. **2 vies** par défaut, `?demo=1` → 1 vie. Plus de vies → `match:end` (précédé de `match:banner { kind: 'game' }`).
4. **Réapparition** : plateforme au-dessus du centre de l'arène, % remis à 0, invulnérable jusqu'à la fin de son prochain tour ; émets `respawn`.
5. **Bords ouverts** : **on peut marcher dans le vide.** Au bord, `teeter` (animation d'équilibre ; l'interface affiche l'avertissement). Si on tombe pendant son tour, on dispose d'un **double saut** : 2 sauts par tour, le 1er coûte 1,5 m, le 2e est gratuit et seulement en l'air. On peut ainsi se rattraper.
6. **Rattrapage au bord** (moment dramatique de Smash) : après une éjection, si le perso passe à moins de 1,5 m du bord **sous** le niveau du plateau et au-dessus de `RINGOUT_Y`, il **s'accroche** (`ledge:grab`, `onLedge = true`). Au début de son tour, il remonte (`ledge:climb`, coût 2 m de déplacement).
7. **Attaquer simplement** (« on n'arrive pas à lancer des sorts ») :
   - au début de la phase de visée, la visée **se cale automatiquement sur l'adversaire** ;
   - la souris ajuste ; **clic maintenu** = charge, relâcher = tir ;
   - **alternative clavier** : `F` maintenu = charge, relâcher = tir ;
   - une arme en recharge ne peut pas être choisie : `weapon:pick` refusé, et l'interface le montre ;
   - un joueur qui ne fait rien pendant 15 s tire automatiquement l'arme 1 à 60 % de puissance, pour que le tour ne se bloque jamais.
8. **BRO SMASH** (le « Final Smash ») : quand `super:ready` a été émis (jauge BRO du lot LK), le prochain tir de ce joueur est un BRO SMASH : recul ×1,8, dégâts +50 %, `super:fire` émis au tir.
9. **Mort subite** (tour 7) : les deux joueurs passent à 150 %.
10. **Signaux de match** : `match:banner { kind: 'ready' }` puis `'go'` 1,2 s plus tard au début du match (les contrôles sont bloqués entre les deux), puis `'game'` sur la dernière éjection, avec 1 s de ralenti avant `match:end`.

## Tes chemins
`src/gameplay/**` : règles, dégâts, recul, déplacement, personnage, phases, visée, parade, caisse, `tuning.ts`. `src/gameplay/ai/planner.ts` et `brain.ts` : adapte au % seulement. `tools/balance/**`. Plus des ajouts compatibles dans `src/core/*` si indispensables. **Pas** `src/ui/**`, `src/scene/**`, `src/audio/**`.

## Contrôles
- `npm run build` passe ; `window.__selftest()` (LG) est mis à jour et passe.
- Simulateur (`node tools/balance/sim.ts`) adapté aux règles v2 : un match à 2 vies dure environ 8 à 12 tours, une éjection arrive en moyenne entre 90 et 140 %, aucune éjection sous 40 %. Donne les chiffres dans ton rendu.
- Test Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin), par les hooks **et** par de vrais événements souris/clavier : tir à la souris, tir à `F`, marche dans le vide + double saut de rattrapage, éjection → `stock:lost` → `respawn`, rattrapage au bord, BRO SMASH. Colle les événements du bus observés dans ton rendu.
- Commits de tes fichiers seulement, rendu dans `plan/rendus/LSMASH.md`.
