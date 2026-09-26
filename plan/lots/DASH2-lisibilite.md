# Lot DASH2 · Tableau de bord lisible par un humain
Exécution : **Gemini** · Dépend de : DASH (fusionné)

## Constat
Sur http://localhost:4545, la colonne « Qui travaille en ce moment » affiche le **JSON brut** du flux Gemini CLI. Illisible pour Adem.

## Tes chemins
`tools/dashboard/**` (sauf `log.mjs` et `hook-claude.mjs`).

## À livrer
1. **Traduire le flux `stream-json`** de `dashboard/logs/gem-*.jsonl` en phrases françaises :
   - `tool_use` : `read_file` → « lit `src/x.ts` », `write_file` / `replace` → « modifie `src/x.ts` », `run_shell_command` → « lance `npm run build` » (commande abrégée) ;
   - `update_topic` → le résumé donné par Gemini, qui est la meilleure phrase à afficher ;
   - `result` → « terminé : N appels d'outils, X k jetons, Y min ».
   - Carte par lot : lot, titre (depuis `plan/SUIVI.md` ou l'événement de départ), état, **depuis combien de temps**, 3 dernières phrases, barre d'activité.
2. **Associer** chaque carte à l'événement `en-cours` / `fait` / `echec` du journal. Une carte est terminée quand l'événement de fin est arrivé, et s'estompe alors.
3. **Colonne Claude** : les sous-agents Claude du journal (événements `source: claude`), leur durée et leur état.
4. **Colonne Gradium / générations** : les événements `kind: generation` (voix, images, 3D).
5. **Section « Ce qui vient d'être produit »** :
   - vignettes des dernières captures (`captures/**`) ;
   - stickers (`public/assets/presets/*.jpg`) ;
   - lecteurs audio (`public/assets/voices/**` et `public/assets/presets/*.wav`) ;
   - planches `captures/anim/*-planche.png` et `captures/vedettes/*`.
6. Pas de défilement automatique ; ça reste lisible sur un projecteur.

## Contrôles
Lance le serveur sur un AUTRE port (`PORT=4546 node tools/dashboard/server.mjs`, à ajouter si besoin) pour ne pas couper celui d'Adem. Capture Playwright de la page : `captures/dash2/page.png`.
