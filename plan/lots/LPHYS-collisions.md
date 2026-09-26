# Lot LPHYS · Physique et collisions irréprochables sur les 3 maps (prouvé)
Exécution : **Gemini CLI** (délégué par la session Claude « Map design »), lancé à 16h55, **après la fusion de LMAP3** (arènes agrandies, main 22eef86). **Fini et commité à 17h40.** Captures RÉELLES obligatoires (jamais « simulées »). Durée max : 40 min.
Retour d'Adem (16h05) : « les collisions ne sont pas bien faites ; dans la cuisine, des plateformes sur le plan de travail sont translucides et on ne peut pas monter dessus ; il faut vraiment que la physique fonctionne ; s'il y a une plateforme, ça doit marcher ».

## À faire
1. **Vue de débogage des colliders** : ajoute un hook `window.gameHooks.debugColliders(on: boolean)` (dans `src/gameplay/` ou `src/core/`, fichier nouveau de préférence : `src/gameplay/debug-colliders.ts`) qui dessine en fil de fer chaque collider Rapier (couleur par type : sol, plateforme one-way, couvert, accessoire déclenchable, joueur). Coût nul quand il est éteint.
2. **Audit par map** (Playwright, ton propre Vite port 5320-5329, Chromium `--use-angle=d3d11 --ignore-gpu-blocklist`) : pour archipel, galion, cuisine, capture vue large + vues d'épaule avec colliders affichés. Liste chaque objet visible et son collider : absent (on traverse un objet qui a l'air solide), en trop (mur invisible), décalé ou mal dimensionné (> 15 cm d'écart).
3. **Tests scriptés** (`tools/verif/physique.mjs`, via `window.gameHooks.input` et `window.gameState`) :
   - chaque plateforme : double saut depuis le dessous → le perso est DEBOUT dessus (pos.y ≈ topY) pendant 2 s ; saut depuis le côté → atterrit dessus ;
   - chaque couvert : bloque un joueur qui court dedans et bloque un projectile de blaster ;
   - bords : un perso qui marche vers le vide tombe (aucun mur invisible), l'accroche au bord fonctionne ;
   - accessoires déclenchables (grille-pain tremplin, rouleau, tonneaux, canon) : réagissent quand on les touche ;
   - aucune plateforme, aucun sol, aucun couvert ne devient translucide (lis `src/scene/camera/occlusion.ts` : le fondu mute `material.opacity` ; vérifie qu'aucun matériau n'est partagé entre un objet fondu et une plateforme ou le sol).
4. **Corrige** ce qui échoue, par ordre de gravité, en changeant le moins possible : colliders dans `src/scene/maps/*.ts` (données), `src/scene/maps/engine.ts` (construction des colliders), `src/scene/camera/occlusion.ts` (seulement pour la translucidité). Pas d'autres fichiers sans le signaler. Relance les tests jusqu'au vert.

## Bugs déjà vus (16h55, main 22eef86)
- **Réapparition superposée** : si les 2 joueurs tombent à peu près en même temps, ils réapparaissent au MÊME point (`MapDef.respawn` est un seul point, voir `src/scene/maps/*.ts` et qui appelle `respawn` dans `src/gameplay/**`) → ils sont l'un dans l'autre. Corrige au plus simple : 2 points de réapparition décalés de ±3 m (un par joueur) exposés par l'API des maps, ou décalage du 2e si le 1er est occupé.
- Tester uniquement la dernière version : `git rebase main` au début et avant le commit final ; `startMatch({ map, split: true })`, `phase === 'fight'`.

## Rendu (`plan/rendus/LPHYS.md`, commité)
Tableau map × objet (visuel / collider / verdict), résultats des tests avant/après, chemins des captures (avec colliders affichés), commits.
