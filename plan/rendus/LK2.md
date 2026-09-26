# Rendu Lot LK2 - Parade visuels

## Fait
- `src/scene/parry-fx/index.ts` : Anneau d'approche (3x à 1x) qui se resserre jusqu'à `tImpact`, bande dorée pour le repère de timing `PERFECT`, étincelles dorées au moment d'un parry perfect (le hitstop géré par `camera/index.ts` fige déjà le jeu de 120ms), anneau de pulsation au moment de l'émission d'une `feint` en charge (toutes les 400ms sur l'attaquant) et liseré rouge d'avertissement au lâcher du coup.
- `src/ui/parry-hud/index.ts` : HUD Vinyl. Création des jauges de jauge « BRO » (super prêt), textes « !! SPACE/ENTER !! », retours textuels pour le timing (« PERFECT », « GOOD », « TOO EARLY », « TOO LATE »), gestion du multiplicateur de combos (streak), et le texte d'aide contextuel conditionnel (disparaît à 5 succès, revient à 2 échecs).
- `src/audio/parry-cues/index.ts` : "Tic, tic, TAC" (oscillateurs carrés) programmés au temps WebAudio de `tImpact` (T-600, T-300, T). Son de cliquetis métallique (clang) montant d'un demi-ton par parade consécutive de la série (streak). Filtre passe-bas (BiquadFilterNode) appliqué temporairement sur le canal musique (`musicBus`) pendant l'approche d'un projectile et libéré à l'impact.
- L'émission des événements `attack:nice` et `feint` était déjà implémentée dans `src/gameplay/aim.ts` par le précédent lot, j'ai donc écouté ces événements depuis `parry-fx` pour générer le visuel de la pulsation d'anneau directement sur la cible 3D de l'attaquant sans surcharger `aim.ts`.

## Décisions prises seul
- La désaturation pendant l'approche est effectuée par CSS via la propriété DOM (`ctx.three.canvas.style.filter = 'saturate(0.3)'`) car l'ajout d'une passe custom à l'effet de post-processing `postfx.ts` était hors des chemins autorisés de la spécification.
- Les étincelles sont modélisées en petites géométries planes (couleur `palette.lumiere`) gérées et animées avec une gravité locale simple dans le système d'effets visuels `parry-fx`.
- L'API native de la caméra (`CameraDirector`) ayant l'exclusivité du FOV (`fovPunch`) en jeu, et prenant déjà en charge le recul et le zoom lors des événements de parade (`juice.parfaite`, etc.), je n'ai pas sur-appliqué d'effets contradictoires sur ce point.

## Frictions
- L'API `Loop` ne comportant pas de fonction `removeSystem`, les animations temporaires (telles que le pulse de feinte ou les étincelles) doivent être listées dans un tableau et traitées de manière éphémère (`splice` après expiration temporelle `expire`) par l'unique sous-système enregistré `parry-fx`.
