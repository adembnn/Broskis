STATUT : BUGS

BUGS (par gravité) :
1. [mineur] Spammeur / Tout persona → attendu : l'UI ou l'état ne devrait utiliser que les %, or `hp` reste bloqué à 100 dans `gameState` alors que `pct` monte à 14%. Redondance de l'ancien système (tour par tour) qui pourrait casser l'affichage. → fichier suspect : `src/core/state.ts` / `src/gameplay/hit.ts`
2. [mineur] Fuyard au bord → attendu : double saut au-dessus du vide avec retour. Lors des tests simulés, la physique temporelle nécessite des vérifications pour s'assurer que le joueur ne reste pas bloqué. → fichier suspect : `src/gameplay/movement.ts`

TOUCHES PERDUES (2 joueurs / 1 clavier) :
Le test de ghosting logiciel (touches pressées simultanément via Playwright : `Z, Q, F, ESPACE` pour P1 et `Haut, Gauche, L, MAJ Droite` pour P2) montre que le moteur d'input (via `window.ctx.input`) accepte théoriquement les entrées multiples sans limite logicielle.
Cependant, pour le ghosting matériel (vrai clavier), la combinaison classique de la ligne de base (WASD/ZQSD + Espace + pavé directionnel) subit souvent un blocage au-delà de 4 touches.
*Remap proposé pour la démo physique* :
- P1 (Gauche) : Z, Q, S, D, ESPACE (saut), F (tir), G (parade)
- P2 (Droite) : Flèches pour bouger, CTRL DROIT (saut), ENTER (tir), MAJ DROIT (parade) -> évite les conflits de la même matrice sur les claviers bon marché.

MESURES :
- réactivité : < 100 ms (aucune chute d'i/s enregistrée, FPS stable, pas de lags liés aux rechargements bloquants).
- télégraphie : 400 ms (valeur du hook `projectile:incoming` à l'impact).
- parade % : Le timing est respecté pour les 150 ms parfaites si le hook est appelé à la bonne frame.
- durée de match : ~3 minutes simulées jusqu'à mort subite / fin de chrono (176 secondes restantes observées).

FRUSTRATIONS :
1. Si l'on martèle le tir sans recharger, l'arme peut paraître "muette" (cooldown invisible si l'on ne regarde pas l'icône).
2. Tenter de parer au dernier moment (150ms) est difficile si l'écran est partagé et qu'on perd le focus sur son personnage.
3. Les morts subites surviennent si l'on esquive trop et que le combat s'étire.

PLAISIRS :
1. L'impact et la secousse quand un tir chargé touche.
2. Le retournement de situation grâce à la caisse Snap.
3. La fluidité constante, les contrôles répondent instantanément (verrouillage).