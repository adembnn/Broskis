# Lot LG · Gameplay
> **Obsolète depuis le pivot temps réel (15h25)** pour : tours, budget de déplacement, visée à la souris, parade du défenseur. Référence : `plan/PIVOT-TEMPS-REEL.md`.
Responsable : Adem (sous-agent Sonnet) · Coût : élevé · Dépend de : L0

## Tes chemins
`src/gameplay/**` **sauf** `src/gameplay/map-events/` et `src/gameplay/ai/`

## Sortie attendue (`install(ctx)` dans `src/gameplay/index.ts`)
1. **Machine d'états des phases** (voir le type `Phase`) et chrono de secours de 15 s, qui démarre au premier geste.
2. **Déplacement** : contrôleur de personnage Rapier ZQSD/WASD, budget de 6 m, 1 saut qui coûte 1,5 m, arrêt au bord en marchant. Émet `move:update` et `move:jump`.
3. **Visée et tir** :
   - 1/2/3 choisit l'arme ; la souris vise ; clic maintenu = charge ;
   - `aim:update` (direction, puissance, prédiction d'impact et de recul), puis `fire`.
4. **Les 4 catégories** (valeurs dans une table de données) :
   - blaster : 3 à 5 tirs droits, arrêtés par les murs ;
   - grenade : cloche + rebond + zone, portée maximale ;
   - throwable : lourd, fort recul, renvoyable ;
   - shield : pose un mur-sticker (couvert) et renvoie sur parade parfaite.
5. **Dégâts et recul** :
   - les dégâts dépendent des stats (budget 10) et de la puissance du perso ;
   - le recul dans l'axe du tir grandit quand les PV baissent (façon % de Smash) ;
   - sortie de map = `ringout`, puis `ko` ;
   - traits appliqués : bouncy, sticky, explosive, heavy, healing, split, slippery, loud ;
   - une arme utilisée recharge pendant 1 tour.
6. **Parade (version de base)** :
   - `projectile:incoming` part environ 1,2 s avant l'impact ;
   - ESPACE : Parfaite ≤ 90 ms (renvoi), Bonne ≤ 220 ms (moitié), Ratée ; `parry:result` ;
   - ralenti ×0,3 à l'approche ;
   - ⚠️ repères, combos et difficulté : attendre la proposition validée par Adem (sera ajoutée ici).
7. **Caisse Snap** : tous les 2 à 3 tours, `crate:warn` (ombre) puis `crate:land`. On l'attrape en marchant dessus. Suite :
   - `crate:grab` ;
   - phase `snap-time` de 10 s ;
   - `scan:start` ;
   - à `scan:result`, remplacement d'une arme (le joueur choisit laquelle).
8. **Fin de match** : mort subite au tour 7, victoire, `match:end`.
9. **`window.gameHooks`** branchés : `move`, `jump`, `pickWeapon`, `aim`, `fire`, `parry`, `grabCrate`, `forcerVictoire`.

## Contrôles
`npm run build`. Un match complet joué par script avec `gameHooks`, sans erreur console. Agent `playtesteur` (profils spammeur, stratège, débutant).

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
