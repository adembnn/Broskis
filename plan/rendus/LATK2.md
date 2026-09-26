# Rendu LATK2 · Le corps des combattants (attaques, défenses, réactions)

Branche : `worktree-agent-ab302374bf619823a` (fusionnée avec `main` à 15h40, pivot temps réel et lot LFLUID compris).
Chemins touchés : `src/scene/animation/**`, `src/scene/fighters/**`, `tools/anim/**`, et ce rendu.

## Ce qui a été fait
Le corps des persos joue maintenant chaque action avec **anticipation → action → accompagnement**, et les attaques se jouent **sur le haut du corps pendant la course** (temps réel).

- **Trois couches** dans `src/scene/animation/animator.ts` :
  - couche de base (mixeur three.js) : locomotion et réactions du corps entier, en fondus enchaînés (API de LFLUID gardée : `current`, `isBusy()`, `setGroundSpeed()`, option `speed`) ;
  - couche **haut du corps** (colonne, bras, tête, évaluée os par os) : lancer, tir, pose du bouclier, garde. Les jambes gardent la course ;
  - couche **procédurale** (posée après les clips, dans le repère du perso) : regard et torse vers l'adversaire, torsion + cambré + tremblement de la charge, bras armé façon lanceur de base-ball (coude levé sur le côté, avant-bras dressé), objet brandi à deux mains, bras du blaster braqué sur la cible, recul du tir, fouet et torsion du torse dans le sens du coup, penché de course et de virage, transfert de poids à l'arrêt, respiration, moulinet au bord du vide, bras levés accroché au bord, bras de victoire grands ouverts qui pompent + bonds de joie.
  - les bras sont posés **par pointage d'os** (l'os est tourné pour que le segment épaule → coude, puis coude → main, pointe une direction du repère du perso) : la pose est la même quel que soit le clip dessous. Les persos chibi ont des bras courts sous une grosse tête : un bras levé à plus de 30° disparaît derrière la tête vue de face, d'où des poses plutôt à l'horizontale ;
  - avant chaque image, les os du haut du corps sont remis au repos : les clips KayKit n'ont pas de piste pour les os immobiles, et sans ça les rotations procédurales s'additionnaient d'image en image (buste couché au bout de quelques secondes : bug trouvé au banc, corrigé).
- **Clips du pack KayKit** (`src/scene/animation/pack.ts`) : chargés une fois en tâche de fond, seules les rotations sont gardées (et la hauteur du bassin, recalée sur chaque perso). Jamais `T-Pose`.
- **Images clés mesurées, pas devinées** : au chargement, le clip est échantillonné à 120 i/s sur le squelette du pack et on suit la main droite (`handslotr`). Lâcher = pic de vitesse de la main vers l'avant (vers le bas pour le bouclier planté) ; armé = main la plus en arrière avant ce pic.
- **`anim:release`** est émis quand le **temps du clip** franchit l'image de lâcher mesurée (jamais une minuterie), avec la position monde réelle de l'os `handslotr` :
  - GRENADE et THROWABLE : l'objet quitte la main ;
  - SHIELD : l'objet touche le sol (le mur peut pousser à ce moment-là) ;
  - BLASTER : **pas** d'`anim:release` (l'objet reste en main) ; le recul du corps suit chaque `projectile:spawn`.
- **Orchestration** (`src/scene/fighters/index.ts`) : charge tenue (le clip figé à la fin de l'élan), détente au tir (×1,35), visée verrouillée (face à l'adversaire même en courant, course de côté ou à reculons selon la direction réelle), garde maintenue sur l'événement `block`, parade parfaite = contre, bonne = garde qui plie, coups directionnels (face / dos), vrille d'éjection autour du centre du corps, remise droite à l'atterrissage, accroché au bord, remontée en arc, déséquilibre, salto du double saut, réapparition, victoire.
- **Prêt pour le contrat temps réel** sans dépendre de sa fusion : `PlayerState.charge`, `PlayerState.blocking` et l'événement `block { player, on }` sont lus s'ils existent. Sinon, repli en lecture seule sur `window.__lsmash.runtime(p)` (`charging`, `launch`, `ledge`). Aucune ligne de `src/gameplay/**` n'est touchée.

## Clips choisis par action
| Action | Clip (pack Rig_Medium, sauf mention) | Images clés mesurées | Couche |
|---|---|---|---|
| Lancer (grenade, throwable) | `General/Throw` (`throwP`), figé à l'armé pendant la charge | lâcher 0,667 s | haut du corps + bras armé, fente au lâcher |
| Tir (blaster) | `CombatRanged/Ranged_1H_Aiming` (`aim1h`) | — (recul procédural à chaque tir) | haut du corps + bras braqué |
| Pose du bouclier | `CombatMelee/Melee_2H_Attack_Chop` (`slam`) | armé 0,600 s, impact 0,742 s | haut du corps + objet brandi, plongée à l'impact |
| Garde tenue | `CombatMelee/Melee_Blocking` (`guardHold`) | — | haut du corps, fondu 40 ms, buste voûté |
| Parade parfaite (contre) | `CombatMelee/Melee_Block_Attack` (`guardCounter`) | coup 0,567 s | haut du corps ×1,25, fente vers l'attaquant |
| Parade bonne / coup en garde | `CombatMelee/Melee_Block_Hit` (`guardHit`) | — | haut du corps, recul |
| Coup reçu de face / de dos | `hit` / `hitB` (clips du perso, Hit_A / Hit_B) | — | corps entier + fouet selon le vecteur de recul |
| Éjection | `hitB` puis `jumpAir`, vrille procédurale (pivot au centre du corps) | — | corps entier |
| Réception | `jumpLand` (LFLUID) + écrasement | — | corps entier |
| Accroché / remontée | `jumpAir` + bras levés procéduraux / `jumpStart` + arc | — | corps entier |
| Déséquilibre (`teeter`) | `idle` + moulinet et bascule procéduraux | — | procédural |
| Double saut | `MovementAdvanced/Dodge_Forward` (`dodgeF`) + salto | — | corps entier |
| Course verrouillée | `Running_Strafe_Left/Right`, `Walking_Backwards` | vitesses naturelles mesurées | corps entier |
| Réapparition | `General/Spawn_Air` (`spawnAir`) | — | corps entier |
| Victoire / défaite | `Simulation/Cheering` + bras ouverts qui pompent, bonds / `General/Death_B` | — | corps entier |

Vitesses naturelles mesurées (pied d'appui, unités du modèle par seconde, avant l'échelle 0,7) : course `Running_A` 1,49 · pas chassés 1,45 · recul 0,80. À 6,5 m/s, la cadence de course est plafonnée à ×2 : **les pieds glissent encore** (le cycle KayKit avance à ~1 m/s), c'est le compromis entre glissade et jambes qui deviennent un flou.

## Mesures
Machine très chargée pendant tout le lot (Chromium sans GPU à ~2 à 5 i/s, RAM saturée vers 16h40) : les chiffres du juge sont bruités (± 1 point d'une passe à l'autre sur un scénario inchangé).

| Mesure | Avant (15h15, animateur LAN) | Après (17h) |
|---|---|---|
| `npm run anim`, tests de seuil | 99/100 (72/73) | **74/100 (50/68)** |
| Juge Gemini sur les vidéos de `npm run anim` (mêmes 14 scénarios) | 3,96/10 | 3,29/10 (**non valable**, voir plus bas) |
| Juge Gemini sur le banc LATK2 (vidéos en temps de jeu, 19 vidéos) | — (l'ancien code n'a pas les accès du banc) | 3,33/10 puis **3,80/10** |

Lecture honnête :
- Le **99/100 d'avant était gonflé** : l'ancien animateur écrivait des mesures constantes (`footGapCm: [0, 0]`, `lookErrDeg: 0`, `footIK: true`, lâcher à 40 % de la durée par minuterie). Les mesures sont maintenant réelles (os de la main, pied d'appui, poitrine et tête vers la cible). Les échecs restants sont de vrais défauts : pieds qui glissent à l'arrêt après un recul (1,7 à 3,5 cm par image, seuil 1,5), idle à 1,9 couche active (seuil 2), écrasement de réception trop court dans l'éjection simulée, garde à 40 ms (voulu). 12 manques sont des pages qui n'ont pas chargé en 20 s (machine saturée).
- Le juge sur les vidéos de `npm run anim` **n'est pas valable** cette fois : 5 vidéos sur 18 sont vides (4 Ko : page non chargée), les autres montrent surtout l'écran de chargement et le bandeau READY à 2 i/s ; le juge a quand même noté les vidéos vides.
- Le banc LATK2 filme en temps de jeu, sans chargement : c'est la mesure fiable. Meilleures notes : victoire 6,25, déséquilibre 5,25, double saut 5,25, lancer à l'arrêt 5, garde + parade parfaite 4,75 à 4,8. Plus basses : bord 1,6 (le banc pose le perso sous le sol au milieu du plateau, pas au vrai bord), lancer en courant 1,5 à 4,6 selon la passe, bouclier 2 à 3,25.
- Reproches qui reviennent chez le juge : « aucun objet ni projectile » (c'est le lot LATK1, pas encore fusionné ici), « idle trop statique », « retour au repos robotique ». **L'objectif de 8/10 du juge n'est pas atteint.**

## Planches
- Planche récapitulative commitée : `plan/rendus/LATK2-planche.jpg` (14 actions, vue 3/4, 6 images chacune).
- Dans la copie de travail (dossier `captures/` ignoré par git) : `captures/latk/<action>-34.png`, `captures/latk/<action>-defenseur.png`, `captures/latk/<action>-cote.png`, vidéos `captures/latk/video/*.webm`, verdicts `captures/latk/gemini-verdict*.json`, planches brutes des clips `captures/latk/clip-*.png`.
- Relues image par image ; corrections faites après lecture : buste qui vrillait (ressort instable à 20 i/s), buste couché (rotations accumulées), bras de lancer invisibles (tournés autour de leur propre axe → pointage d'os), V de victoire caché derrière la tête, contre qui pliait le buste en deux, fondus trop courts.

## À savoir pour fusionner
- **Bug corrigé qui touche LATK1** : GLTFLoader « assainit » les noms d'os (les points disparaissent : `handslot.r` → `handslotr`). Avant, `getObjectByName('handslot.r')` renvoyait `null` : **aucun sticker n'arrivait jamais dans la main**, et les armes d'origine des persos n'étaient pas masquées. Maintenant `registry.handSlots[p]` (`getHandSlot(p)` dans `src/scene/api.ts`) renvoie le bon os. LATK1 doit chercher `handslotr`, ou mieux passer par `getHandSlot(p)`.
- **L'objet en main n'est plus posé par `fighters/index.ts`** (l'ancien `attachWeaponSticker` ne marchait pas, voir ci-dessus) : c'est le rôle de LATK1 (`src/scene/weapons/**`, sur `weapon:pick`). Si LATK1 n'est pas fusionné, il n'y a pas d'objet en main.
- Même bug de noms, hors de mon périmètre : `src/ui/portraits.ts:37` compare `'handslot.l'` / `'handslot.r'` (les armes d'origine restent visibles sur les portraits).
- Hiérarchie d'un perso : `container` (position, cap) > `pivot` (vrilles, au centre du corps) > `squashWrapper` (écrasement, pieds au sol) > modèle. `registry.fighterRoots[p]` reste le `container`.
- Le fouet, le recul, le transfert de poids et les autres ressorts sont sous-échantillonnés à 240 Hz : stables même à 20 i/s.
- Les mesures `window.animMetrics.samples` ne sont remplies qu'avec `?animtest=1` (coût par image évité en jeu) ; les événements (transitions, lâchers, réactions) restent émis.
- Accès de mise au point `window.__fighters` (position, charge et vol imposés pour les bancs) : jamais utilisé par le jeu.
- Fondus : 80 ms au moins partout, sauf la **garde (40 ms)** : le lot LATK exige une garde levée en moins de 50 ms.
- `src/scene/fighters/index.ts` et `src/scene/animation/animator.ts` sont largement réécrits (la logique de LFLUID est gardée telle quelle : vitesse lissée, saut en 3 temps, réception écrasée, orientation façon Smash). Un autre lot qui toucherait ces fichiers (saut, persos) entrera en conflit : garder cette version et y reporter son changement.
- Quand le contrat temps réel arrivera, rien à changer ici : les lectures de `charge`, `blocking` et `block` passent par des conversions de type et se branchent seules. Si le gameplay expose un cap (`PlayerState.yaw`), l'orientation des persos pourra le suivre (aujourd'hui : vitesse ou adversaire).

## Outils
- `tools/anim/latk2-lab.mjs` : banc visuel par action (planches + vidéos en temps de jeu, `--views 34,defenseur,cote`, `--only`, `--clips` pour les planches brutes).
- `tools/anim/juge-gemini.mjs` : options `--env` (depuis une copie de travail sans `.env`, l'outil lit lui-même celui du dépôt principal ; aucun agent ne le lit), `--videos`, `--out`, `--notes`.
- `tools/anim/scenarios.json` : 4 scénarios ajoutés (éjection en vrille, parade parfaite, bord, victoire) et un contexte par scénario pour le juge.

## Limites connues
- Pieds qui glissent à pleine vitesse (voir plus haut).
- Les persos chibi ont des bras courts : le geste du clip est petit, l'exagération vient de la torsion, du bras armé, de la fente et de l'écrasement.
- Le banc temps réel (`npm run anim`) filme en temps réel une machine chargée (Chromium sans GPU, ~2 à 5 i/s) : ses vidéos sont saccadées et commencent par l'écran de chargement, ce qui plombe le juge Gemini quel que soit le code. Le banc LATK2 filme en temps de jeu pour cette raison.
