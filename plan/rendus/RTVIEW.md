# Rendu RTVIEW · Écran scindé + caméras troisième personne verrouillées
Claude (Opus), 15h40 → 16h45 (horloge du PC). Branche `worktree-agent-af6f158e7ad1c156c`, fusionnée avec `main` à 16h40.

## En bref
- **L'écran scindé marche de bout en bout** avec le cœur temps réel (RTCORE) et le HUD scindé (LUX) : compte à rebours, combat, pertes de vies, KO, écran de fin, sur les 3 maps, **zéro erreur console**, les 2 persos **toujours dans le cadre des 2 vues** (vérifié à chaque échantillon de combat).
- **Un seul rendu** (`WebGLRenderer`), 2 vues côte à côte : P1 à gauche, P2 à droite, trait d'encre de 4 px entre les deux. Ombres calculées **une fois** par image, post-traitement (bloom, étalonnage, vignette) **une fois** sur l'image complète, vignette recentrée sur chaque vue.
- **Caméra verrouillée par joueur** : derrière et au-dessus de lui (6,5 m, 3,2 m, 0,9 m à droite), sur l'axe joueur → adversaire, lissage 0,12 s. Règle d'Adem respectée : **chaque vue reste sur son joueur**, aucune bascule, aucun plan partagé.
- **Effets par vue** : secousse, zoom KO, suivi d'éjection, suivi de chute, occlusion (le décor qui masque devient transparent dans la vue où il masque, et seulement là).
- **Perf** : la caméra coûtait 3,2 ms par image en scindé, avec des pics de ~30 ms 15 fois par seconde ; elle coûte **0,05 ms**. Match scindé sur le Galion : **124 i/s** en moyenne, image médiane 7 ms, 99e centile 14 ms (avant : 46 i/s, 21 ms, 56 ms).

## API pour les autres lots (contrat, `src/core/types.ts`)
| Quoi | Où | Pour qui |
|---|---|---|
| `ctx.three.cameras: [camP1, camP2]` ; `ctx.three.camera` = `cameras[0]` (compatibilité) | `Three` | LUX, LATK1 |
| `ctx.three.viewOf(player)` → `{ player, camera, x, y, width, height, visible }` : rectangle de la vue en **px CSS, origine en haut à gauche du canvas** | `Three` | LUX (HUD par vue), effets |
| `ctx.three.views()` : vues dessinées cette image, de gauche à droite (1 en solo, 2 en scindé) | `Three` | tous |
| `ctx.three.viewMode` (`'solo'` ou `'split'`), `ctx.three.soloPlayer`, `ctx.three.setViewMode(mode, soloPlayer?)` | `Three` | UI, régie |
| `ctx.three.onBeforeView(fn(view))` : appelé juste avant de dessiner chaque vue | `Three` | effets réservés à une vue |
| `forwardOf(player): Vec3` : avant **horizontal** de la caméra du joueur (y = 0, normé). Droite = `[-f[2], 0, f[0]]`. Disponible en 3 endroits : `ctx.three.forwardOf`, `src/scene/camera` (export, `null` avant l'installation ; c'est là que `gameplay/movement.ts` le lit), `src/scene/api` | contrat + imports | RTCORE |
| `StartMatchOptions.split?` et `GameState.split` : écran scindé du match ; par défaut `!vsAI` (RTCORE le recopie) | contrat | RTCORE, UI |
| `worldToScreen(point, player = 0)` : projette dans le rectangle de la vue du joueur | `src/scene/api.ts` | LUX |
| `cameraShake(trauma, player?)` : secoue la vue d'un joueur (sans joueur : les 2) | `src/scene/api.ts` | effets |
| `onlyInView(obj, player)` : objet (et enfants) dessiné seulement dans la vue de ce joueur (calques three.js 1 et 2) | `src/scene/api.ts` | effets |
| Débogage : `window.__rtview.calls` (appels de dessin par vue, dernière image ; la 1re vue compte aussi la passe d'ombres), `window.__rtviewRigs` | global | bancs |

Mode d'affichage : décidé au `match:start` (`state.split ?? !state.vsAI`) ; écrans de menu → solo sur P1. En solo (contre l'IA), une seule vue plein écran, FOV 45° (55° en 16:9 serait un fish-eye à 85° de large).

## Comment c'est fait
- `src/core/ctx.ts` : 2 `PerspectiveCamera` (une par joueur), rectangles des vues, `drawViews(cible)` : pour chaque vue, on règle **la cible elle-même** (`rt.viewport`, `rt.scissor`, `rt.scissorTest`, en pixels de la cible), puis on la remet en plein écran (sinon le bloom ne couvre qu'une moitié) ; `shadowMap.autoUpdate = false` et `needsUpdate = true` avant la 1re vue. Ratio de pixels 1 en scindé. La **qualité basse** (auto de LPERF) dessine aussi les 2 vues, directement dans le canvas. Trait d'encre = `rendu.contour.encre`, dessiné sur le canvas après tout le reste.
- `src/scene/render/postfx.ts` : `ViewsPass` remplace `RenderPass` ; bloom et étalonnage tournent une fois ; vignette par vue (`fract(vUv.x * nbVues)`) ; `composer.setPixelRatio(1)` (recommandation LPERF).
- `src/scene/camera/rig.ts` : une caméra par joueur. L'angle suit l'axe joueur → adversaire (tenu quand ils se superposent : pas de toupie) ; point visé entre les 2, plus près de l'adversaire, 0,4 m au-dessus du sol (les pieds restent au-dessus du HUD) ; suivi en temps **réel** (un ralenti ou un gel d'impact ne fige pas la caméra).
- `src/scene/camera/occlusion.ts` : occlusion par vue. Le fondu porte sur un **clone** du matériau (un accessoire qui partage son matériau n'entraîne pas les autres), opacité posée juste avant chaque vue. Rayons sur des **boîtes**, sur une liste d'objets de taille « accessoire » relue toutes les 2 s (au lieu de rayons triangle par triangle sur toute la map). Le shader transparent de chaque matériau est **compilé en tâche de fond** avant son 1er fondu (sinon gel au rendu). Collision caméra : elle ne rentre que si la caméra finirait **dans** un objet ; sinon l'occlusion suffit.
- `src/scene/camera/tokens.ts` : tous les réglages (distances, lissages, FOV, effets, budgets).

## Effets par vue (sans jamais quitter son joueur)
| Événement | Vue de la victime / du joueur concerné | Autre vue |
|---|---|---|
| `hit` | secousse (`juice.toucher` ou `critique`), coup de FOV ; si éjection ≥ 6 m/s : la caméra recule de 2,2 m, monte de 1,2 m et suit la trajectoire 1,4 s | secousse × 0,25 (l'attaquant sent le coup porter) |
| `camera:cue { shot: 'impact', target }` (zoom KO des effets Smash) | zoom sec de 12° sur son joueur, visée recalée tout de suite, retour en 0,35 s | rien |
| `ko` | secousse + zoom KO ; hitstop et ralenti de `juice.victoire` | secousse × 0,25 |
| `fire`, `move:jump`, `parry:result` | secousse du joueur qui agit | rien |
| chute sous le plateau | la caméra regarde son joueur tomber | rien |
| `respawn` | recalage immédiat | rien |
| `turn-swing`, `overview`, `ko-orbit`, `follow-projectile`, `turn:start` | **ignorés** (tour par tour, règle d'Adem) | |

## Mesures (RTX 5060, Chromium `--use-angle=d3d11 --force_high_performance_gpu`, 1600×900, `?q=haute`)
Appels de dessin par vue pendant un match (la 1re vue inclut la passe d'ombres, ~25-45 appels) :

| Map | Vue P1 (avec ombres) | Vue P2 | Pic en combat (P1 / P2) |
|---|---|---|---|
| Archipel | 85 à 122 | 63 à 88 | 138 / 123 |
| Galion | 108 à 147 | 91 à 115 | 143 / 115 |
| Cuisine | 107 à 125 | 83 à 87 | 107 / 87 |

Images par seconde, match scripté complet en écran scindé (la machine faisait tourner d'autres agents en même temps : chiffres bruités, le 144 Hz de l'écran plafonne la médiane à 7 ms) :

| | moyenne | médiane | 99e centile |
|---|---|---|---|
| Galion, avant l'occlusion par boîtes | 46 i/s | 20,8 ms | 55,6 ms |
| Galion, après | **124 i/s** | **7,0 ms** | **14 ms** |
| Archipel, après | voir ajout plus bas | | |

Coût de la caméra (système `la-camera`, moyenne par image, Galion) : 3,16 ms → **0,05 ms** en scindé ; 1,37 ms → 0,05 ms en solo.

## Bugs trouvés et corrigés en route
1. **Vue entièrement blanche face au soleil** (Archipel, caméra tournée vers -Z) : le ciel three.js (`Sky`) sortait des valeurs très au-dessus du seuil du bloom. Les caméras du tour par tour ne regardaient jamais par là. Correctif (`render/environment.ts`) : sa composante la plus forte est plafonnée sous le seuil (teinte gardée). Captures `soleil-avant.png` / `soleil-apres.png`. **LSKY : garder le futur panorama sous 0,85 de luminance, sinon le problème revient.**
2. **Erreur console à chaque passage** (`Raycaster.camera` + `THREE.Sprite`) : `raycaster.camera` posé ; les rayons sont maintenant sur des boîtes.
3. **Caméra collée au perso** : la collision rentrait derrière chaque plateforme (`hex_grass` derrière P1 → recul à 34 %). Elle ne rentre plus que si la caméra finirait dans le décor.
4. **`forwardOf` introuvable par RTCORE** : `gameplay/movement.ts` le cherche dans `src/scene/camera` ; il y est maintenant exporté (avant, le déplacement retombait sur l'axe brut joueur → adversaire).
5. **Plateforme qui cache son propre perso** (Cuisine, planche à découper entre la caméra et P1) : les plateformes à sauter (`oneway-*`, exclues par `maps/engine.ts`) sont maintenant estompables ; le plateau principal ne s'efface jamais. Captures `occlusion-cuisine-avant.png` / `-apres.png`.
6. Les clones de fondu perdaient les retouches de shader des maps (`onBeforeCompile` n'est pas copié par `Material.clone`) : recopiées.

## Pour les autres lots
- **Effets Smash (`src/scene/fx/smash/index.ts`, hors de mes chemins)** : le voile du zoom KO (vignette rouge, lignes radiales) et les flashs sont un quad plein écran dessiné **dans les 2 vues**. Pour le réserver à la victime : `onlyInView(overlayMesh, ev.target)` au moment du `flash`, puis `overlayMesh.layers.set(0)` quand il s'éteint (GAME! reste sur les 2). De même, `registry.shake?.add(0.6)` au `stock:lost` secoue les 2 vues : `cameraShake(0.6, player)`.
- **Particules (`fx/index.ts`, `fx/smash`)** : `uScale` est calculé avec le FOV de la caméra de P1 à l'installation (45°) ; en scindé, le FOV est 55° : particules ~25 % trop grosses. Recalculer au `resize` avec `ctx.three.viewOf(0).camera.fov`.
- **Persos (`fighters/index.ts`)** : l'ordre des coques vinyle se trie sur `ctx.three.camera` (P1). Sans effet visible tant qu'il n'y a qu'une coque d'encre ; si les 3 coques reviennent, trier par vue avec `onBeforeView`.
- **Maps** : les plateformes `oneway-*` s'estompent quand elles cachent un perso ; les objets de plus de 7 m de rayon (sol, coque, murs) ne s'estompent jamais.
- **LPERF** : `src/core/shaders.ts` compile avec la caméra de P1 ; les shaders ne dépendent pas de la caméra, donc les 2 vues sont couvertes.

## Captures (`captures/rtview/` de ma copie, dossier ignoré par git)
`split-archipel.png`, `split-galion.png`, `split-cuisine.png` (début de match, 2 vues) · `combat-archipel-rapproche.png`, `combat-archipel-bord.png` (match réel piloté par `gameHooks.input`) · `ejection-galion.png` (la caméra de P2 suit son éjection au-dessus de la mer) · `zoom-ko-p1.png` (zoom KO dans la vue de P1 seulement) · `solo-vs-ia.png` · `soleil-avant/apres.png` · `occlusion-cuisine-avant/apres.png`.
Scripts de test (Playwright, port 5312) : `rtview-shots.mjs`, `rtview-match.mjs` (match complet scripté), `rtview-scenario.mjs` (tour autour, superposition, éjection, zoom KO, solo), `rtview-occ.mjs`, `rtview-perf.mjs`, dans le dossier scratchpad de la session.
