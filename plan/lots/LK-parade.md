# Lot LK · Parade avancée : repères, difficulté, combos (validé par Adem)
Responsable : Adem (sous-agent Sonnet) · Coût : moyen · Dépend de : LG, LA, LU, LV fusionnés

## Trois règles
1. **L'anneau ne ment jamais** : il se ferme pile au moment de l'impact. Les feintes ne jouent que sur l'animation de l'attaquant.
2. **Un joueur = une touche.** J1 = `Space`, J2 = `Enter` (`event.code`, compatible AZERTY, `preventDefault`, on ignore `repeat`).
3. **Appuyer produit toujours un geste** ; le timing ne change que le résultat.

## Tes chemins
Aucun autre lot ne touche ces fichiers pendant LK :
- `src/gameplay/parry.ts` et `src/gameplay/tuning.ts` (partie parade) ;
- `src/scene/parry-fx/**` ;
- `src/ui/parry-hud/**` ;
- `src/audio/parry-cues/**` ;
- `src/core/events.ts` (ajout des événements ci-dessous uniquement).

## Nouveaux événements (à ajouter dans `src/core/events.ts`)
- `parry:cue` `{defender, attacker}` : l'attaquant arme son lancer (affiche « !! »).
- `parry:window` `{defender, tImpact, perfectMs, goodMs, index, count}` : un par projectile (dessin de l'anneau).
- `parry:streak` `{player, streak, multiplier}`, `bro:gauge` `{player, value}`, `super:ready` `{player}`.
- `attack:nice` `{player}`, `feint` `{player}`.

## Fenêtres et paliers (tour = nombre de tours joués par le défenseur)
Δ = `event.timeStamp` − T_impact − OFFSET. OFFSET = +50 ms au départ, puis la médiane de Δ sur 20 appuis (calibrage sur le projecteur de la démo).

| Tour | Anneau visible | PERFECT | GOOD | BLASTER (tirs max / écart min) | Feintes |
|---|---|---|---|---|---|
| 1 | 1 200 ms | ±90 | ±200 | 3 / 500 ms | 0 |
| 2 | 1 000 | ±80 | ±180 | 3 / 450 | 0 |
| 3 | 850 | ±70 | ±160 | 4 / 400 | 1 |
| 4 | 700 | ±60 | ±140 | 4 / 350 | 1 |
| 5+ | 600 | ±50 | ±120 | 5 / 300 | 2 |

- Ajustements de PERFECT, bornés entre 40 et 110 ms, avec GOOD ≈ 2,2 × PERFECT :
  - Agilité du perso : ±10 ms.
  - Arme lourde : +15 ms.
  - Arme rapide : −10 ms.
  - SHIELD en main : +20 ms.
- Un appui hors fenêtre = bouclier « sonné » pendant 250 ms (anti-martelage).
- Rafale : les fenêtres ne se chevauchent pas ; chaque appui est jugé sur le projectile le plus proche.
- Objectif : 50 à 60 % de PERFECT au tour 1, 20 à 30 % au tour 5.

## Repères (un seul par canal)
- **« !! » doré** au-dessus du défenseur, avec sa touche (« SPACE » ou « ENTER »), dès que l'attaquant arme.
- **Au lâcher** : reflet ✦ et son « shing » sur l'objet, liseré rouge de 100 ms sur l'attaquant.
- **Anneau d'approche** : il part à 3 fois la taille de la cible et se resserre linéairement en temps réel. La cible porte une **bande dorée dont l'épaisseur = la fenêtre PERFECT**.
- **Son** : tic (T−600), tic (T−300), TAC (T). Programmé en Web Audio à T − `outputLatency`.
- **BLASTER** : anneaux numérotés, et le motif rythmique s'entend.
- **GRENADE** : marque au sol et « tok » à chaque rebond ; l'anneau ne vise que le contact final.
- **Bascule vers le défenseur** : au lâcher, la caméra rejoint la vue épaule du défenseur en environ 0,7 s, avec le projectile au ralenti ×0,25 **pendant la bascule seulement**. L'anneau n'apparaît qu'ensuite, à vitesse constante (« l'anneau ne ment jamais »).
- **Pas de ralenti juste avant l'impact** : à la place, zoom, décor désaturé et musique étouffée (filtre passe-bas).

## Retours
- **PERFECT!** :
  - arrêt sur image de 120 ms sur les deux persos, étincelles dorées ;
  - « clang » monté d'un demi-ton à chaque parade de la série, texte « PERFECT! ×2 » ;
  - renvoi ×1,5 **au ralenti ×0,25 pendant 300 ms**.
- **GOOD** : arrêt de 50 ms, moitié des dégâts.
- **MISS** : « TOO EARLY −140 ms » ou « TOO LATE ».

## Combos
- **Série de PERFECT** : renvoi ×1, puis ×1,5, puis ×2 (plafond). GOOD maintient la série, MISS la remet à zéro.
- **Jauge BRO** : PERFECT +25, GOOD +10, NICE +10. Pleine, elle donne un **SUPER** à l'attaque suivante (rafale de 8, ou objet géant).
- **Rafale entièrement parée** : contre-attaque automatique.
- **Échange** : un THROWABLE renvoyé peut être paré à nouveau par l'attaquant, avec +15 % de vitesse à chaque échange.
- **Décor** : un renvoi qui touche un baril donne RICOCHET ×1,5.

## Attaquant : « NICE! »
- Pendant la charge (clic maintenu), un anneau pulse sur l'objet toutes les 400 ms.
- Relâcher à ±100 ms d'une fermeture donne « NICE! » et +25 % de dégâts ; raté = lancer normal.
- Chaque pulsation en plus = une feinte (colonne « Feintes ») ; au-delà, le lancer part tout seul.
- L'anneau de défense n'apparaît qu'au vrai lâcher. Un NICE renvoyé en PERFECT revient ×1,5.

## Débutants
- L'aide « PRESS SPACE » disparaît après 5 réussites d'affilée et revient après 2 ratés.
- **Mode Chill**, par joueur : fenêtres +40 %, jauge qui se remplit 2 fois moins vite.
- **Joker « Big Shield »** : fenêtres ×2, une fois par match.

## Animateur (répliques en anglais, envoyées au lot LI)
- Au plus une réplique toutes les 3 s. Priorité : série, puis retournement, puis PV bas. Jamais deux fois la même d'affilée.
- Exemples : « PERFECT! », « Return to sender! », « Triple parry — he's reading your mind! », « He bit on the feint! », « Five for five, that's a wall! », « Too eager! ».

## À éviter
- Un PERFECT sous ±50 ms avant le tour 5, ou un GOOD à ±220 ms sans verrou (celui qui martèle gagnerait).
- Les retards aléatoires sans signal, une vitesse qui change en vol, une rafale de longueur inconnue.
- Un anneau décalé de l'impact ; `keyup` ; `event.key` ; la logique comptée en images au lieu des millisecondes.

## Contrôles
`npm run build`. Un script teste les paliers en appelant `gameHooks.parry(offsetMs)` avec −100, −60, 0, +60 et +150 ms, et vérifie les notes rendues. Agent `auditeur-juice` sur la parade.

## Sources
osu! (vitesse d'approche, tolérance), Paper Mario TTYD (garde, superguard, commandes d'action), Sekiro (déviation), Clair Obscur : Expedition 33, Hi-Fi Rush (parade en rythme), Punch-Out!!, Rhythm Heaven, MDN `event.timeStamp` et `outputLatency`. Liens complets dans le rapport de recherche.
