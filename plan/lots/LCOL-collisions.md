# Lot LCOL · Collisions : voir, compléter, fiabiliser (recherche du 26/09, 14h30–15h)
Exécution : **à attribuer** (idéalement l'agent de LMAP2, qui possède déjà `src/scene/maps/**` et les colliders
Rapier ; la partie bord/marche touche `src/gameplay/character.ts`, lot LSMASH) · Priorité 1 · Demande d'Adem :
« le bateau n'est pas du tout assez grand », « les collisions, c'est ultra important », « utiliser Blender ».

## État réel (audit du code, preuves fichier:ligne dans le rendu de l'agent)
- Rapier est branché : persos = capsule + `KinematicCharacterController` (`character.ts:31-59`), décor = boîtes et
  cylindres posés à la main (`maps/engine.ts:254-268`), projectiles = rayons Rapier (`trajectory.ts`).
- **Galion** : la coque GLB n'a **aucun** collider (`galion.ts:88`) ; seule une boîte « deck » sert de sol :
  **5,3 × 14,3 m** (`deckHalf`, `galion.ts:19`), loin des 16–20 m de LMAP2. Mesure Blender du vrai pont :
  plan principal à y = 2,10 (le code suppose 1,8), **en escalier sur 3 paliers** (≈ 2,1 / 2,8 / 3,5), soit
  5,5 × 9,8 m après `shipScale` 1,15 → la boîte actuelle couvre la coque entière, pas le pont.
- **On ne peut pas tomber en marchant** : `applyMove` bloque tout pas vers le vide (`isVoidAhead`,
  `character.ts:67-72,90`) → effet « mur invisible », contraire au test LMAP2.
- **Aucune collision caméra ↔ décor** (seulement un fondu de transparence, `camera/occlusion.ts`).
- Perso ↔ perso : comportement par défaut de Rapier, jamais réglé ni testé.
- Échelles incohérentes : pont du galion trop petit, comptoirs de la cuisine ≈ 42 m, îles de l'archipel
  espacées de 18 m (cible 9–10 m entre apparitions).
- Aucun GLB des packs ne contient de mesh de collision : tout est à faire à la main ou par script.

## Plan retenu (1 h 30, dans cet ordre)
1. **Voir les colliders (10 min)** : `RapierHelper` (`three/addons/helpers/RapierHelper.js`, un `LineSegments`
   mis à jour par image depuis `world.debugRender()`) derrière `?debug=1` uniquement (jamais en `?demo=1`).
   Capture `node tools/capture.mjs` avec et sans.
2. **Galion (30 min)** : agrandir le pont (échelle du bateau et/ou `PIRATE.platformPlanks`, jamais utilisé dans
   `galion.ts`) puis coque = **plusieurs boîtes sur un même corps fixe** (compound Rapier : 6 à 10
   cuboid/cylinder calés sur le rendu debug, un par palier du pont + mât). Pas de trimesh dynamique.
3. **Bords (15 min)** : retirer le blocage `isVoidAhead` (ou le limiter à un avertissement `teeter`), garder
   `enableSnapToGround` court (0,3 m) : on peut tomber en marchant, comme dans Smash.
4. **Plateformes traversables (15 min)** : `controller.computeColliderMovement(collider, move, undefined,
   undefined, filterPredicate)` — ignorer un collider marqué `userData.oneWay` si les pieds sont sous son dessus
   ou si la vitesse verticale est positive. Déjà dans la version de Rapier installée.
5. **Caméra (15 min)** : rayon cible → caméra contre le décor ; si touché, rapprocher la caméra (plus de caméra
   dans un mur). `three-mesh-bvh` en option si c'est lent.
6. **Contrôle (5 min)** : `npm run verifier`, captures debug ON/OFF, un perso poussé hors du plateau tombe.

## Blender : deux usages, les deux marchent
- **Sans écran, dans le conteneur cloud** (vérifié) : `pip install --user bpy` (Blender 4.2 LTS, 856 Mo).
  `tools/collisions/make_colliders.py` génère un proxy par mesh (`<nom>-col`, extras `collider = box | hull`,
  < 64 sommets), isole le pont du bateau et exporte un GLB en 0,6 s. Pré-passe obligatoire :
  `node tools/collisions/decompress_glb.cjs in.glb out.glb` (les GLB du jeu utilisent meshopt/webp, que le
  Blender pip ne lit pas). Vérification : `node tools/collisions/verify_extras.mjs <glb>`.
  Pièges : ne jamais appeler `bpy.ops.wm.read_factory_settings()` (plantage « InitGoogleLogging twice ») ;
  finir le script par `os._exit(0)` (plantage à la fermeture sinon).
- **MCP Blender sur le PC d'Adem** : même Python, mais avec l'œil humain. Le bon usage aujourd'hui : caler les
  boîtes de la coque du galion à l'œil, exporter les proxies `_col` en GLB. Non bloquant pour le plan ci-dessus.

## À éviter avant le gel
Décomposition convexe (CoACD : 44 s et 56 morceaux pour la coque, trop fin), extensions glTF physiques
(`KHR_physics_rigid_bodies` non ratifiée, `OMI_physics_*` + `three-omi` trop longs à apprendre), trimesh sur
un corps qui bouge, `debugRender` actif par défaut, Blender de bureau comme chemin critique.

## Sources
Rapier : colliders, contrôleur de personnage, filtrage, debug render (rapier.rs/docs/user_guides/javascript/*) ·
three.js `RapierHelper` · three-mesh-bvh (github.com/gkjohnson/three-mesh-bvh) · blender-mcp
(github.com/ahujasid/blender-mcp) · CoACD (github.com/SarahWeiii/CoACD) · OMI_physics_body (omigroup/gltf-extensions).
