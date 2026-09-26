# Lot LUX · Interface et parcours pour un joueur occasionnel
Exécution : **agent Claude (Opus, design UI/UX)** · Priorité 1 · Retours d'Adem et Titouan (14h) : « si on ne connaît pas le jeu, on ne peut pas jouer », « on ne sait pas sur quelle touche cliquer », « on ne comprend pas quelles attaques on peut lancer », « il faut épurer », « écrans de chargement avec un fond », « quand on génère les armes, voir le visuel de chaque arme qui se charge en direct ».

## Public
Joueur **occasionnel**, qui ne connaît ni le jeu ni ses fonctions. Il doit réussir son premier tir en moins de 20 s, sans explication orale. Références : **Super Smash Bros. Ultimate** (HUD des %, écrans de sélection, « READY? GO! », « GAME! ») et **Brawlhalla** (lisibilité). En anglais, sobre, lisible sur un projecteur.

## À livrer
1. **HUD façon Smash** (réécris `src/ui/hud.ts`) :
   - en bas de l'écran, un encart par joueur : portrait, nom, **% énorme** (blanc → jaune → orange → rouge selon le %, secousse et « pop » à chaque coup), pastilles de vies (`stocks`) ;
   - **plus de barres de PV** ;
   - le joueur actif est clairement mis en avant (couleur P1 rouge / P2 bleu, flèche au-dessus de son perso dans la scène : projette sa position 3D en 2D).
2. **Barre d'armes** du joueur actif, centrée en bas : 3 cartes avec **le sticker de l'arme**, son nom, sa catégorie en icône et en mot (BLASTER, GRENADE, THROWABLE, SHIELD), et la touche `1`, `2` ou `3`. Une arme en recharge est **grisée** avec « READY IN 1 TURN ». L'arme choisie est en avant.
3. **Aide contextuelle permanente** (bas de l'écran, au-dessus des armes), qui change avec la phase ; touches dessinées comme des touches de clavier :
   - déplacement : `WASD` Move · `SPACE` Jump (×2) · anneau « 6 m » ;
   - visée : `1` `2` `3` Weapon · Hold `CLICK` or `F` to charge · Release to FIRE ;
   - défense : « P2: press `ENTER` when the ring closes! » (ou `SPACE` pour P1), en très grand, synchronisé avec l'anneau de parade de LK2 ;
   - au bord : « EDGE! » en rouge (événement `teeter`) ;
   - accroché au bord : « Your turn: climb back up! ».
4. **Premier match = tutoriel intégré** (seulement la première fois, mémorisé dans `localStorage` avec try/catch) : 3 bulles guidées au premier tour (« Move with WASD », « Pick a weapon with 1 », « Hold CLICK and release to FIRE »), puis à la première parade (« Your turn to defend: press ENTER when the ring closes! »). Toujours avec un bouton **Skip**.
5. **Bandeaux de match** (événement `match:banner`) : « READY? » puis « GO! » en géant, et « GAME! » en fin de match avec ralenti. Écran de fin : gagnant en grand, % et éjections de chacun, boutons REMATCH et MENU.
6. **Écrans épurés avec un fond** : titre, choix des persos, arsenal, choix de la map.
   - Un **fond** sur chaque écran : scène 3D floutée de la map, ou dégradé + motif ; pas un aplat beige.
   - Un seul appel à l'action par écran, les options avancées repliées.
   - Choix des persos en **grille de portraits** façon Smash, avec les jetons P1/P2.
   - Choix de la map en grandes vignettes avec aperçu. Faute de captures, fabrique les vignettes au premier chargement : rendu hors écran de chaque map avec three.js, ou images de `captures/` copiées dans `public/`.
7. **Écrans de chargement et génération en direct** (« streamé ») :
   - Pendant le scan d'un objet ou d'une photo, et pendant la génération des armes (stats Gemini, puis sticker Nano Banana), montre **chaque étape en direct** : photo capturée → « Gemini is reading your object… » → la carte de l'arme se remplit (nom, catégorie, stats qui s'animent) dès que le JSON arrive → le **sticker apparaît** dès que l'image arrive (fondu + effet « forge »).
   - Plusieurs armes en parallèle = plusieurs cartes qui se remplissent chacune de leur côté.
   - Barre de progression honnête (étapes réelles, jamais une fausse barre).
   - Lis `src/ia/**` pour les promesses et événements existants (`scan:start`, `scan:result`…). S'il manque un signal d'étape, ajoute un événement minimal (ex. `scan:progress { player, step, data? }`) dans `src/core/events.ts` et émets-le dans `src/ia/`, sans changer la logique.
   - Pendant le chargement des modèles 3D : fond + logo BROSKIS + une astuce de jeu (« Higher % = you fly further! »).
8. **Parcours** : PLAY → choix des 2 persos → arsenal (3 armes chacun, préréglées ou scannées) → présentation des armes (l'animateur Fenrir les présente, la carte de chaque arme en grand) → map → READY? GO!.

## Tes chemins
`src/ui/**` (tout), `src/style.css`, un ajout minimal d'événement dans `src/core/events.ts` et `src/ia/**` pour la progression. **Pas** les règles (`src/gameplay/**` : lot LSMASH en parallèle, qui émet `teeter`, `stock:lost`, `respawn`, `ledge:grab`, `match:banner`, et remplit `pct` / `stocks`), **pas** la caméra ni le rendu 3D. Le lot LW2 (bouton « USE MY VOICE » dans `screenFighters.ts`) et le lot LX (bouton vs AI + difficultés dans `screenTitle.ts`) sont déjà fusionnés : **garde leurs fonctions** en redessinant.

## Contrôles
- `npm run build` passe.
- Test Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin) : un **nouveau joueur** fait tout le parcours et son premier tir **sans lire de code**, en suivant uniquement les aides à l'écran. Captures de chaque écran dans `captures/lux/`.
- Aucun texte coupé ni superposé à 1280×720 et 1920×1080.
- Relis les captures toi-même comme un directeur artistique exigeant : épuré ? lisible de loin ? on sait quoi faire ? Corrige avant de rendre.
