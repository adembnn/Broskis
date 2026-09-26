# Lot LVERIF · Le parcours de démo complet, prouvé image par image (aucune supposition)
Exécution : **Gemini CLI** (délégué par la session Claude « Map design »). Durée max : 35 min.
Adem (15h55) : « on n'a pas une vraie démo qui fonctionne ». Un premier passage (reports/playtesteur-15h56.md) a rendu des suppositions (« théoriquement », « simulés ») sans captures : **refusé**. Ici, chaque affirmation doit être prouvée par une capture ou une sortie console.

## À faire
1. Lance ton propre Vite depuis ta copie (`node node_modules/vite/bin/vite.js --port 5310 --strictPort`, jonction `node_modules` vers le dépôt principal si besoin). Chromium par Playwright avec `--use-angle=d3d11 --ignore-gpu-blocklist`, fenêtre 1600×900. Écris le script dans `tools/verif/parcours.mjs` (réutilisable par tout le monde) : il enregistre aussi une vidéo (`recordVideo`).
2. Joue le parcours **comme un humain** (clics et touches clavier réels — `page.click`, `page.keyboard` — et PAS seulement des hooks), en lisant `demo/SCRIPT.md` et `plan/PIVOT-TEMPS-REEL.md` :
   écran-titre → PLAY → armes (import d'une photo de `public/test/` ou `public/demo-cache/` par le vrai bouton d'import/webcam) → combattant (photo) → choix de map → READY/GO → combat en écran scindé 60 s au clavier (P1 ZQSD/ESPACE/F/G, P2 flèches/MAJ droite/L/K, les deux à la fois) → au moins une perte de vie → GAME! → écran de fin → revanche.
   Refais-le une 2e fois avec `?demo=1`, puis une 3e fois avec « vs AI » si le bouton existe.
3. À **chaque** étape : capture `captures/verif/<n>-<etape>.png`, erreurs console, `window.gameState` résumé (phase, pct, stocks, mapId). Si une étape bloque, essaie le hook correspondant (`window.gameHooks`) pour continuer et note-le.
4. Ne corrige RIEN dans `src/` (d'autres lots y travaillent). Seuls fichiers écrits : `tools/verif/parcours.mjs` et ton rendu.

## Rendu (`plan/rendus/LVERIF.md`, commité)
- Tableau étape × (OK / BLOQUANT / MOCHE) avec le chemin de la capture qui le prouve et l'erreur console exacte.
- Les 10 problèmes les plus graves, classés, chacun avec : reproduction exacte (touches/clics), capture, fichier suspect (grep à l'appui), propriétaire probable d'après `plan/SUIVI.md` (lot en cours qui possède ce fichier).
- Temps mesurés : photo → arme, photo → combattant, clic PLAY → GO!, i/s moyen pendant le combat scindé.
- Chemin de la vidéo du parcours.
