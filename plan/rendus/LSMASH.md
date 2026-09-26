# Rendu LSMASH (règles v2 façon Smash) puis RTCORE (cœur temps réel)
Agent Claude (Opus), branche `worktree-agent-ac575786e4e3db7dc`, 14h15 → 16h30. Le lot a changé en cours de route : règles v2 au tour par tour (fusionnées à 15h05), puis, après le pivot de 15h25 (`plan/PIVOT-TEMPS-REEL.md`), **cœur temps réel** de `src/gameplay/**`, en gardant tout ce qui servait (%, vies, éjection, bords, rattrapage, double saut, BRO SMASH).

## Fait (chemins, commits)
**Règles v2 (tour par tour, avant le pivot)** — `c5e3776`, `396dc27`, `a91350e`, `79d982c`, `31d01f1`, `7170432`, `215a34f`
- Dégâts en % et éjection selon le % : formules pures dans `src/gameplay/formulas.ts` (vitesse = (base_arme + charge × k1) × (1 + %/100 × k2), 35° vers le haut, poids = hpMax).
- Vol d'éjection cinématique déterministe, rattrapage au bord, zones d'explosion côté / haut / bas : `src/gameplay/launch.ts` ; la même intégration à pas fixes sert à PRÉDIRE l'issue (`hit.willKo`), donc la prédiction = le vol réel.
- Vies, réapparition, fin de match (`stock:lost`, `ringout`, `respawn`, `ko`, `match:banner game` + 1 s de ralenti, `match:end`) : `src/gameplay/stocks.ts`.
- Géométrie de l'arène par rayons + `getArenaBounds()` de LMAP2 : `src/gameplay/arena.ts`.
- Jauge BRO branchée (personne ne l'émettait) et BRO SMASH : `src/gameplay/bro.ts`.
- Bugs corrigés au passage : budget de déplacement et sauts jamais rendus d'un tour à l'autre ; arme sélectionnée restée en recharge (le clic ne faisait rien) ; tir parti tout seul après 400 ms de charge ; persos figés en l'air après un recul (corps dynamique repassé en cinématique en plein vol) ; sol de secours 30 × 30 jamais retiré (arènes fermées par un sol invisible) ; grenade qui volait 14 à 32 m au-dessus de la cible.

**Cœur temps réel (RTCORE)** — `389f606`, `a06968e`, `a07a352`, `d8a1952`, `9668802`
- Déroulé : `countdown` (READY? puis 3-2-1, après l'ouverture du rideau LLOAD et le sol de la map) → `fight` → `ko` → `end` ; horloge de 3:00 (`state.timerLeft`) puis mort subite à 150 % : `src/gameplay/phases.ts`.
- Entrées des 2 joueurs en même temps (`src/gameplay/controls.ts`) : clavier aux touches réglables de chacun (`src/core/input.ts`, relues à chaque événement), manettes (Gamepad API : 1re à P1, 2e à P2 ; A saut, X/RT tir, RB blocage, croix armes), hook `gameHooks.input(player, action, down)`. Aucun appui perdu (fronts mémorisés entre deux images), heure exacte de l'appui (parade).
- Déplacement 6,5 m/s relatif à la vue (`forwardOf` de RTVIEW s'il est exporté par `src/scene/camera`, sinon axe vers l'adversaire), contrôle en l'air avec élan, double saut (saut 1,09 m + double ≈ 2,59 m, constantes LJUMP), coyote time 0,1 s, bords ouverts (on vacille, on passe en poussant 0,3 s), élan bridé à 3 m/s quand on sort du plateau à pied, rattrapage au bord, « reculer + saut » = descendre à travers une plateforme traversable : `src/gameplay/movement.ts`, `src/gameplay/character.ts`.
- Armes à visée verrouillée (`src/gameplay/combat.ts`) : blaster en rafale de 3 avec avance sur la vitesse de l'adversaire, grenade en cloche calculée jusqu'à lui (avec avance partielle), throwable tendu, bouclier = mur de 5 s ; tir maintenu = charge (0 → 1 entre 0,3 et 1 s) ; recharges en secondes (`cooldowns`, `weapon:ready`) ; blocage maintenu (dégâts ÷ 3, recul ÷ 2, on avance à 40 %).
- Projectiles réels, esquivables (`src/gameplay/projectiles.ts`) : parade parfaite si le blocage a commencé < 150 ms avant l'impact (renvoi au tireur, ralenti ×0,3 pendant 0,3 s, `parry:result perfect`), anti-martelage (un blocage relancé < 300 ms après en avoir lâché un ne compte pas), `projectile:incoming` 400 ms avant l'impact prévu, `projectile:end` pour retirer le visuel.
- **Physique réelle des objets** (`Weapon.physics`, `src/gameplay/physics-feel.ts`, pur et borné) : masse → vitesse (×0,65 à ×1,35), dégâts et recul ~ quantité de mouvement (×0,6 à ×1,6 / ×1,7), recharge (×0,6 à ×1,8) ; taille → rayon de contact ; lourd → lancer qui tombe (gravité propre, relèvement max 25°) et grenade à portée courte ; rebonds selon `bounciness` (`projectile:bounce`) ; fragile → éclats autour de l'impact ; liquide → flaque glissante 3 s (`ground:slippery`). Sans `physics` : objet moyen (tous les multiplicateurs à 1).
- Caisse Snap toutes les 35 s, annoncée 3 s avant, arme bonus instantanée (préparée pendant l'annonce) : `src/gameplay/crate.ts`. Dangers de map sur minuterie de 20 à 30 s annoncés 3 s avant, `maxEvents` de LMAP2 respecté, mort subite de la map à 3:00 : `src/gameplay/map-events/index.ts`.
- Régie de démo (`?demo=1`) : F4 met P2 à 150 % (le « KO au ralenti » du script).
- Tests : `window.__selftest()` réécrit en temps réel (`src/gameplay/selftest.ts`) ; `tools/balance/playtest-rt.mjs` (Playwright, vrais événements clavier, les 2 joueurs en même temps) ; aides `window.__lsmash` (setPct, superReady, launch, predict, place, oneWay, runtime, projectiles).

## Contrat ajouté (`src/core/types.ts`, `src/core/events.ts`, `src/core/state.ts`)
- Phases `countdown`, `fight` ; `PlayerState.cooldowns / charge / blocking / yaw` ; `GameState.split` ; `StartMatchOptions.split` ; `GameHooks.input` ; type `InputAction`.
- Événements : `block`, `weapon:ready`, `countdown`, `projectile:end`, `projectile:bounce`, `ground:slippery` ; `projectile:spawn` a en plus `gravity`, `owner`, `mass`, `material`, `size` (le visuel rejoue le vol : pos = from + vel·t, vy −= gravity·t) ; `hit` a en plus `mass`, `material`, `size`.

## Pas fait, et pourquoi
- **Simulateur d'équilibrage temps réel** : `tools/balance/sim.ts` simule encore les règles v2 AU TOUR PAR TOUR (consigne : « pas prioritaire »). Ses chiffres ci-dessous datent d'avant le pivot et `PCT_PER_POWER` est passé de 14 à 4,5 depuis : à relancer après adaptation.
- **Bot IA temps réel** : l'ancien bot (`src/gameplay/ai/`) est inerte en temps réel (il attendait la phase `move`) ; RTBOT le refait.
- **Manettes** : branchées mais non testées sur une vraie manette (Playwright ne simule pas la Gamepad API).
- **`deriveStats` de LSCAN** (`src/ia/physics.ts`) n'existait pas encore : la traduction physique → jeu vit dans `physics-feel.ts`. À trancher : un seul endroit pour les dégâts et la recharge (je propose deriveStats → stats a/b/c, physics-feel → vol, recharge, quantité de mouvement), sinon double effet.

## Décisions prises seul
- Au bord : on s'arrête et on vacille, on passe dans le vide en poussant 0,3 s (0,45 s au tour par tour) : un débutant ne tombe pas par accident.
- Rattrapage au bord aussi quand on tombe soi-même, mais plus bas (1,2 m sous le plateau) tant qu'il reste un saut, pour laisser tenter le double saut.
- Réapparition à 150 % pendant la mort subite (sinon elle ne tranche pas un match à 2 vies) ; invulnérable pendant le vol stationnaire puis 2 s.
- Parade GOOD / blocage : le recul n'est divisé que par le blocage (÷ 2) ; la parade GOOD du tour par tour ne réduisait que les dégâts.
- BRO SMASH : base de recul minimale 2,2 (×1,8 ensuite), sinon un BRO SMASH au blaster ne se voyait pas.
- Jauge BRO : PERFECT +12, GOOD +6, NICE +10, et surtout les % reçus (×0,45) et infligés (×0,25) : même un débutant qui ne pare jamais y a droit.
- Objet lourd : recul de base plafonné à 1,25 × le plafond normal (un coup à 40 % ne sort personne du centre) ; élan d'une sortie de plateau à pied bridé à 3 m/s.
- Arme choisie en recharge : sélection permise (on la prépare), tir refusé.

## Frictions
- Rendu sans carte graphique (Playwright sans fenêtre, SwiftShader) : des images de plusieurs secondes (compilation de shaders) ralentissent le temps de jeu ; les tests temps réel qui dépendent d'un timing fin (parade parfaite, double saut juste après la chute) sont instables en sans-fenêtre. Délais larges dans les tests ; à rejouer avec GPU (`npm run perf` de LPERF).
- `src/scene/camera/occlusion.ts` levait une erreur à chaque image après un coup (Sprites des chiffres de dégâts sans `raycaster.camera`) : corrigé sur main depuis (0 erreur console au dernier passage).
- `import * as cameraApi from '../scene/camera'` : avertissement de build `IMPORT_IS_UNDEFINED forwardOf` tant que RTVIEW n'exporte pas `forwardOf` (sans effet : repli sur l'axe vers l'adversaire).

## Chiffres du simulateur (règles v2 au tour par tour, 40 000 matchs, avant le pivot)
| Scénario | Tours médian (p10–p90) | Éjection moy. % (avant mort subite) | Sous 40 % hors BRO SMASH | Éjections en mort subite |
|---|---|---|---|---|
| Armes aléatoires, 2 vies | 12 (8–29) | 191 (87) | 87 / 102 879 | 85 % |
| Arsenal par défaut, 2 vies | 12 (8–24) | 186 (95) | 20 / 51 993 | 92 % |
| Arsenal par défaut, 1 vie (démo) | 8 (5–12) | 166 (95) | 39 / 20 000 | 79 % |
| Deux débutants, 2 vies | 11 (9–15) | 172 (75) | 14 / 54 625 | 89 % |

Lecture : avec la mort subite au tour 7 et la parade très efficace, la plupart des matchs se tranchaient en mort subite ; les éjections « normales » arrivaient vers 90 %. Ce constat a nourri le réglage temps réel (coups plus fréquents, % par coup plus bas).

## Événements du bus observés en test (temps réel, `tools/balance/playtest-rt.mjs`, vrais événements clavier)
- Deux joueurs en même temps : P1 (Z) et P2 (flèche haut) avancent chacun de 1,6 m dans la même seconde ; `fire` ×2 (F et L), puis `hit` croisés (P1 10 %, P2 12 %).
- Blocage et parade : `block {player:1, on:true}` → `parry:result {grade:'good', deltaMs:325}` (grenade) ; `parry:result {grade:'perfect', deltaMs:46}` (blaster, renvoi).
- Rattrapage : `ledge:grab {player:1, pos:[13.78,0,0]}` → MAJ DROITE → `ledge:climb {player:1}`.
- Éjection : `hit {damage:43, pct:233, launch:[28.1,19.67,0], willKo:true}` → `stock:lost {side:'side', stocksLeft:1}` → `ringout` → `respawn {pos:[0,3,0]}`.
- BRO SMASH : `super:ready` → `fire` → `super:fire` → `hit` ×4 jusqu'à 92 % → `stock:lost`.
- Fin : `stock:lost {stocksLeft:0}` → `ko` → `match:banner {kind:'game'}` → `match:end {winner:0}`.
- Physique : chaise (5 kg) recharge 7,2 s, 36 %, recul 10,7 m/s ; canette (0,35 kg, liquide) 3,5 s, 18 %, 4,3 m/s ; `ground:slippery` émis à l'impact de la canette.
- Sauts : `move:jump` ×2 au clavier (ESPACE) après être sorti du plateau ; « reculer + saut » sur une plateforme à 2,3 m : descente jusqu'au sol (y 2,35 → 0,04) sans consommer de saut.
- Erreurs console au dernier passage complet : 0.

## Rythme temps réel (banc `tools/balance/rythme-rt.mjs`, deux joueurs scriptés qui tirent dès que possible et tournent autour de l'adversaire)
- 1re éjection vers 12-16 s de jeu, match à 2 vies en 20-40 s de jeu ; une éjection « par coup » observée à 85 %.
- Mais la plupart des éjections étaient des **chutes seules** (joueurs qui tournent en maintenant une direction) : poussée au bord portée de 0,3 à 0,5 s (`RT.teeterPushS`, commit `b71f561`). À revérifier avec de vrais joueurs ; le bot RTBOT devra éviter les bords.
- En fin d'après-midi, la machine est très chargée (plusieurs agents en parallèle) : READY → GO a pris jusqu'à 26 s en sans-fenêtre, d'où des scénarios en délai dépassé sans erreur de logique (le scénario « game-fin » complet passe).
