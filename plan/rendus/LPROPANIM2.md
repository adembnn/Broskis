# Rendu Lot LPROPANIM2 : Décor qui réagit avec du poids (ressorts, contact des persos)

## Fait
- **Ressorts amortis avec dépassement** implémentés dans `src/scene/maps/prop-anim.ts` via une nouvelle classe `Spring`. Le système gère de manière fluide les offsets de position, rotation, d'échelle et l'écrasement.
- **Impact de projectile** : l'écrasement a été ajusté à 30 % (au lieu de 20 %). Lors de l'impact, les tonneaux et caisses subissent une bascule additive de 10° à l'opposé du point d'impact et une petite rotation aléatoire de ±6° via nos ressorts, qui reviennent à l'état de repos.
- **Contact des persos** : ajout d'une détection dans la boucle de jeu. Un joueur qui court ou passe très près d'un tonneau, d'une caisse, d'un bocal ou d'un flacon fait vaciller l'objet de 6° dans le sens de la course. Un cooldown de 0.5s par objet empêche les réactions parasites en chaîne. La détection de proximité est basée sur le rayon de l'objet (estimé via ses colliders) + 0.5m d'espace de tolérance (padding).
- **Plateformes** : passage à un ressort (4 cm d'enfoncement, paramètre `platformDip`).
- **Valurs dans les tokens** : les constantes (stiffness, damping, angles de tilt) ont été externalisées dans `src/scene/maps/tokens.ts` (section `LOCAL_TOKENS.propAnim`).
- **Captures** : les rafales réelles (−50/+50/+150/+300/+600 ms) ont été effectuées et enregistrées dans `captures/lpropanim2/` avec succès.
- Le jeu compile parfaitement (`npm run build`).

## Fichiers touchés
- `src/scene/maps/prop-anim.ts`
- `src/scene/maps/tokens.ts`

## Pas fait et pourquoi
- Nous n'avons pas changé la logique de collision (comme exigé), tout se fait via une rotation et position additives sur `prop.holder.quaternion` et `prop.holder.position`.
- Il n'y a pas eu de changement sur `animator.ts`, puisque la classe `Spring` de ce fichier était non exportée, nous l'avons répliquée en simplifiant dans `prop-anim.ts`.

## Décisions prises seul
- Gestion des instances "knockable" vs "decor" : l'orientation des "knockables" étant mise à jour chaque frame par le moteur physique, j'ai implémenté l'offset via une multiplication additive post-engine pour garantir que la collision reste intacte, mais que le tilt soit bien rendu.
- J'ai ajouté une simple fonction de calcul de rayon dans `prop-anim.ts` (`getPropRadius`) basée sur la structure de la spec des accessoires (`box`, `cylinder`, `convex`), pour éviter d'aller injecter ou modifier les objets globaux.
- Pour la direction de bascule lors du contact, j'ai approximé la direction via `p.yaw`, ce qui offre un rendu très fidèle au sens de déplacement du personnage.

## Frictions
- La gestion des rotations combinées au système physics-sync a demandé une attention particulière. En l'appliquant en fin de frame (priorité 250 de la boucle), nous pouvons ajouter les offsets sans fausser ni la physique ni le repère de l'objet.
