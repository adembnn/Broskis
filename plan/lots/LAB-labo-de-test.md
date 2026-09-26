# Lot LAB · Le labo de test : Adem et Titouan testent chaque mécanique en 1 clic
Exécution : **Gemini** · Urgent : Adem et Titouan jouent **maintenant** et veulent tester « comme Claude teste ».

## Ce que voit le joueur
`http://localhost:5173/?lab=1` : le jeu normal, plus un **panneau latéral repliable** (touche `L`), style « Vinyle » sobre, en anglais. Groupes de boutons :
- **Quick match** : choix de la map (Archipel, Galion, Kitchen), des 2 persos (4 KayKit), des 3 armes de chaque joueur (les 8 préréglages de `public/assets/presets/presets.json`), case **vs AI** + difficulté. Bouton **START** : saute tous les menus (`gameHooks.startMatch({...})`) et efface l'écran-titre.
- **Actions** : tir automatique du joueur actif vers l'adversaire (arme 1, 2 ou 3), parade PERFECT, GOOD ou MISS du défenseur, saut, passer la caméra.
- **Événements** : faire tomber la Caisse Snap, lancer l'événement de map, passer en mort subite, mettre un joueur à 10 PV (ou au % maximum), éjecter P1 ou P2, faire gagner P1.
- **Réglages en direct** (curseurs) : ralenti global (×0,25 à ×1), distance et hauteur de caméra, `DAMAGE_PER_POWER`, fenêtre de parade. Les valeurs s'appliquent tout de suite et un bouton **Copy values** copie le JSON pour les donner à Claude.
- **Voix** : liste déroulante rôle + événement, et un bouton qui joue le bark.
- **État** : phase, tour, joueur actif, PV/% et positions, mis à jour en direct. Plus les 5 dernières erreurs console, en rouge.

## Tes chemins
- `src/dev/lab.ts` (nouveau, **installé seulement si `?lab=1`**), `src/dev/lab.css` si besoin.
- `src/main.ts` : une ligne pour l'installer.
- Tu peux **lire** tout le code, mais n'appelle que les API existantes : `window.gameHooks` (voir `src/core/types.ts`), le bus (`ctx.bus.emit`), les constantes exportées de `src/gameplay/tuning.ts` et `src/scene/localTokens.ts` (modifie-les à chaud en mémoire, jamais dans les fichiers), et `playBark` de `src/audio/barks.ts`.
- Si un hook manque pour un bouton, ajoute-le dans `src/gameplay/hooks.ts` (quelques lignes). D'autres agents modifient la caméra, le rendu, les maps et les règles en parallèle : reste minimal hors de `src/dev/`.

## Contrôles
- `npm run build` passe ; le jeu sans `?lab=1` est strictement inchangé.
- Test Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin) : chaque bouton, cliqué un par un, ne lève aucune erreur console. Une capture du panneau par map dans `captures/lab/`.
- Liste dans ton rendu les boutons qui ne font rien (hook absent, etc.).
