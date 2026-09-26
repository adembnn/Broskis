# Lot LU · Interface
Responsable : Adem (sous-agent Sonnet) · Coût : moyen · Dépend de : L0, DA (tokens)

## Tes chemins
`src/ui/**` **sauf** `src/ui/scandex/`

## Règles
- Tout le texte du jeu est en **anglais**.
- Suivre `design-system-cartoon.md` §5 (dans le dépôt Bagarre) et le skill `anti-slop` :
  - panneaux à plat, contour de 3 px, ombre dure ;
  - barres de PV en segments + barre fantôme ;
  - chiffres en police d'affichage avec contour ;
  - aucun glow, aucun dégradé décoratif, aucun emoji.
- Toute valeur visuelle vient de `src/art/tokens.js`.

## Sortie attendue (`install(ctx)` dans `src/ui/index.ts`)
1. **Titre** : PLAY.
2. **Choix du perso** : 4 prédéfinis (stats en 3 barres) + « Snap yourself » (appelle `scanFighter`, lot LP).
3. **Arsenal**, 3 emplacements par joueur :
   - un râtelier d'armes prédéfinies ;
   - « Snap an object » : webcam (`getUserMedia`), import ou glisser-déposer ;
   - animation de « forge » pendant l'attente ;
   - carte de l'arme avec la catégorie proposée, des pastilles pour la changer, les stats et le trait.
4. **Présentation des armes** : cartes façon carte à collectionner, révélées une par une, sous-titres de l'animateur (`commentary:line`).
5. **Choix de la map** : 3 vignettes.
6. **HUD** :
   - PV des 2 joueurs (joueur 1 à gauche, joueur 2 à droite) ;
   - budget de déplacement ;
   - 3 armes avec leur recharge ;
   - chrono ;
   - bandeau « P2 — YOUR TURN! » ;
   - sous-titres ;
   - « PERFECT! » et « GOOD » sur la parade.
7. **Overlay « SNAP TIME! »** : webcam + compte à rebours de 10 s.
8. **Fin de match** : « Damage Report » façon addition (repris de `src/wow/endscreen.js`), meilleur coup, revanche d'une touche.

## Contrôles
`npm run build`. Captures `--out captures/LU` de chaque écran. Agent `directeur-artistique` sur les captures.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
