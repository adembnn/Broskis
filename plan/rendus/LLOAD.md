# Rendu du lot LLOAD · Personne ne sent les chargements

**En 2 lignes** : l'entrée dans le match se fait derrière un rideau P1/P2 animé qui s'ouvre sur une scène complète en ~1 s (avant : 2 images figées de plus d'une seconde, puis le décor qui apparaît morceau par morceau), et la présentation des armes n'attend plus l'animateur (sa voix est prête avant). Le scan d'un objet montre ce que l'IA a compris au fil de l'eau (Gemini en flux : « Gemini sees: garden gnome », puis le nom), jusqu'au sticker qui claque.

Branche : `worktree-agent-a4dcfbde956bd11ab`, **à jour de `main` (`86060d8`, pivot temps réel compris)**, fusions faites par moi en gardant la structure des écrans de LUX et l'animateur de LVOX. `npm run build` passe.

## 1. Ce que fait la communauté (références)

| Technique | Référence | Ce qu'on en a pris |
|---|---|---|
| Lancer le travail AVANT la décision (envoi de la photo pendant que l'utilisateur écrit la légende) | Mike Krieger, *Secrets to Lightning-Fast Mobile Design* (Instagram, 2011) : [résumé High Scalability](https://highscalability.com/3-secrets-to-lightning-fast-mobile-design-at-instagram/), [LukeW](https://www.lukew.com/ff/entry.asp?1458=) | Voix de pesée d'une arme dès qu'elle est choisie, sticker parti dès la photo |
| Précharger au survol (65 ms de survol = 1 chance sur 2 de clic, ~300 ms d'avance) | [instant.page](https://instant.page/) | Survol/focus d'une vignette de map = préchargement |
| Compiler les shaders avant qu'on en ait besoin, sans figer le fil principal | [three.js `compileAsync`](https://threejs.org/docs/pages/WebGLRenderer.html) (extension `KHR_parallel_shader_compile`), [issue three.js #16321](https://github.com/mrdoob/three.js/issues/16321) ; même idée qu'Unreal « PSO precaching » | Répétition générale à l'écran-titre + compilation sous le rideau |
| Transitions qui cachent le chargement (couloirs étroits, portes, rideaux) | God of War Ragnarök, passages étroits : [Push Square](https://www.pushsquare.com/news/2022/10/god-of-war-ragnaroks-ps5-ps4-squeeze-gaps-spark-insight-into-hidden-loading-screens) ; écran VS de Smash | Rideau P1/P2 + logo entre la map et « READY? » |
| Un temps occupé paraît plus court ; une attente expliquée paraît plus courte | David Maister, [*The Psychology of Waiting Lines*](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf) (1985) | Astuces si le rideau dure, étapes réelles affichées (« Gemini sees: … ») |
| Seuils de perception : 0,1 s instantané, 1 s flux de pensée conservé, 10 s attention perdue ; 400 ms (Doherty) | NN/g, [Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) ; [Doherty Threshold](https://lawsofux.com/doherty-threshold/) ; NN/g [Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) | Objectif rideau ≈ 1 s, texte qui arrive par morceaux |
| Barres de progression perçues plus rapides (−11 %) ; ne jamais mentir sur la progression | Harrison, Yeo, Hudson, [*Faster Progress Bars*](https://www.chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf) (CHI 2010) | Pastilles d'étapes RÉELLES (rideau : match lancé / scène posée / shaders ; forge : photo / stats / sticker), aucune fausse barre |
| Mini-jeux et animations pendant le chargement | Brevet Namco (Ridge Racer, Galaxian) expiré en 2015 : [EFF](https://www.eff.org/deeplinks/2015/12/loading-screen-game-patent-finally-expires) | Écarté : nos attentes restantes durent ~1 s |
| Afficher la génération au fil de l'eau | [Gemini API, streaming](https://ai.google.dev/gemini-api/docs/text-generation) (`generateContentStream`) | Description de l'arme en flux (objet reconnu, nom, phrase) |

## 2. Mesures avant / après

Outil : `node tools/lload/mesure.mjs <url> <dossier> <pause-titre-ms>` (Chromium avec fenêtre et GPU, `?demo=1`, persos et armes du râtelier, Archipel, 4 s sur l'écran-titre comme un humain). « Avant » = même script sur `ad1f705`. Machine chargée par une dizaine d'agents : les temps absolus bougent d'un passage à l'autre, les écarts restent nets.

| Attente | Avant (`ad1f705`) | Après (branche fusionnée avec `main`) |
|---|---|---|
| Clic sur la map → scène complète | 4,1 à 4,4 s, dont **2 images figées de 1,22 s et 1,29 s** en plein écran, décor qui apparaît par morceaux | rideau animé ouvert à **1,01 s** (répétition faite) ; 1,8 à 2,7 s si le joueur quitte l'écran-titre en moins de 2 s |
| Pire image **visible** après le clic sur la map | **1 285 ms** | 222 à 396 ms (1re image au clic ; ensuite ce sont les images normales du match sur cette machine chargée, sujet LPERF) |
| Compilation des shaders à l'entrée du match | synchrone, pendant le jeu | **~7 ms** (répétition faite à l'écran-titre), sinon 0,8 à 2,7 s **sous le rideau** |
| Présentation des armes : écran vide avant la 1re carte | **23,6 à 25,5 s** (`ad1f705`) | carte tout de suite (LUX) ; bouton actif en 0,7 à 1,1 s car la voix de pesée est préparée pendant l'arsenal (LUX plafonne l'attente à 6 s) |
| Scan d'un objet (1 appel réel, `tools/lload/flux.mjs`) | rien avant la réponse complète (3,55 s) | objet reconnu puis nom lisibles à **2,85 s** ; forge animée dès 0,7 s |
| Sticker Nano Banana Pro (~15 s) | forge « marteau » sans information | photo + nom + « Nano Banana is drawing your sticker… », étapes réelles ; carte et Confirm déjà utilisables ; le sticker détouré claque en arrivant |

Détail du rideau (`window.__lloadTransition`) : fermé à 286 ms · match lancé 330 · scène posée 671 · shaders 678 · premières images 761 · ouverture 1 014. Une fois sur quatre passages, une image de 5 s est apparue sous le rideau, non reproduite (diagnostic : 1re image mesurée à 21 ms à la main) ; la charge de la machine est la piste la plus probable.

Captures (dossier ignoré par git, à regarder en local) : `captures/lload/avant/`, `captures/lload/apres/`, `captures/lload/fusion/` (forge, présentation, rideau sur les écrans de LUX), `captures/lload/forge-reelle/` (vrai scan).

## 3. Ce qui a été livré

### `src/core/preload.ts` (nouveau)
- File par priorité (survol 30 > choisi 20 > probable 10 > fond 0), 2 tâches à la fois, tâches de fond sur `requestIdleCallback` ; rien ne jette.
- Dès l'écran-titre : fichiers de la map la plus probable + 2 persos, puis **répétition générale**, puis les 2 autres persos, puis les autres maps. Chargement via les caches des chargeurs de la scène (`instantiate` de `src/scene/maps/loader.ts`, `instantiateFighterModel`).
- **Répétition générale** (une fois, seulement si le joueur est encore sur l'écran-titre) : construit la map DERRIÈRE le menu opaque (via `window.__mapTest`), pose 2 persos, compile tout, rend 2 images, puis retire tout de la scène. Les programmes GPU restent en cache (le moteur ne dispose pas les matériaux en déchargeant) : le vrai match n'a plus rien à compiler. Coût : une image figée de ~0,7 s derrière l'écran-titre statique, ~2,5 s après son affichage.
- `compileScene(ctx)` compile vers les **deux** cibles : celle du post-traitement (hors écran, qualité haute, les 2 vues de l'écran scindé y sont dessinées) et le canvas (qualité basse). Compiler seulement vers le canvas (le réflexe) laissait 15 programmes (~550 ms) à recompiler à la première image.
- `isLoadingCurtainUp()` / `setLoadingCurtainUp()` : contrat pour le compte à rebours temps réel (voir §5).
- `preloadFighters(defs)`, `preloadMap(mapId)`, `preloadStatus()` (aussi `window.__preload()`), `isMapReady`, `pendingLoads`, `waitSceneStable`, `pauseRender`. Apprend les fichiers réellement chargés par une map (localStorage) pour les précharger la fois suivante. `?nopreload=1` désactive tout (comparaisons).

### Appels IA spéculatifs (`src/ia/**`)
- Sticker : il partait déjà en parallèle des stats (vérifié) ; inchangé.
- `primeWeapon(w)` (dans `commentary.ts` de LVOX) : la réplique de pesée d'une arme est vocalisée dès que l'arme est connue (choix dans l'arsenal, ou `scan:result` pendant l'arsenal) ; `prepareCommentary` la retrouve prête.
- `tts-client.ts` : file **par priorité** et un même texte ne part qu'une fois (l'appel spéculatif et celui de la présentation ne font qu'un).
- Clonage de voix (LW2) : il partait déjà à la fin de l'enregistrement ; inchangé.
- Ma banque générique spéculative de l'animateur a été retirée à la fusion : avec LVOX, les moments génériques sont des barks pré-générés.

### Flux Gemini (`api/scan-object.ts` + `src/ia/scan.ts`)
- `{ stream: true }` lance `generateContentStream` et répond tout de suite `{ jobId }` ; `{ jobId }` relève le texte partiel en long polling (attente jusqu'à 400 ms d'un nouveau morceau). Pourquoi pas SSE : le serveur d'API de `vite.config.ts` (lot LPERF, interdit ici) ne renvoie que des réponses entières.
- Les champs lisibles partent sur l'événement de LUX `scan:progress`, étendu d'une étape `'partial'` et d'un champ `preview` (objet reconnu, nom, phrase ; l'arme complète à `'stats'` et `'sticker'`). Seules des chaînes **complètes** et nettoyées (`sanitize.ts`) sont montrées, et rien si l'aperçu ressemble à une vraie arme ou une personne : mesuré, Gemini a écrit « The Potassium Pistol », que le serveur a ensuite remplacé par une arme de secours.
- Même délai maximum qu'avant (`TIMEOUTS.scan`), même bornage final (`finalize`) ; sans `stream`, comportement identique.

### `src/ui/loading/**` (nouveau, API en tête de `index.ts`)
- `coverMatchStart(ctx, start, mapId)` : rideau → match lancé derrière → scène stable → shaders compilés → 2 images → ouverture ; temps de jeu gelé pendant ce temps (`loop.hitstop`) ; émet `transition:open` juste avant l'ouverture des volets.
- `getCurtain()` : volets P1 rouge / P2 bleu en biais, couture encre + vinyle, logo BROSKIS qui claque puis oscille, pastilles d'étapes réelles, astuce si l'attente dépasse `durees.dramatique`. Construit à l'avance (idle).
- `mountForgeView({ photoUrl, label, player?, status? })` : s'abonne tout seul à `scan:progress` ; la vraie photo sous un faisceau de lecture et des étincelles, « Gemini sees: <objet> », nom qui s'écrit, « Nano Banana is drawing your sticker… », puis le sticker détouré (`detourSticker` de LUX) qui claque sur la photo.
- `typewriter(el)` : texte au fil de l'eau (un flux qui s'allonge continue, ne recommence pas).
- `mountTips` / `TIPS` : 8 astuces en anglais. **À revoir pour le temps réel** (elles parlent encore de tours et de parade à ESPACE/ENTRÉE) : elles ne s'affichent que si le rideau dure plus de 0,9 s.
- Valeurs visuelles tirées de `src/art/tokens.js` ; seuls `transform` et `opacity` sont animés (le rideau bouge même quand le fil principal compile).

## 4. Branchements dans les fichiers de LUX (état après fusion)

| Fichier | Changement |
|---|---|
| `src/ui/index.ts` | imports `preloadFighters`, `coverMatchStart` ; `preloadFighters(fighters)` juste après `runFighterSelect` ; dans `startMatch()` : `void coverMatchStart(ctx, () => ctx.hooks.startMatch({ ...opts, weapons }), opts.map)` (revanche comprise) ; **plus de `clear(screenLayer)` après `runMapSelect`** (le rideau couvre l'écran, `match:start` le vide) |
| `src/ui/screenMap.ts` | import `preloadMap` ; dans `mapTile` : `pointerenter` et `focus` → `preloadMap(preset.id)` |
| `src/ui/screenArsenal.ts` | `mountForgeView` au lieu de `mountForge` dans `forgeAndCard`, puis forge et carte côte à côte (`.lload-pair`) ; `primeWeapon(cloned)` dans `assign()` |
| `src/ui/screenReveal.ts` | sous-titre en `typewriter` (3 lignes : création, `line.set` au lieu de `textContent`, `dispose`) |
| `src/ui/snapTime.ts` | `mountForgeView({ …, player })` pour le scan en plein combat |

Autres fichiers partagés : `src/main.ts` (une ligne `['preload', installPreload]`), `src/core/events.ts` (`scan:progress` : étape `'partial'` + `preview` ; nouvel événement `transition:open`), `src/ia/index.ts` (`primeWeapon` dans l'écouteur `scan:result` de LSCAN-OBJ).

## 5. Pour les autres lots
- **Compte à rebours temps réel (LSMASH / RTVIEW / LUX)** : au `match:start`, si `isLoadingCurtainUp()` (de `src/core/preload.ts`) est vrai, lancer READY? 3-2-1 GO! sur `transition:open` ; le rideau met ensuite 280 ms à s'ouvrir, donc il s'ouvre pile sur « 3 ». Aujourd'hui `match:banner` 'ready' part dans `startMatch` et tombe sous le rideau.
- **RTVIEW** : la précompilation couvre l'écran scindé tant que les 2 vues sont dessinées avec les matériaux de `ctx.three.scene` (la caméra et le viewport ne changent pas les programmes GPU). Si une vue utilise une autre scène ou des matériaux de remplacement, les ajouter à la scène le temps de `compileScene`.
- **LMAP2** : la répétition générale passe par `window.__mapTest(mapId)` ; s'il disparaît, elle ne se fait plus (sans erreur). Garder la map comme enfant direct de la scène et ne pas `dispose()` ses matériaux au déchargement.
- **LUX** : `rack.hidden` n'a pas d'effet si une règle CSS donne un `display` au râtelier (vérifié sur l'ancienne interface). Un fond « scène 3D » dans les menus rendrait visible la répétition générale (~0,7 s, une fois).
- **LPERF** : `renderer.debug.checkShaderErrors = false` en démo accélère la compilation (recommandation three.js, non mesuré ici).
- **Titouan (audio)** : précharger les barks par `fetch` n'apporte rien en local (serveur de dev en `Cache-Control: no-cache`) ; le vrai gain serait de décoder à l'avance les barks des persos choisis dans `barks.ts`.

## 6. Pas fait, et pourquoi
- Écran-titre au premier chargement (bundle, polices) : `index.html` et les polices ne sont pas dans mes chemins ; en démo la page est chargée avant de commencer.
- Envoi explicite des textures au GPU pendant les menus (`renderer.initTexture`) : essayé puis retiré, chaque envoi figeait le menu 150 à 450 ms.
- Mini-jeu pendant les attentes : les attentes restantes durent ~1 s.
- Photo d'une personne : toujours un seul appel qui attend le visage (~15 s) ; à découper en deux (attributs d'abord, visage ensuite), la forge accepte déjà des textes d'étape sur mesure (`status`).
