# Rendu du lot LFACE · « On s'est pris en photo, on est dans le jeu »
Agent Claude (Opus), 15h20 → 17h10. Branche `worktree-agent-a51705288e23cf3bc` (main fusionnée à 16h40, conflits résolus).

## Mise à jour 17h40 : tête de face ET de dos, en volume, en ~3,5 s (demandes d'Adem de 17h10 et 17h15)
- **Une seule génération, 2 faces** : Nano Banana dessine une planche 16:9, la tête de face à gauche et **la même tête vue de dos** à droite (même coupe, même couleur, oreilles, nuque, branches de lunettes). `decouperPlanche` (src/ia/fighter) la coupe à la colonne la plus vide. Même latence qu'un portrait seul.
- **Tête en volume (vinyle gonflé)** : une lentille bombée, avec la face vers l'avant et le dos (en miroir) vers l'arrière. Le bombé suit la distance au bord de la silhouette (DA-objets-scannes §2, en plus rond). Le contour exact vient de la texture. Le bord blanc du sticker est retiré : le bord de la tête devient le trait d'encre et la couleur des cheveux ou de la peau.
- **Repli** : sans panneau de dos, des mèches peintes à la couleur des cheveux sur la même silhouette, jamais un aplat vide.
- **Portrait tardif (LE2E)** : la planche est découpée avant l'événement. `fighter:portrait` porte `faceUrl` et `backUrl`, posés ensemble sur le même `FighterDef`.
- **Vitesse** : Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) répond sur la clé. Course Lite / Nano Banana 2 / Pro : le 1er portrait valide gagne et les autres appels sont abandonnés. Photo à 512 px. L'écran se débloque à 12 s (sinon tête de secours, puis le vrai visage arrive en jeu). Le module serveur est préchauffé dès le lancement du jeu.
- **Lueur d'équipe gardée** : la teinte de la tenue s'ajoute au shader du lot LLOOK au lieu de le remplacer. Capes rouge / bleue lisibles de dos.

| Mesure (visages fictifs, machine d'Adem chargée) | Valeur |
|---|---|
| 6 scans complets (3 tours de 2 joueurs en parallèle, texte + planche face/dos) | **médiane 3,5 s, pire 4,2 s** (Lite gagne 6 fois sur 6) |
| Texte (nom, stats, couleurs) | médiane 2,3 s |
| Planche Nano Banana 2 (avant la course avec Lite) | 8,5 à 9,7 s |
| Découpe des 2 planches dans le navigateur | 1,4 à 1,7 s pour 2 en parallèle (machine saturée) |

Captures (dépôt principal, `captures/lface/`, ignoré par Git) :
- `volume-split.png` : **les caméras des joueurs en écran scindé**. P1 voit les cheveux roux bouclés de Tom de dos, P2 les cheveux noirs de Jade de dos, chacun voit le visage de l'autre au loin.
- `volume-j1-34dos.png`, `volume-j1-34.png`, `volume-j2-34.png`, `volume-j1-dos.png`, `volume-j1-profil.png` : gros plans.
- `mesure-1-1.jpg` et `mesure-2-2.jpg` : planches face/dos de Nano Banana 2 Lite.

Limites : de profil pur, la lentille reste fine sur les bords (le portrait s'étire sur le bombé). Les expressions de Lite sont moins exagérées que celles de Nano Banana 2.

## Ce que voit le joueur
1. **Snap yourself** : ovale de cadrage sur la webcam (« nothing is saved »), photo recadrée serré sur le visage.
2. La forge tourne **dans son encart** et la main passe tout de suite à l'autre joueur : **les 2 scans avancent en même temps**.
3. Vers **3,5 s** : surnom Gemini (champ modifiable : il tape son prénom), réplique, couleurs de sa tenue.
4. Vers **9 à 11 s** : sa **grosse tête** (×1,9, goofy, tête nue) remplace la forge ; dès que les 2 sont prêts, la **vitrine 3D** montre les 2 persos côte à côte (entrée « cheer », puis repos).
5. En match : grosse tête en carton découpé sur un corps KayKit aux couleurs de sa tenue, **rebond à ressort** en course, saut et coups ; de face pour l'adversaire, dos de crâne couleur cheveux pour soi ; prénom dans le HUD et à l'écran de fin.

## Fait (par fichier)
- **`api/scan-fighter.ts`** : le fichier était **invalide** (gabarits de chaîne échappés), toute photo donnait « Mystery Bro » (réparé aussi en 2 lignes par LSCAN-PERSO ; ma version remplace la sienne).
  - Réponse **en 2 temps** : `part: 'text'` (nom, stats, couleurs) et `part: 'portrait'`, appelés en parallèle. Sans `part` : ancien contrat.
  - Portrait : **Nano Banana 2** (`gemini-3.1-flash-image`) et **Pro** lancés ensemble, le premier portrait valide gagne. Pro seul mettait 16 à 21 s (un scan sur deux dépassait 25 s à 2 joueurs).
  - Consigne (recherche R3 + consigne d'Adem de 16h45) : style d'abord, **ressemblance d'abord** (coupe, couleur de cheveux, teint, barbe, lunettes), **tête nue** (ni chapeau, ni capuche, ni casque), caricature bienveillante très expressive, bord blanc de sticker, fond magenta.
  - Double refus de sécurité : portrait **inventé d'après les traits** (texte seul, sans la photo). Une relance du texte si Gemini répond une erreur.
  - Surnom ≤ 14 caractères, jamais sur le physique ; couleurs validées ; aucun contenu de requête dans les logs.
- **`src/ia/fighter/index.ts`** : `scanFighterReport(image, { onText })` : cache par photo (empreinte), délai 25 s, motif d'échec (`no-face`, `no-portrait`, `blocked`, `timeout`) et message joueur (`SCAN_ISSUE_TEXT`), temps par étape, modèle du portrait. `prechaufferScanFighter()`. `scanFighter(image)` garde sa signature (le hook `scanFighterFromUrl` de LSCAN-PERSO marche tel quel).
- **`src/scene/fighter-custom/index.ts`** :
  - grosse tête ×1,9 découpée dans le portrait (module sticker), posée sur l'os `head` ; tête KayKit, casque, chapeau et capuche **masqués** ;
  - texture sans trous (seul le magenta relié au bord devient transparent : une bouche ouverte reste pleine), blancs ramenés au vinyle de la DA (plus de halo de bloom à contre-jour), auto-éclairage 0,12 ;
  - **dos du crâne et tranche à la couleur des cheveux** (éclaircie si elle est trop sombre), plus de visage en miroir ;
  - **tête à ressort** : tangage, roulis et écrasement amortis, pilotés par les accélérations du cou (course, arrêt, saut, coup), dans sa propre boucle ;
  - **recoloration réparée** : elle patchait aussi les coques de contour, dont le matériau est partagé (l'encre de **tous** les persos changeait de couleur) ; marche sur `MeshStandardMaterial` ; tenue sur buste, bras, jambes ; **couleur d'équipe gardée sur la cape**.
- **`src/scene/fighter-custom/vitrine.ts`** (nouveau) : vitrine 3D des 2 persos, lumières de la map archipel (tokens). Renvoie `null` si le navigateur refuse un contexte WebGL : la grille reste.
- **`src/ui/screenFighters.ts`** (modifications ciblées, structure LUX gardée) : forge dans l'encart, 2 scans en parallèle, nom modifiable, message d'échec + `Retry` / `New photo`, READY attend les portraits, vitrine 3D à la place de la grille (cliquer son encart la fait revenir), jetons P1 et P2 sur la même case, préchauffe du scan.
- **`src/ui/capture.ts`** (option `{ face: true }`, les objets ne changent pas) : ovale + recadrage carré (80 % de la hauteur) : le visage remplit enfin le cadre envoyé à l'IA.
- **Voix (LW2)** : déjà branchée par joueur (`setVoiceOverride` + `BarkPlayer.pickEntry(player)`) ; le bouton « Use my voice » reste sur l'encart du perso photo. Non testée à l'oreille (pas de micro ici).
- **`tools/test-lface.mjs`** : `--visages` (2 selfies de personnes **fictives**, Nano Banana), scan + match, `--parcours` (interface, 2 joueurs), `--webcam` (webcam simulée, y4m d'un visage fictif). `LFACE_GPU=1` : vraie carte graphique.

## Temps mesurés (2 visages fictifs, machine partagée, parfois saturée)
| Étape | Temps |
|---|---|
| Préparation de la photo (client) | 0,3 à 0,7 s |
| Texte Gemini 3.8 Flash (nom, stats, couleurs) | 2,1 à 3,0 s (5 s sous forte charge) |
| Portrait Nano Banana 2 | 8,5 à 11,3 s |
| Portrait Nano Banana Pro seul (avant) | 16,4 à 20,8 s ; un scan sur 2 dépassait 25 s |
| 2 joueurs en parallèle, par l'interface : nom affiché | **3,5 à 3,8 s** |
| 2 joueurs en parallèle : persos complets | **9 à 10,7 s** |
| `startMatch` → 2 grosses têtes en scène | 5,8 s (machine calme) ; 19 s (machine saturée) |
| 1er appel du scan en dev (compilation à froid du module serveur) | **27 à 36 s** : d'où la préchauffe à l'ouverture de l'écran de choix |

## Captures (visages FICTIFS uniquement, `captures/lface/` du dépôt principal, ignoré par Git)
- `planche.png` : photo fictive → portrait généré → en match de face, de 3/4 et de dos, et la vitrine.
- `vitrine.png`, `parcours-2-prets.png` (écran de choix, 2 persos côte à côte), `webcam-ovale.png`, `webcam-envoyee.jpg` (ce que reçoit l'IA), `match-*.png` (gros plans en match), `match-split.png`.

## Confidentialité
Aucune photo réelle : 2 visages inventés par Nano Banana, gardés hors du dépôt. Dans le jeu, photo et portrait restent en mémoire ; les logs serveur ne contiennent que des messages d'erreur.

## Pour fusionner
- Conflits déjà résolus dans la branche : `api/scan-fighter.ts` (ma version), `src/ui/capture.ts` (SNAP de LSCAN + mon recadrage).
- Aucun point d'accroche nécessaire dans `src/scene/fighters/**` : l'appel existant `applyFighterLook(root, look)` de `rig.ts` suffit.
- La vitrine ouvre un 3e contexte WebGL (jeu + portraits + vitrine), fermé au READY.
- Démo : `npm run demo` (le serveur préchauffe les modules `api/`) ; en dev, la préchauffe côté client couvre le 1er scan si l'écran de choix est ouvert quelques secondes avant.

## Pas fait / limites
- Tête en carton découpé, pas en volume : lisible de face et de 3/4, cohérente avec les armes ; de profil, c'est une tranche épaisse.
- Pas de visages de secours dessinés à la main (R3) : le repli est un portrait inventé d'après les traits.
- Le test d'interface s'arrête à l'arsenal (écran LUX) ; le match est vérifié par `gameHooks.startMatch` avec les persos scannés.
- En écran scindé, les caméras par joueur ne suivaient pas encore les persos dans mon test (lot RTVIEW) : captures de face et de dos faites par une caméra de test.
