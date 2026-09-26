# Lot LPERF · Fluidité : 60 i/s, zéro latence, zéro accroc
Exécution : **agent Claude (Opus)** · Retour d'Adem (14h20, en jouant) : « de gros problèmes d'optimisation », « que tout fonctionne bien, sans latence, sans bug ».

## Méthode : mesurer d'abord, puis corriger par ordre de gain
1. **Mesure réelle, avec GPU**. Playwright en mode sans fenêtre utilise SwiftShader (rendu logiciel), dont les i/s ne veulent rien dire. Lance Chromium **avec fenêtre et GPU** : `chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })`, en 1920×1080, `deviceScaleFactor` égal à celui de la machine. Mesure sur les 3 maps, pendant 20 s de match, avec des tirs :
   - i/s moyen et 1 % le plus lent, temps de frame, tâches longues (`PerformanceObserver('longtask')`) ;
   - `renderer.info` : appels de dessin, triangles, textures, programmes ;
   - mémoire JS, taille et temps de chargement réseau (modèles GLB, voix, textures) ;
   - temps entre PLAY et le premier tour jouable ;
   - latence des appels `/api/*` (scan, sticker, commentaire, TTS) et ce qui **bloque l'écran** pendant qu'on les attend.
2. **Suspects à vérifier** :
   - ratio de pixels non plafonné (le plafonner à 1,5) ;
   - ombres (taille de carte, nombre de lumières qui en projettent) ;
   - passes de post-traitement ;
   - `traverse()` ou allocations (`new Vector3`…) à chaque frame ;
   - tri de l'ordre de rendu vinyle à chaque frame ;
   - HUD qui réécrit le DOM à chaque frame (mises en page forcées) ;
   - décodage meshopt ou compilation des shaders au lancement du match (précompiler avec `renderer.compileAsync` pendant les menus) ;
   - **les 252 voix préchargées d'un coup** (à charger à la demande, avec un petit cache) ;
   - pas de physique Rapier trop nombreux.
3. **Build de production pour la démo** : le serveur de développement (modules non groupés) est lent. Fais marcher les fonctions `/api/*` aussi sous `vite preview` (`configurePreviewServer` dans le plugin de `vite.config.ts`), ajoute un script `npm run demo` (`vite build && vite preview --port 4173`) et découpe le gros paquet JS : three.js à part, écrans chargés à la demande.

## Tes chemins
- **Libres** : `src/core/**` (boucle, contexte, rendu), `src/main.ts`, `vite.config.ts`, `package.json` (scripts seulement), `tools/perf/**` (nouveau : ton banc de mesure réutilisable, `npm run perf`).
- **Partout ailleurs, corrections chirurgicales seulement** (quelques lignes, commentées « perf : … », un commit par correction). D'autres agents réécrivent en parallèle `src/ui/**` (LUX), `src/gameplay/**` (LSMASH), `src/scene/maps/**` (LMAP2), `src/scene/render/**` (LDA2), `src/scene/camera/**` (LFIX2), `src/scene/fx/smash/**` (LSMASH-FX), et Titouan `src/audio/**` (LVOX). Pour ce qui demande plus qu'une retouche dans leurs fichiers, écris la recommandation précise (fichier:ligne, correctif, gain mesuré) dans ton rendu : la session principale la transmettra.

## Contrôles
- `npm run build` passe ; `npm run demo` sert le jeu **avec** les API.
- Tableau avant / après dans ton rendu : i/s moyen et 1 % bas par map, appels de dessin, temps de chargement, tâches longues.
- Objectif : 60 i/s stables en 1080p sur le PC d'Adem ; aucune frame au-delà de 50 ms pendant un match ; premier tour jouable moins de 4 s après avoir choisi la map.
