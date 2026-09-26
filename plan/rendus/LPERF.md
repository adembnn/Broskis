# Rendu LPERF · Fluidité (agent Claude Opus, 14h20 → 15h30)

Branche : `worktree-agent-acbe80fdda3fb16f6` (partie de `ff40420`). Rien n'est poussé.

## En 3 lignes
1. **Cause n°1 des saccades : Chrome dessine le jeu avec la puce Intel intégrée du portable, pas avec la carte NVIDIA.** Mesuré : 12 à 28 i/s (images par seconde) sur Intel, 120 à 144 i/s sur la NVIDIA, même code. `powerPreference: 'high-performance'` est ignoré sous Windows (vérifié avec Chromium, `tools/perf/gpu-probe.mjs`).
2. Dans le code, j'ai ajouté une **qualité automatique** (si l'ordinateur rame au 1er tour, on coupe le post-traitement : ×2 d'i/s sur Intel, seul le halo lumineux disparaît), une **préchauffe des shaders** (plus de gel de 90 à 350 ms à la 1re visée) et **corrigé la caméra** (18 ms perdus par image sur le Galion).
3. `npm run demo` sert le build de production **avec les API** ; `npm run demo:chrome` ouvre le jeu dans Chrome sur la carte NVIDIA.

## À faire par Adem (2 minutes, avant la démo)
- **Paramètres Windows → Système → Écran → Graphiques → Google Chrome → Options → « Hautes performances » (NVIDIA GeForce RTX 5060)**, puis fermer et rouvrir Chrome. Vérifier dans `chrome://gpu` : la ligne `GL_RENDERER` doit contenir « NVIDIA ».
- Solution de secours sans toucher aux réglages : `npm run demo` (terminal 1) puis `npm run demo:chrome` (terminal 2). Profil Chrome séparé : il faudra autoriser la webcam une fois.
- Laisser le portable **branché sur secteur** (sur batterie la NVIDIA est bridée).
- Écran de démo à 60 Hz : sans effet sur le réglage automatique (seuil à 20 ms par image).

## Méthode
- Banc `npm run perf` (`tools/perf/bench.mjs`) : Chromium **avec fenêtre et vrai GPU** (ANGLE D3D11), 1536×864 CSS × 1,25 = **1920×1080 réels**, comme l'écran du PC d'Adem (DPI 120). Par map : chargement, puis **20 s de match scripté** (marche, saut, tir sur l'adversaire, parade une fois sur deux), mode `?demo=1`.
- Mesures : i/s moyen, **1 % bas** (i/s moyen des 1 % d'images les plus lentes), images > 33 ms et > 50 ms, tâches longues (> 50 ms), appels de dessin (ordres envoyés à la carte graphique) de toute l'image (ombres et post-traitement compris), temps par système de la boucle, shaders compilés pendant le match et **qui les a demandés**, temps PLAY → 1er tour jouable.
- `--gpu intel|nvidia` (Intel = choix par défaut de Chrome sur ce PC), `--q haute|basse`, `--toggle` pour les essais A/B, `--profile` (profil CPU), `--preview` (build de production), `--shot` (capture).
- **Limite** : pendant les mesures, d'autres agents faisaient tourner jusqu'à 18 navigateurs sans fenêtre (rendu logiciel, qui mange le processeur). Les chiffres Intel varient du simple au double d'une série à l'autre ; les comparaisons A/B ont donc été faites **dos à dos**.

## Avant / après

### NVIDIA RTX 5060 (Chrome forcé sur NVIDIA), serveur de dev, 20 s de match
| Map | i/s moyen | 1 % bas | images > 50 ms | tâches longues | appels de dessin | PLAY → 1er tour |
|---|---|---|---|---|---|---|
| Archipel | 84,8 → **144** (plafond de l'écran 144 Hz) | 29,8 → **127** | 1 → **0** | 1 (60 ms) → **0** | 211 → 212 | 2,5 s → **1,4 s** |
| Galion | 121 → **126** | 28,1 → 31,4 | 5 → **1** (56 ms) | 4 (331 ms) → **0** | 230 → 229 | 2,8 s → **1,5 s** |
| Cuisine | 130 → 122 | 58 → 28 (bruit, voir limite) | 0 → 0 | 0 → 0 | 177 → 176 | 1,7 s → 2,0 s |

Objectif « aucune image au-delà de 50 ms pendant un match » : atteint sur Archipel et Cuisine, une image de 56 ms sur 20 s au Galion.

### Build de production (`npm run demo`), NVIDIA
| Map | i/s moyen | 1 % bas | page chargée | PLAY → 1er tour | pire image au chargement |
|---|---|---|---|---|---|
| Archipel | 120 | 32 | 0,9 s | 1,5 s | 396 ms (dev : 700 à 1 400 ms) |
| Galion | 136 | 41 | 0,7 s | 1,4 s | 271 ms |
| Cuisine | 75 (bruit) | 15 | 1,0 s | 1,5 s | 389 ms |

Serveur de dev à froid (1er chargement après `npm run dev`) : 9,7 s de page + 22 s avant le 1er tour. Le build évite ça.
JS : un fichier de 5,3 Mo → jeu 225 Ko + three.js 718 Ko + Rapier 4,3 Mo (moteur physique avec son wasm en base64).

### Intel UHD (choix par défaut de Chrome) : ce qu'Adem voyait
| Mesure (Galion, dos à dos, code d'origine) | i/s moyen | image médiane |
|---|---|---|
| Actuel (MSAA ×4 sur cible HalfFloat + bloom + 2 ombres) | 28,3 | 34,7 ms |
| Rendu direct sans post-traitement (= qualité basse) | **63,6** | **13,9 ms** |
| Sans MSAA seulement | 47,5 | 20,8 ms |
| Sans bloom seulement | 41,1 | 20,9 ms |
| Ombres figées | 32,1 | 27,8 ms |
| Une seule pile de lumières au lieu de deux | médiane −30 à −40 % | 230 → 190 appels de dessin |

Séries complètes 3 maps, Intel : code d'origine 12,6 à 17 i/s (100 à 150 images > 50 ms en 20 s) ; avec la qualité automatique, série la plus calme : Archipel 93 i/s, Galion 39, Cuisine 58 (images médianes 7 à 14 ms) ; série sous forte charge d'autres agents : 19 à 28 i/s. **Sur Intel, la vraie solution reste la NVIDIA.**

## Corrections faites (commits)
| Hash | Quoi | Gain mesuré |
|---|---|---|
| `06b31be` | Banc `npm run perf` + chrono par système dans `src/core/loop.ts` (actif seulement si `window.__perfSys` existe) | outil |
| `0d76168`, `7a4a380`, `5c5550d` | `src/core/quality.ts` : qualité automatique. Au 1er tour jouable, attend 1,5 s puis mesure 2,5 s ; image médiane > 20 ms → rendu direct dans le canvas (anticrénelage natif, **sans bloom**). Shaders du rendu direct compilés avant la bascule (sinon gel d'~1 s). `?q=haute` / `?q=basse` pour forcer, `window.__qualite` pour déboguer | Intel : ×2 d'i/s ; NVIDIA : rien ne change (médiane 7 ms). Capture même image haute/basse : couleurs identiques, seul le halo du bloom disparaît |
| `a467dd9` | `npm run demo` : `vite build` + `vite preview` **avec les API `/api/*`** (`runnerImport`, gestionnaires préchauffés au démarrage) ; three.js et Rapier en fichiers séparés ; `npm run demo:chrome` ouvre Chrome sur la NVIDIA | 1er appel API 0,8 s → 0,08 s ; appel Gemini réel testé (1,4 s) |
| `2ae03f6` | `src/scene/camera/occlusion.ts` : le rayon anti-masquage ne teste plus les persos animés (chaque sommet recalculé avec ses os) | caméra 0,71 → 0,15 ms par image, pire 18 → 3 ms (Galion). Et un perso ne passe plus en fondu transparent |
| `c22d841` | `src/ui/hud.ts` : le chrono n'écrit dans le DOM que quand l'affichage change | 144 écritures/s → 1 à 33 |
| `9e87b27` | `src/scene/aim.ts` : **bug visible corrigé** — three r186 tronque la ligne de visée à sa 1re taille : après une visée au blaster (2 points), la cloche de la grenade (99 points) s'affichait en **ligne droite**. Attribut alloué une fois (256 points) + `drawRange` | vérifié : blaster 2 points, grenade 99, en alternance ; le shader de la ligne n'est plus recompilé à la 1re visée |
| `5c5550d` | `src/core/shaders.ts` : préchauffe des shaders au 1er tour jouable de chaque match (lumières de la map en place, objets cachés compris) | gel à la 1re visée 83 à 347 ms → **0** ; shaders compilés pendant le match 5 → 1 |
| autres | `diag.mjs` (lumières, ombres, matériaux), `gpu-probe.mjs` (quelle carte), `compare-qualite.mjs` (même image, 2 réglages) | outils |

Note pour LLOAD (préchargement) : je n'ai **pas** touché aux voix ni aux écrans. Mon seul préchargement est `src/core/shaders.ts` (compilation au 1er tour de chaque match). Il **complète** une compilation pendant les menus : voir recommandation 1, un shader compilé dans les menus n'est plus valable une fois la map chargée.

## Recommandations pour les autres lots
1. **LLOAD** (préchargement) — la clé de chaque shader contient le **nombre de lumières** (`node_modules/three/src/renderers/webgl/WebGLPrograms.js:477`, pour TOUS les matériaux, même non éclairés). La map ajoute 3 lumières au chargement : tout ce qui est compilé dans les menus est recompilé au début du match. Compiler **après** le chargement de la map (c'est ce que fait `src/core/shaders.ts` au 1er tour ; appeler `renderer.compileAsync` à la fin de `loadMap`, `src/scene/maps/engine.ts:953`, serait encore mieux). Restent compilés à la volée : les coques de contour créées à la demande (`src/scene/maps/toon.ts:172`, `src/scene/render/toon.ts:141`, gel de 76 à 153 ms à la 1re apparition) : en garder une instance cachée dans la scène dès le chargement.
2. **LDA2 + LMAP2** — **deux piles de lumières superposées** : `src/scene/render/environment.ts:67-69` (hémisphère + directionnelle avec ombre + ponctuelle) ET `src/scene/maps/engine.ts:142-180` (`buildLights` : les mêmes). En match, 6 lumières dont **2 ombres** : 2 passes d'ombre par image (~40 appels de dessin et 16 k triangles de plus), et chaque pixel calcule 2 fois l'éclairage. Correctif : dans `applyMap` (`environment.ts:82`), cacher les lumières du lot LA quand une map est chargée et doubler les intensités de la map dans les tokens. En toon, 2 lumières identiques = 1 lumière ×2 : capture comparative (`node tools/perf/compare-qualite.mjs --map archipel --lumiere`) quasi identique, seule la position de la lumière ponctuelle change. Gain : 230 → 190 appels de dessin, image médiane −30 à −40 % sur Intel.
3. **LDA2** (`src/scene/render/postfx.ts:25-26`) — la cible `samples: 4` + `HalfFloatType` est le plus gros coût sur Intel (sans MSAA : 28 → 47 i/s). De plus, `EffectComposer` construit avec une cible déjà créée garde la taille CSS (1536×864) tant qu'il n'y a pas de redimensionnement, puis passe à 1920×1080 au 1er redimensionnement (F11, plein écran) : +56 % de pixels d'un coup. Fixer la définition une fois pour toutes : `composer.setPixelRatio(1)` juste après la création (scène à la même définition qu'aujourd'hui, 1536×864, et stable en plein écran ; le halo du bloom est alors calculé à cette taille, à faire valider par le DA).
4. **LFIX2** (caméra) — `src/scene/camera/occlusion.ts:60-67` : le fondu modifie le **matériau** de l'objet qui masque ; si d'autres objets partagent ce matériau (props clonés), ils deviennent transparents avec lui. Cloner le matériau au 1er fondu.
5. **LUX** (interface) — `src/ui/floaters.ts:23-24` et `src/gameplay/ai/taunt-bubble.ts:32-34` déplacent des éléments avec `left/top` à chaque image (mise en page à chaque image) : utiliser `transform: translate(...)`. Gain faible, à faire seulement si on y touche. Le code du jeu ne pèse que 225 Ko : charger les écrans à la demande ne vaut pas le risque aujourd'hui.
6. **Rapier** (plus tard, pas aujourd'hui) : `@dimforge/rapier3d-compat` embarque son wasm en base64 (4,3 Mo de JS). La version sans `-compat` le charge en fichier `.wasm` (compilation en flux, plus rapide) mais demande une installation npm et un greffon Vite : après la démo.

## Outils (`tools/perf/`)
- `npm run perf -- --gpu nvidia` : banc complet (résultats JSON dans `tools/perf/out/`, ignoré par git).
- `node tools/perf/gpu-probe.mjs` : quelle carte graphique Chromium utilise, avec et sans `--force_high_performance_gpu`.
- `node tools/perf/diag.mjs --map galion` : lumières, ombres, objets, matériaux partagés.
- `node tools/perf/compare-qualite.mjs --map galion [--lumiere]` : même image dans 2 réglages.
- Tous lancent leur propre serveur Vite (ports 5377 à 5381) et n'arrêtent que lui.
