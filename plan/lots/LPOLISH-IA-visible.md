# Lot LPOLISH · Rendre l'IA visible à 4 moments du script de démo (finitions, pas de nouvelle mécanique)
Exécution : **Gemini CLI** (délégué par la session Claude « Map design », accord d'Adem 16h24). **Fini et commité à 17h30.**
Référence : `demo/SCRIPT.md` (lignes marquées « idée »), `plan/PIVOT-TEMPS-REEL.md`, `CLAUDE.md` (règles 4 « tokens » et 9 « chaque vue reste sur son joueur »). Tout texte du jeu en ANGLAIS.

## Les 4 finitions (dans cet ordre, chacune petite et isolée)
1. **Nom de l'objet réel dans le HUD** : sur chaque carte d'arme du HUD de match (P1 et P2), sous le sticker, afficher « Blaster · Rubber Duck » (catégorie + `weapon.object`, le nom de l'objet photographié). Texte court, tronqué proprement avec « … », jamais coupé par le bas de l'écran. Fichiers probables : `src/ui/hud.ts`, `src/ui/weaponCard.ts`, styles dans `src/ui/stylesLux.ts` (valeurs dans les tokens).
2. **« PERFECT! » crié par l'animateur** en même temps que le texte PERFECT! à l'écran, sur `parry:result` avec `grade === 'perfect'` : une réplique de la banque de voix existante (`src/audio/barks.ts`, `public/assets/voices/`) si une réplique « perfect » existe, sinon la voix TTS de l'animateur déjà utilisée (`src/ia/commentary.ts` / `voice:line`). Latence ≤ 150 ms après l'événement (préchargée). Ne doit jamais se superposer à une autre réplique de l'animateur (le lecteur unique LVOX gère l'exclusivité : respecte-le).
3. **KO qui nomme l'objet** : sur `stock:lost` (ou `ko`), l'animateur dit « Knocked out by… a rubber duck! » avec le nom de l'objet de l'arme qui a porté le dernier coup (garde le dernier `hit` reçu par la victime : `weapon.object`). Texte affiché aussi en sous-titre (même mécanisme que les autres répliques). Si le nom manque, réplique générique existante.
4. **Écran de fin** (`src/ui/endscreen.ts`) : miniatures des 2 objets du vainqueur (stickers `weapon.stickerUrl`, sinon icône de catégorie) avec leur nom, à côté du portrait du vainqueur. Réutilise `src/ui/sticker2d.ts` / `weaponCard.ts`.

## Règles
- Aucune nouvelle mécanique de jeu, aucun changement dans `src/gameplay/**`, `src/scene/**`, `src/core/**` (sauf lecture). Changements minimaux dans `src/ui/**` (l'agent LUX de l'autre session y travaille) et `src/audio/**` / `src/ia/**`.
- **Tester uniquement la dernière version** (règle d'Adem) : `git rebase main` au début ET juste avant le commit final ; ton propre Vite sur un port 5330-5339 ; match lancé par `gameHooks.startMatch({ split: true })`, vérifier `gameState.phase === 'fight'` ; armes scannées par `gameHooks.scanObjectFromUrl('/demo-cache/objects/<fichier existant>')` — **liste d'abord `public/demo-cache/objects/` et `public/test/` et n'utilise QUE des fichiers qui existent** (jamais une chaîne inventée). Déclenche PERFECT via `gameHooks.input(p,'parry',true)` au bon moment ou en émettant `parry:result` par `window.ctx.bus.emit` pour le test ; le KO via F4 / `forcerVictoire`.
- Preuve : une capture par finition (`captures/lpolish/1-hud.png`, `2-perfect.png`, `3-ko.png`, `4-fin.png`) regardée, plus la ligne de console qui montre la réplique jouée. `npm run build` passe. Arrête ton Vite (ton PID seulement) à la fin.

## Rendu (`plan/rendus/LPOLISH.md`, commité)
Fait / pas fait par finition, fichiers touchés, chemins des captures, latence mesurée pour PERFECT.
