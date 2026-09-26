# Lot LLOAD · Personne ne sent les chargements
Exécution : **agent Claude (Opus)** · Demande d'Adem (14h25) : « maximiser l'expérience de l'utilisateur, lui faire ressentir le moins possible les temps de chargement ; regarde ce qui se fait dans la communauté des développeurs de jeux ; l'idée, c'est que personne ne sente les chargements ».

## 1. Recherche (15 min maximum, puis on code)
Techniques éprouvées pour masquer les attentes (jeux vidéo, web, apps d'IA générative) :
- chargement pendant que le joueur choisit : préchargement prédictif des menus, précompilation des shaders ;
- transitions qui cachent le travail : sas, portes, rideau animé ;
- streaming progressif des résultats : texte d'un LLM jeton par jeton, image qui se révèle ;
- interface optimiste, écrans squelettes, seuil de Doherty (400 ms) ;
- lancer les appels IA **de façon spéculative** avant la décision du joueur ;
- astuces et mini-animations interactives pendant l'attente.
Cherche 5 à 8 références concrètes (articles, conférences GDC, exemples de jeux) et note-les dans ton rendu avec leurs liens.

## 2. Les attentes actuelles de Broskis (à mesurer, puis à supprimer une à une)
- Premier affichage et écran-titre : bundle JS, polices.
- Chargement des modèles GLB : persos, packs de maps, décodage meshopt ; compilation des shaders au premier rendu d'une map.
- **Scan d'un objet** : Gemini 3.8 Flash pour les stats (≈ 2 s), Nano Banana Pro pour le sticker (≈ 15 s).
- Scan d'une photo de personne : Gemini + visage sticker.
- Présentation des armes : répliques Gemini 3.1 Pro (12 à 33 s) + voix TTS.
- Voix : 252 fichiers de barks.
- Clonage de voix (LW2) : clone Gradium + 8 répliques.
- Entrée dans le match après le choix de la map.

## 3. À livrer
- **`src/core/preload.ts`** : orchestrateur de préchargement **pendant les menus**, par priorité et sans jamais bloquer l'interface :
  - dès l'écran-titre : les 4 persos, la map la plus probable ;
  - au choix de la map, ou dès son survol : cette map, puis compilation de ses shaders (`renderer.compileAsync`) ;
  - voix : seulement les barks des persos choisis, chargés en tâche de fond après leur sélection.
  - Expose l'état du préchargement (pour que l'interface sache ce qui est prêt).
- **Appels IA spéculatifs** (`src/ia/**`) :
  - le sticker d'une arme part **dès la photo prise**, en parallèle des stats (déjà en parallèle ? vérifie) ;
  - les répliques de l'animateur pour la présentation partent **dès qu'une arme est connue**, pas à la fin de l'arsenal ;
  - le clonage de voix part dès la fin de l'enregistrement.
  - Rien ne doit attendre la fin d'un écran pour démarrer.
- **`src/ui/loading/**`** (nouveau, composants réutilisables, style Vinyle) :
  - calque de transition animé plein écran (rideau ou volet aux couleurs P1/P2, logo BROSKIS) qui couvre les derniers chargements entre la map et « READY? » ;
  - animation « forge » pour une arme en cours de génération (étincelles, silhouette qui se précise, révélation du sticker) ;
  - révélation progressive des stats et du texte en streaming (effet machine à écrire, synchronisé à l'arrivée réelle des données) ;
  - rotation d'astuces de jeu en anglais.
  Le lot **LUX** (agent en parallèle) refait les écrans dans `src/ui/**` : tu fournis ces composants avec une API simple, documentée en tête de fichier, et tu les branches **toi-même** aux 3 endroits critiques : transition vers le match, forge du scan, présentation des armes. Pour chacun de ces branchements, fais une modification minimale dans les fichiers d'écran, et signale-la dans ton rendu.
- **Streaming Gemini** : pour les répliques de l'animateur et la description d'une arme, utilise l'API de streaming (`generateContentStream` côté serveur, flux SSE ou lignes JSON vers le navigateur) pour que le texte apparaisse au fil de l'eau, là où c'est pertinent.

## Tes chemins
`src/core/preload.ts` (nouveau), `src/ui/loading/**` (nouveau), `src/ia/**`, `api/**` (streaming), branchements minimaux dans les écrans de `src/ui/`. **Pas** `src/gameplay/**`, `src/scene/**` (sauf un appel à `compileAsync` via le contexte), ni `src/audio/**` (Titouan).

## Contrôles
- `npm run build` passe.
- Mesure avant / après (Playwright avec fenêtre et GPU, port 5300-5399, garde le PID) : temps pendant lequel le joueur **voit une attente sans rien qui bouge ni qui progresse**. Objectif : **0 s**. Temps entre le choix de la map et « READY? » : objectif moins de 1,5 s perçue.
- Captures ou vidéo `captures/lload/` de la forge et de la transition.
