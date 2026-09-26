NOTE : 3/10 · VERDICT : REFUSÉ · GPU : nvidia
MESURES par map :
- archipel : i/s moyen 76.1 · 1 % bas 13.6 · pire image 201 ms (phase: fight) · tâches longues : 6 · appels dessin (total frame) : 143 · shaders en combat : 9 · tas JS : 38 Mo
- galion : i/s moyen 49.0 · 1 % bas 6.1 · pire image 875 ms (phase: fight) · tâches longues : 7 · appels dessin (total frame) : 153 · shaders en combat : 3 · tas JS : 42 Mo
- cuisine : i/s moyen 43.7 · 1 % bas 3.8 · pire image 791 ms (phase: fight) · tâches longues : 30 · appels dessin (total frame) : 139 · shaders en combat : 111 · tas JS : 46 Mo

CORRECTIONS (max 5, classées par gain estimé en ms/image) :
- `src/core/shaders.ts` → Cause mesurée : 174 à 194 ms de gel sur Cuisine en combat (et 154 ms sur Archipel) pour compiler les shaders des projectiles/FX (`ketchup`, etc.), car ils ne sont pas dans `scene` lors du préchauffage initial. → Correction : Insérer les pools de particules/projectiles (`ctx.pool`) temporairement dans la scène avant l'appel à `renderer.compileAsync` dans `installShaderWarmup`. → Gain attendu : -194 ms sur la pire image au 1er tir.
- `src/ui/help.ts` → Cause mesurée : Blocage du thread principal (ex. 144 ms dans `ui-controls-shrink`) au moment où les contrôles se réduisent. `mode.set(false)` appelle `render()` qui recrée intégralement le DOM via `replaceChildren(...)`. → Correction : Ne mettre à jour que les classes CSS (ex. `root.classList.toggle('big')`) et utiliser `textContent`, sans détruire/recréer les éléments DOM en plein combat. → Gain attendu : -144 ms sur la pire image.
- `src/gameplay/**` & `src/scene/fx/**` → Cause mesurée : Pics de GC provoquant 369 images > 33 ms sur Cuisine et 326 sur Galion, avec des tâches longues allant jusqu'à 875 ms sans compilation de shaders associée. → Correction : Supprimer toute instanciation `new THREE.Vector3()` dans la boucle de rendu/physique et utiliser des `scratch vectors` recyclés au niveau du module ou des pools préalloués. → Gain attendu : Disparition du « stutter » régulier, 1% low considérablement remonté.
- `src/scene/maps/engine.ts` → Cause mesurée : Cuisine a 99 programmes shaders (!), ce qui rend le système `render` très coûteux (5.7 ms moyen par frame, max 524 ms). → Correction : Partager les matériaux `MeshStandardMaterial` entre les mêmes objets de décor et regrouper les géométries statiques avec `InstancedMesh`. → Gain attendu : +20-30 i/s moyen et respect du budget des 120 appels de dessin.
- `assets/textures` → Cause mesurée : 5,5 s pour atteindre le 1er tour jouable sur Cuisine (> 4 s). → Correction : Convertir les lourdes textures PNG de l'environnement (restaurant) et des objets scannés en format compressé KTX2/Basis. → Gain attendu : Temps de chargement (1er tour jouable) réduit de 2 secondes.

À NE PAS CASSER :
- Post-traitement centralisé : L'implémentation de `ViewsPass` dans `src/scene/render/postfx.ts` respecte bien la règle du passe unique (un seul `UnrealBloomPass` après avoir composé les vues) qui économise ~20 ms/image.
- Rendu en écran scindé via `setViewport`/`setScissor` (PIVOT temps réel).
- Le compte des shaders à l'exécution reste crucial ; les corriger évitera un désastre devant le jury.
