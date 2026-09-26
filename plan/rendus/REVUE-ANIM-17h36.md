# Revue d'animation en temps réel (agent animateur-exigeant, 17h36) — pour LATK1, LATK2, LFLUID, LPROPANIM
Note : **2/10, REFUSÉ**. Testé sur main (17h15), combat réel en écran scindé, `gameHooks.input`, 14 scénarios.

| Critère | Note | Constat |
|---|---|---|
| Continuité de course | 3 | Sur sol plat, le perso passe en « saut » toutes les ~300 ms (7 cm de relief suffisent) ; au tir, le corps pivote de 90° en 1 image |
| Arcs et poids | 4 | Un saut simple en courant joue le salto du double saut ; aucune flexion avant l'impulsion |
| Haut du corps | 6 | Tir/charge/garde sur le haut du corps OK ; garde illisible de dos |
| Main et projectile | 3 | Projectile 50-100 ms avant le lâcher ; objet disparaît de la main dès l'appui ; en l'air le blaster reste à la hanche |
| Contact au sol | 2 | Cadence plafonnée ×2 : pieds à 2,1 m/s pour un corps à 6,5 m/s (68 % de glisse) ; touché en course → glisse 3,8 m figé |
| Regard | 3 | En course, la tête ne suit pas l'adversaire (75-115°) |
| Réactions | 3 | Coup reçu bloque les jambes ~950 ms ; flash d'impact cache le perso ~400 ms (max 100) ; après sortie d'arène le corps reste debout dans le vide 1,1 s ; perdant figé 1,5 s |
| Environnement | 3 | Caméra traverse le muret 400-600 ms ; décor animé linéaire, seulement aux impacts |

## Corrections (de la plus visible à la moins visible)
1. **LFLUID / LATK2** (`src/scene/fighters/index.ts`) : « en l'air » = `grounded` réel du runtime au lieu du seuil `airVelY` 0,9 m/s (~l. 489), à défaut seuil 2,5 m/s ; l. ~203 : `second = rig.airborne` → `second = rt.jumpsUsed >= 2` (salto seulement au double saut).
2. **LFLUID** : `ANIM.course.cadenceMax` 2 → 2,6 + foulée ×1,3 (cuisses) → glisse pieds/corps ≤ 15 % ; corriger `footSlideCm` (ne mesure qu'à l'arrêt, `animator.ts` ~l. 750).
3. **LATK2** (index.ts ~l. 377) : coup reçu en course → sur le haut du corps (`playUpper`, fondu 50 ms), jambes continuent ; sinon clip ×1,5 et reprise de course dès 250 ms. **LATK1** : flash d'impact ≤ 100 ms dans la vue de la cible.
4. **LATK2** (~l. 603) : poids du regard en course 0 → 0,5.
5. **LATK2 + LATK1** : `ANIM.lancer.elanMin` 0,14 → 0,03 s, charge reprise ≤ 30 ms avant le lâcher (écart apparition/lâcher ≤ 17 ms) ; `weapons/hand.ts` : objet gardé en main jusqu'à `anim:release` ; bras de visée levé aussi en l'air.
6. **LATK2** : `turnAction` 0,04 → 0,08 s (plus de pivot de 90° en 1 image).
7. **LATK2** : à la perte d'une vie, cacher le perso jusqu'à la réapparition (~l. 408) ; au KO, le perdant tombe tout de suite.
8. **LATK2** : attente vivante : respiration 2,6° → 5°, hanches 5° → 8°, bras relâchés (variation mesurée 0,002 = figé).
9. **LATK2 + LATK1** : garde lisible dans les 2 vues (objet devant le visage, couvercle-bouclier levé).
10. **LPROPANIM** (`src/scene/maps/prop-anim.ts`) : ressorts avec dépassement au lieu de linéaire, écrasement 20 → 30 % + bascule 10° opposée à l'impact, réaction au contact d'un perso. → **pris par la session « Map design » (Gemini, LPROPANIM2)**.

Banc `npm run anim` : encore au tour par tour (actions pendant le compte à rebours, glisse non mesurée en course) → à refaire en temps réel.
