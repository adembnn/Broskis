# Rendu LUX · Interface pour joueur occasionnel (puis HUD scindé du temps réel)

Agent Claude (Opus), branche **`worktree-agent-ad17fba135b71700f`**, 26/09 de 14h15 à 16h20. `npm run build` passe.
Déjà fusionné sur main par la session principale : tout jusqu'à `7dc8ddc`. Reste à fusionner : `6290db7` → `71a3c50` (dont le HUD du temps réel, `5282c6c`).

## Fait
Chaque point a été vu tourner (Playwright, vrais clics et vraies touches, port 5368), captures listées plus bas.

1. **Les 8 vraies armes partout** (demande de 14h20). `src/ui/presets.ts` n'invente plus d'armes : le râtelier lit la banque de `public/assets/presets/presets.json` (`presetsReady` ajouté dans `src/ia/presets.ts`).
   - `src/ui/sticker2d.ts` : sticker Nano Banana détouré dans le navigateur (fond magenta retiré, liseré adouci, bords rognés), mis en cache.
   - Il est utilisé sur l'arsenal, la carte d'arme, la présentation, la barre d'armes, l'écran de fin et l'écran-titre.
   - Arme scannée dont le sticker n'est pas arrivé : petite forge, puis fondu « sorti de la forge » dès que `scan:result` ramène l'image. Le sticker est aussi recopié sur les armes du match (la scène 3D le voit).
   - Sans image possible (échec, objet du cache démo) : étiquette au nom de l'objet, jamais un losange.
   - Vérifié avec le vrai pipeline : lecture Gemini → stats en 3 s → sticker en 17 s → fondu.
2. **Événement `scan:progress { player, step, weaponId? }`** (`reading`, `stats`, `sticker`, `sticker-failed`), émis dans `src/ia/scan.ts` sans changer sa logique.
3. **HUD du tour par tour façon Smash** (vague 1, déjà sur main) :
   - encarts %, vies et portraits rendus en 3D (`src/ui/portraits.ts` : buste du vrai modèle KayKit en pose idle, ou visage sticker pour un perso photo) ;
   - barre d'armes avec ce que fait chaque arme en 3 mots ;
   - aide à touches dessinées, invite de parade, READY?/GO!/GAME!, EDGE! ;
   - désencombrement : plus de carte d'animateur, de chiffres flottants, de chrono ni de barre « Move ».
   Remplacé depuis par le HUD du temps réel (point 4).
4. **Pivot temps réel (15h25) : HUD scindé** (`src/ui/hud.ts`, `help.ts`, `stylesLux.ts`).
   - Chaque moitié a son HUD : encart (portrait, nom, % qui saute et change de couleur, vies, jauge BRO, étiquette BLOCK) et barre de 3 armes (sticker, touche réelle, recharge en secondes en anneau, barre de charge du tir).
   - Chaque moitié a aussi sa carte de commandes avec les vraies touches du joueur. Au 1er match, elle est grande pendant le compte à rebours et les 10 premières secondes, puis se réduit ; H la déplie.
   - Anneau de parade qui se referme dans la vue du joueur visé (`projectile:incoming`), avec sa touche de blocage au centre. PERFECT!, BLOCKED et EDGE! s'affichent dans sa moitié.
   - Au centre : séparateur fin, chrono 3:00 puis SUDDEN DEATH, sous-titre court de l'animateur (2 s environ). En travers de l'écran : READY?, 3 2 1, GO!, GAME!.
   - Contre l'IA : une seule vue plein écran ; l'IA n'a que son encart.
   - Le lancement passe `split: !vsAI` à `startMatch`.
5. **Settings → Controls** (`src/ui/settings.ts`), depuis le titre, ou avec ÉCHAP en match (jeu en pause par `loop.setSlow`, touches du jeu bloquées).
   - 2 colonnes P1/P2. Clic sur une touche, « Press a key… », puis la nouvelle touche (ÉCHAP annule).
   - Les conflits sont signalés ; le partage saut/parade d'un même joueur est permis. Bouton « Reset to defaults ».
   - Toute l'interface lit ses touches dans `src/core/input.ts` (`keys.ts`) et se redessine sur `onBindingsChange`. Plus aucune touche de jeu écrite en dur.
6. **Écrans** (fond « affiche de boxe » : coin rouge, coin bleu, trame de points sur kraft) :
   - titre : logo sticker, une phrase et les vraies armes collées autour ; un gros PLAY (« 2 players · 1 keyboard · split screen »), vs AI qui déplie les difficultés, liens Settings et Scandex ;
   - choix des persos façon Smash : grille de portraits, jetons P1/P2, 2 encarts, « Use my voice » (LW2) gardé, READY TO FIGHT! ; contre l'IA, elle choisit son perso et son arsenal au hasard ;
   - arsenal : touches 1 2 3, râtelier de stickers, tuile « Snap a real object » ;
   - présentation : la 1re carte arrive tout de suite, puis au rythme de la pesée vocale LVOX ; sous-titre = `voice:line` ;
   - map : grandes vignettes peintes en SVG avec la palette de chaque map (`mapThumbs.ts`, pions P1/P2 pour l'échelle), touches 1 2 3 ;
   - fin : gagnant en grand, % final, KOs et dégâts de chacun, arme MVP avec son sticker, Scandex, REMATCH (R) et MENU.
7. **REMATCH robuste** : la revanche rejoue le dernier match lancé, quel que soit le point d'entrée (parcours, hooks, labo). Un match lancé pendant l'écran de fin ferme proprement celui-ci.
8. **Correctifs** :
   - `matchLog.ts` n'arbitre plus (il retirait les PV une 2e fois) ;
   - `[hidden]` vraiment masqué dans l'interface (la carte d'animateur vide restait affichée) ;
   - pile d'affichage du HUD sous les écrans (GAME! passait devant l'écran de fin) ;
   - bandeaux centrés même pendant leur animation.

## Pas fait
- **Tutoriel en bulles** : fait pour le tour par tour, puis supprimé au pivot. La carte de commandes grande au 1er match le remplace.
- **Génération d'armes streamée en plusieurs cartes parallèles dans l'arsenal** : laissée à LLOAD (forge, stats en flux, déjà sur main) et LSCAN. Le fondu du sticker à son arrivée est fait (sticker2d).
- **Écrans de chargement** : ceux de LLOAD (rideau P1/P2, astuces) sont branchés et gardés.
- **Stickers des objets du cache démo sans image** : `/api/sticker` exige une photo, donc impossible sans endpoint texte → image. Hors de mes chemins.
- **Vraie projection de l'anneau de parade** : elle utilisera `ctx.three.cameras[player]` dès que RTVIEW le fournit. D'ici là, l'anneau se place au centre-bas de la moitié. `viewOf(player)` n'est pas encore utilisé : les moitiés supposent 50/50.

## Décisions
- Le temps réel est lu sans casser le contrat actuel.
  - Champs : `cooldowns`, `charge` et `blocking` sont lus s'ils existent. À défaut, la recharge « en tours » reste affichée.
  - Événements `countdown`, `block` et `weapon:ready` : lus par leur nom (`bus.onAny`), car absents de `events.ts`. Seul `countdown` sert pour l'instant ; le reste passe par la lecture d'état à chaque image.
- Repli local de READY?/GO! et GAME! si les règles ne les émettent pas.
- H bascule la carte de commandes, sauf si H est lié à une action d'un joueur.

## Frictions pour la session principale
- **LVOX** : après « Skip presentation », les lignes de pesée programmées (`src/ia/commentary.ts`, `loop.later`) continuent pendant le match. On entend « In this corner… » en plein combat. Il faut un jeton d'annulation.
- **Étiquettes 3D à trier** (demandé 14h50, fichier:ligne) :
  - `src/scene/fx/index.ts:67` : chiffres de dégâts « -29 », en contradiction avec les % ; à passer en « +29% » ou à supprimer ;
  - `src/scene/fx/index.ts:68` (+ `fx/onomato.ts`) : onomatopées-stickers géantes (« BOOM » plein cadre dans la vue du défenseur) ;
  - `src/scene/aim.ts:68` : aides de visée à la souris, obsolètes avec la visée verrouillée ;
  - `src/scene/movementRing.ts` : anneau de déplacement, à supprimer au pivot ;
  - `src/scene/parry-fx/index.ts:49` : anneau 3D de parade sur `parry:window`, qui n'est plus émis en temps réel ; doublon de mon anneau 2D ;
  - `src/scene/maps/engine.ts:1116` : rayures d'alerte `map:warn`.
- Erreur console existante, pas de moi : `THREE.Sprite: Raycaster.camera needs to be set` (`src/scene/camera/occlusion.ts:33`, `director.ts:120`). Des sprites d'effets sont testés par l'occlusion de la caméra.

## Pour fusionner
- **Conflits probables** :
  - `src/ui/index.ts` : le rideau LLOAD (`coverMatchStart`) est gardé autour de `startMatch(full)` avec `split` ;
  - `src/ui/screenFighters.ts` (LFACE) : restructuré en grille ; les accroches `snapYourself` (capture + `scanFighter`) et `promptVoiceClone` sont intactes ;
  - `src/ui/screenArsenal.ts` (LSCAN) : `forgeAndCard` et `snapObjectFlow` intacts ; seuls les tuiles, la mise en page et `aiArsenal` ont changé ;
  - `src/ui/styles.ts` : anciennes sections HUD supprimées ; tout le nouveau CSS est dans `stylesLux.ts` ;
  - `src/core/events.ts` : 1 ligne `scan:progress` ;
  - `src/ia/scan.ts` : 5 lignes d'émission.
- **Attendu du cœur temps réel** : `PlayerState.cooldowns / charge / blocking` ; `projectile:incoming { target, etaMs }` ; `parry:result` au blocage ; `teeter` ; `stock:lost` ; `match:banner` ready/go/game ; `countdown { n }`. S'ils manquent, le HUD tient quand même.
- **Attendu de RTVIEW** : `ctx.three.cameras[player]` pour l'anneau de parade. Si les vues ne font pas 50/50, régler `.half` ou passer par `viewOf`.
- `SUIVI.md` : noter l'événement `scan:progress` (je n'ai pas touché ce fichier, pour éviter les conflits).

## Captures (`captures/lux/` de ma copie, dossier ignoré par git)
- Temps réel : `split-1280-0[1-5]-*.png` (compte à rebours, combat, PERFECT!, carte compacte, Settings), `split-1920-*` (1080p), `solo-1280-*` (vs IA), `curtainprobe.png` (parcours complet avec rideau LLOAD), `ringprobe.png` (anneau de parade).
- Parcours complet : `flow-1280-*` et `flow-1920-*` (titre → persos → arsenal → présentation → map → match → fin → revanche), `ai-1280-*` (vs IA).
- Scan réel : `scan-1280-0[1-5]-*.png`. Règles v2 fusionnées à blanc : `v2-1280-*`.
- Relecture en directeur artistique : rien n'est coupé ni superposé à 1280×720 et 1920×1080. Seul point : les noms longs sont tronqués avec « … » dans les cartes d'arme de 720p.
