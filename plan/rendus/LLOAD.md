# Rendu du lot LLOAD · Personne ne sent les chargements

**En 2 lignes** : la présentation des armes n'attend plus rien (25,5 s d'écran vide → 0,4 s), l'entrée dans le match se fait derrière un rideau P1/P2 animé qui s'ouvre sur une scène complète en ~1,1 s (avant : 2 images figées de plus d'une seconde, puis le décor qui apparaît morceau par morceau). Le scan d'un objet montre ce que l'IA a réellement compris, au fil de l'eau (Gemini en flux), jusqu'au sticker qui claque.

Branche : `worktree-agent-a4dcfbde956bd11ab` (partie de `main` à `ad1f705`). `npm run build` passe.

## 1. Ce que fait la communauté (références)

| Technique | Référence | Ce qu'on en a pris |
|---|---|---|
| Lancer le travail AVANT la décision (envoi de la photo pendant que l'utilisateur écrit la légende) | Mike Krieger, *Secrets to Lightning-Fast Mobile Design* (Instagram, 2011) : [résumé High Scalability](https://highscalability.com/3-secrets-to-lightning-fast-mobile-design-at-instagram/), [LukeW](https://www.lukew.com/ff/entry.asp?1458=) | Voix d'une arme dès qu'elle est choisie, banque de l'animateur dès l'arsenal, sticker parti dès la photo |
| Précharger au survol (65 ms de survol = 1 chance sur 2 de clic, ~300 ms d'avance) | [instant.page](https://instant.page/) | Survol/focus d'une vignette de map = préchargement |
| Compiler les shaders avant qu'on en ait besoin, sans figer le fil principal | [three.js `compileAsync`](https://threejs.org/docs/pages/WebGLRenderer.html) (extension `KHR_parallel_shader_compile`), [issue three.js #16321](https://github.com/mrdoob/three.js/issues/16321) ; même idée qu'Unreal « PSO precaching » | Répétition générale à l'écran-titre + compilation sous le rideau |
| Transitions qui cachent le chargement (couloirs étroits, portes, rideaux) | God of War Ragnarök, passages étroits : [Push Square](https://www.pushsquare.com/news/2022/10/god-of-war-ragnaroks-ps5-ps4-squeeze-gaps-spark-insight-into-hidden-loading-screens) ; écran VS de Smash | Rideau P1/P2 + logo entre la map et « READY? » |
| Un temps occupé paraît plus court ; une attente expliquée paraît plus courte | David Maister, [*The Psychology of Waiting Lines*](https://www.columbia.edu/~ww2040/4615S13/Psychology_of_Waiting_Lines.pdf) (1985) | Astuces de jeu si le rideau dure, étapes réelles affichées (« Gemini sees: garden gnome ») |
| Seuils de perception : 0,1 s instantané, 1 s flux de pensée conservé, 10 s attention perdue ; 400 ms (Doherty) | NN/g, [Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) ; [Doherty Threshold](https://lawsofux.com/doherty-threshold/) ; NN/g [Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) | Carte d'arme affichée tout de suite, texte qui arrive par morceaux |
| Barres de progression perçues plus rapides (−11 %) ; ne jamais mentir sur la progression | Harrison, Yeo, Hudson, [*Faster Progress Bars*](https://www.chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf) (CHI 2010) | Pastilles d'étapes RÉELLES (rideau : match lancé / scène posée / shaders ; forge : photo / stats / sticker), aucune fausse barre |
| Mini-jeux et animations pendant le chargement | Brevet Namco (Ridge Racer, Galaxian) expiré en 2015 : [EFF](https://www.eff.org/deeplinks/2015/12/loading-screen-game-patent-finally-expires) | Écarté : nos attentes restantes durent ~1 s, un mini-jeu serait du bruit |
| Afficher la génération au fil de l'eau | [Gemini API, streaming](https://ai.google.dev/gemini-api/docs/text-generation) (`generateContentStream`) | Description de l'arme en flux (nom, objet reconnu, phrase) |

## 2. Mesures avant / après

Outil : `node tools/lload/mesure.mjs <url> <dossier> <pause-titre-ms>` (Chromium avec fenêtre et GPU, `?demo=1`, persos et armes du râtelier, map Archipel). « Avant » = même script sur le code de `ad1f705`. Machine chargée par une dizaine d'agents en parallèle : les temps absolus bougent d'un passage à l'autre, les écarts restent nets.

| Attente | Avant | Après |
|---|---|---|
| Présentation des armes : écran vide (« Announcer is warming up… ») avant la 1re carte | **23,6 à 25,5 s** | **0,37 à 0,95 s** (le temps du clic) |
| Clic sur la map → scène complète | 4,1 à 4,4 s, dont **2 images figées de 1,22 s et 1,29 s** en plein écran, décor qui apparaît par morceaux | rideau animé, ouvert à **1,09 s** (répétition faite) ; 1,8 à 2,7 s si le joueur quitte l'écran-titre en moins de 2 s |
| Pire image **visible** après le clic sur la map | **1 285 ms** | 146 à 326 ms (1re image au clic ; ensuite ce sont les images normales du match sur cette machine chargée, sujet LPERF) |
| Compilation des shaders à l'entrée du match | synchrone, pendant le jeu | ~5 ms (répétition) sinon 0,8 à 2,7 s **sous le rideau** |
| Scan d'un objet (1 appel réel, `tools/lload/flux.mjs`) | rien avant la réponse complète (3,55 s) | nom de l'arme lisible à **2,85 s**, objet reconnu affiché avant ; forge animée dès 0,7 s |
| Sticker Nano Banana Pro (~15 s) | forge « marteau » sans information | forge : photo + nom + « Nano Banana is drawing your sticker… », étapes réelles, carte et bouton Confirm déjà utilisables ; le sticker claque en arrivant et atteint bien l'arme du slot (voir « correctif » plus bas) |

Détail du rideau (`window.__lloadTransition`, après répétition) : fermé à 295 ms · match lancé 330 · scène posée 655 · shaders 660 · premières images 1 045 · ouverture 1 045.

Captures (dossier ignoré par git, à regarder en local) : `captures/lload/avant/`, `captures/lload/apres/`, `captures/lload/forge-*.png`, `captures/lload/forge-reelle/`, `captures/lload/presentation-*.png`, `captures/lload/rideau-*.png`.

## 3. Ce qui a été livré

### `src/core/preload.ts` (nouveau)
- File par priorité (survol 30 > choisi 20 > probable 10 > fond 0), 2 tâches à la fois, tâches de fond sur `requestIdleCallback` ; rien ne jette.
- Dès l'écran-titre : fichiers de l'Archipel + 2 persos, puis **répétition générale**, puis les 2 autres persos, puis les autres maps.
- **Répétition générale** (une fois, seulement si le joueur est encore sur l'écran-titre) : construit l'Archipel DERRIÈRE le menu opaque (via `window.__mapTest`, hook du moteur de maps), pose 2 persos, compile tout, rend 2 images, puis retire tout de la scène. Les programmes GPU restent en cache (le moteur ne dispose pas les matériaux en déchargeant) : le vrai match n'a plus rien à compiler. Coût : une image figée de ~0,7 s derrière l'écran-titre statique (~2,5 s après son affichage).
- `compileScene(ctx)` compile vers une **cible hors écran** : le jeu dessine via le composer du post-traitement, et les programmes dépendent de la cible. Compiler vers le canvas (le réflexe) laissait 15 programmes (~550 ms) à recompiler à la première image.
- `preloadFighters(defs)`, `preloadMap(mapId)`, `preloadStatus()` (aussi `window.__preload()`), `isMapReady`, `pendingLoads`, `waitSceneStable`, `pauseRender`.
- Apprend les fichiers réellement chargés par une map (localStorage) pour les précharger la fois suivante : robuste aux nouveaux décors de LMAP2 hors de `assets.ts`.
- `?nopreload=1` désactive tout (comparaisons).

### Appels IA spéculatifs (`src/ia/**`)
- Sticker : il partait déjà en parallèle des stats (vérifié dans `scan.ts`) ; inchangé.
- `commentary.ts` : `primeWeapon(w)` vocalise les 4 répliques d'une arme dès qu'elle est connue (intro en priorité) ; `warmGenericBank(weapons)` part dès l'entrée dans l'arsenal puis est refaite avec les vraies armes (la plus récente gagne, l'ancienne reste utilisable) ; `weaponIntro(w)` rend la réplique avec sa voix si elle arrive en 1,2 s. `prepareCommentary` garde sa signature mais n'a plus besoin d'être attendue (`say` retombe sur la banque de secours).
- `tts-client.ts` : file **par priorité** (la réplique qu'on va entendre passe devant les 40 répliques de fond) et un même texte ne part qu'une fois.
- `index.ts` : `scan:result` → `primeWeapon` ; `phase:change` vers `arsenal` → `warmGenericBank([])`.
- Clonage de voix (LW2) : il partait déjà à la fin de l'enregistrement (`recorder.onstop`) ; inchangé.
- `scan.ts` : option `onProgress(step, weapon)` (étapes réelles `reading`, `partial`, `stats`, `sticker`, `sticker-failed`) + description **en flux**.

### Flux Gemini (`api/scan-object.ts` + `src/ia/scan.ts`)
- `{ stream: true }` lance `generateContentStream` et répond tout de suite `{ jobId }` ; `{ jobId }` relève le texte partiel en long polling (la requête attend jusqu'à 400 ms un nouveau morceau). Pourquoi pas SSE : le serveur de dev (`vite.config.ts`, lot LPERF, interdit ici) ne renvoie que des réponses entières.
- Le navigateur n'affiche que des chaînes **complètes** et nettoyées (`sanitize.ts`), et rien si l'aperçu ressemble à une vraie arme ou une personne : mesuré, Gemini a écrit « The Potassium Pistol », que le serveur a ensuite remplacé par une arme de secours ; un début de nom affiché aurait trahi ce remplacement.
- Même délai maximum qu'avant (`TIMEOUTS.scan`), même bornage final (`finalize`) ; sans `stream`, comportement identique.
- Pas de flux pour la banque de l'animateur : son texte n'est jamais montré pendant qu'il s'écrit (il sert en match), et elle part désormais 30 à 60 s avant d'être utile.

### `src/ui/loading/**` (nouveau, API en tête de `index.ts`)
- `coverMatchStart(ctx, start, mapId)` : rideau → match lancé derrière → scène stable → shaders compilés → 2 images → ouverture ; temps de jeu gelé pendant ce temps (`loop.hitstop`, le tour ne s'écoule pas sous le rideau) ; émet `transition:open`.
- `getCurtain()` : volets P1 rouge / P2 bleu en biais, couture encre + vinyle, logo BROSKIS qui claque puis oscille, pastilles d'étapes réelles, astuce si l'attente dépasse `durees.dramatique`. Construit à l'avance (idle) pour que le clic n'ait rien à préparer.
- `mountForgeView({ photoUrl, label })` : la vraie photo sous un faisceau de lecture et des étincelles, « Gemini sees: <objet> », nom qui s'écrit, « Nano Banana is drawing your sticker… », sticker détouré (chroma key de `src/scene/sticker`) qui claque sur la photo. `forge.update` se passe tel quel en `onProgress`.
- `typewriter(el)` : texte au fil de l'eau (un flux qui s'allonge continue, ne recommence pas ; rattrape son retard).
- `mountTips` / `TIPS` : 8 astuces en anglais, chacune enseigne une vraie règle.
- Toutes les valeurs visuelles viennent de `src/art/tokens.js`. Seuls `transform` et `opacity` sont animés : le rideau et la forge bougent même quand le fil principal compile.

## 4. Branchements dans les fichiers de LUX (à garder à la fusion)

| Fichier | Changement |
|---|---|
| `src/ui/index.ts` | imports `preloadFighters`, `coverMatchStart` ; `preloadFighters(fighters)` juste après `runFighterSelect` ; **plus de `clear(screenLayer)` après `runMapSelect`** (le rideau couvre l'écran, `match:start` le vide) ; `ctx.hooks.startMatch(...)` enveloppé : `await coverMatchStart(ctx, () => ctx.hooks.startMatch({...}), picks.map)` |
| `src/ui/screenMap.ts` | import `preloadMap` ; dans `mapTile` : `pointerenter` et `focus` → `preloadMap(preset.id)` |
| `src/ui/screenReveal.ts` | import `weaponIntro`, `typewriter` ; bouton `Next` actif tout de suite ; `void prepareCommentary(...)` (plus d'`await`) ; sous-titre en `typewriter` ; par carte : `weaponIntro(weapon)` puis `commentary:line` avec la voix si la carte est toujours affichée |
| `src/ui/screenArsenal.ts` | import `primeWeapon`, `mountForgeView` (au lieu de `mountForge`) ; forge branchée sur `scanObject(..., { onProgress: forge.update })`, puis forge et carte côte à côte (`.lload-pair`) ; dans `assign()` : `primeWeapon(cloned)`, et **correctif** : une arme scannée garde son objet (seul l'id change) pour recevoir le sticker qui arrive ~15 s après la carte — avant, la copie du slot ne le recevait jamais et la 3D gardait la forme de secours |
| `src/ui/snapTime.ts` | `mountForgeView` + `onProgress` pour le scan en plein combat (Caisse Snap) |

Autres fichiers partagés : `src/main.ts` (une ligne `['preload', installPreload]` en fin de liste), `src/core/events.ts` (une ligne `'transition:open': { mapId }` après `commentary:line`).

## 5. Pour les autres lots
- **LSMASH / LUX** : afficher « READY? » sur `transition:open` (le rideau vient de s'ouvrir sur une scène prête). Si `match:banner` 'ready' est émis dans `startMatch`, il tombe sous le rideau.
- **LUX** : `rack.hidden = true` ne cache pas le râtelier (la règle `.weapon-rack { display:grid }` l'emporte sur l'attribut `hidden`) : la forge apparaît sous le râtelier, hors de l'écran. Même chose probablement pour `grid.hidden`. Le choix d'un fond « scène 3D floutée » pour les menus rendrait visible la répétition générale (~0,7 s, une fois) : à décider ensemble.
- **LMAP2** : la répétition générale passe par `window.__mapTest(mapId)` ; si ce hook disparaît, la répétition ne se fait plus (sans erreur) et l'entrée dans le match reprend ~1 à 2,7 s sous le rideau. Garder le groupe de la map comme enfant direct de la scène et ne pas `dispose()` les matériaux au déchargement.
- **LPERF** : `renderer.debug.checkShaderErrors = false` en démo accélère la compilation (recommandation three.js, non mesuré ici) ; en match, cette machine chargée tourne à 60-150 ms par image (bloom + MSAA 4× HalfFloat + ombres).
- **Titouan (audio)** : précharger les barks par des `fetch` n'apporte rien en local (serveur de dev en `Cache-Control: no-cache`, disque local) ; le vrai gain serait de décoder à l'avance les barks des persos choisis dans `barks.ts` (`bufferCache`), par exemple une fonction `preloadBarkRole(role)` appelée après le choix des persos.

## 6. Pas fait, et pourquoi
- Écran-titre au premier chargement (bundle, polices) : `index.html` et les polices ne sont pas dans mes chemins ; en démo la page est chargée avant de commencer.
- Précharger les barks : voir ci-dessus (aucun gain mesurable en local).
- Envoi explicite des textures au GPU pendant les menus (`renderer.initTexture`) : essayé puis retiré, chaque envoi figeait le menu 150 à 450 ms.
- Mini-jeu pendant les attentes : les attentes restantes durent ~1 s.
- Photo d'une personne (`scanFighter`) : toujours un seul appel qui attend le visage (~15 s) ; à découper en deux (attributs d'abord, visage ensuite) si le temps le permet.
