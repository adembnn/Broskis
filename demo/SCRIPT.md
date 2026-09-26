# Script de démo — 2 minutes

> Réécrit à 16h pour le **pivot temps réel** (`plan/PIVOT-TEMPS-REEL.md`, fait foi) : 1v1 en temps
> réel, écran scindé (P1 à gauche, P2 à droite), 2 joueurs sur le même clavier, visée verrouillée.
> Priorité d'Adem : **on se prend en photo pour devenir son perso** (LFACE) et **on scanne un objet
> pour en faire son arme** (LSCAN). Règle d'Adem : chaque vue reste toujours sur son joueur, aucune
> bascule ni caméra partagée, même au KO.

Chaque ligne dit ce qu'on doit VOIR, et si ça existe déjà sur `main` (**prêt**) ou si un lot le
construit (**en cours : LOT**). Ce qui est marqué « idée » n'a pas de lot : à faire avant 18h ou
coupé sans changer le script.

**Phrase d'accroche : « Snap anything. Become anyone. Fight in real time. »**

## Le principe (compris en 3 s)

Deux joueurs, un clavier, un écran coupé en deux. Un juré se prend en photo : il devient le perso
de Titouan. Il tend un objet de sa poche : il devient une arme. Puis combat en temps réel,
troisième personne, visée verrouillée : on court, on tire dès que l'arme est rechargée, on bloque
au dernier moment pour renvoyer le tir. L'animateur IA commente en connaissant chaque objet.

## Distribution

- **P1 (gauche, ZQSD / ESPACE / F / G / 1-2-3)** : Titouan, avec **le visage du juré** et son objet.
- **P2 (droite, flèches / MAJ DROITE / L / K / 8-9-0)** : Adem, perso scanné avant la démo (cache).
- **Régie** : touches F1–F5 sur `?demo=1` (1 vie par joueur).

## Table seconde par seconde

| Temps | Régie | Ce qu'on voit | Ce qu'on dit / entend | Wow | État |
|---|---|---|---|---|---|
| 0:00–0:08 | F1 | Écran-titre BROSKIS, logo sticker, vraies armes collées autour | Animateur : **« Snap anything. Become anyone. Fight in real time. »** | Ton cartoon premium dès la 1re image | prêt (LUX retouche) |
| 0:08–0:26 | — | Un juré se place devant la webcam → photo → **son combattant apparaît : grosse tête à son visage, couleurs de sa tenue, son nom** | Adem parle par-dessus l'attente (8 à 23 s mesurés) : « Gemini lit la photo, Nano Banana dessine le visage » | Le juré se voit dans le jeu | parcours prêt (LSCAN-PERSO) · grosse tête **en cours : LFACE** |
| 0:26–0:42 | — | Le juré tend un objet de sa poche → snap → **carte d'arme** : catégorie, stats, trait, sticker 3D de l'objet | Pesée : l'animateur **nomme l'objet réel** et le présente comme un boxeur | Personne n'a préparé cet objet | stats ≈ 2 s prêt · sticker ≈ 8 s **en cours : LSCAN** |
| 0:42–0:48 | F2 | Choix de l'Archipel → écran scindé → `READY?` 3-2-1 `GO!` ; les stickers d'armes **claquent** dans les 2 HUD | Compte à rebours de l'animateur | Les 2 vues naissent en même temps, chacune derrière son joueur | écran scindé **en cours : RTVIEW** · bannières prêtes · claquement : idée |
| 0:48–1:10 | F3 | Combat : les 2 courent, double saut, tirs verrouillés. Le HUD montre le **sticker et le nom de l'objet** (« Blaster · Rubber Duck »). Le juré voit « son » objet partir en rafale | Cris des combattants (voix Gradium), l'animateur relance | Lisible sans explication : on court, on tire | **en cours : RTCORE, LUX, LATK1** · nom d'objet dans le HUD : idée |
| 1:10–1:22 | — | Adem tire ; **l'anneau se referme** autour du projectile dans la vue de gauche ; Titouan bloque au dernier moment → **PERFECT!**, ralenti ×0,3, le tir repart vers Adem | L'animateur dit « PERFECT! » en même temps que le texte | Le seul geste « expert », compris en un coup d'œil | **en cours : RTCORE** · « PERFECT! » vocal synchro : idée |
| 1:22–1:36 | — | **Caisse Snap** (35 s après GO) : son ombre au sol 3 s avant, elle tombe, Titouan la touche → arme bonus immédiate, tirée des objets déjà scannés, **sans pause** | Réplique Gemini sur l'arme bonus | Un objet scanné plus tôt revient en plein combat | **en cours : RTCORE** (caisse codée, minuterie à vérifier) |
| 1:36–1:50 | F4 | F4 : Adem passe à 150 % → le coup suivant l'éjecte : **ralenti, zoom KO dans SA seule vue**, bannière `GAME!` en surimpression commune | Silence pendant l'éjection, puis l'animateur : **« Knocked out by… a rubber duck! »** (l'objet du juré) | L'objet du juré a gagné le match | F4 prête · zoom KO / `GAME!` **en cours : LSMASH-FX** · réplique qui nomme l'objet : idée |
| 1:50–2:00 | F5 | Écran de fin : Scandex des objets découverts, **miniatures des 2 objets vainqueurs**, logo BROSKIS + « Built for Voodoo × Google DeepMind » | Dernier sting audio bref | Preuve en une image : visage + objet + voix, tout généré en direct | Scandex prêt · miniatures : idée |

Panique : **F9** (touche captée par la régie, mais aucun lot ne la branche encore : la vraie parade
est la vidéo de secours). Vidéo de secours : `captures/video/` (`npm run video`). Chronos des répétitions : à consigner ici (3 minimum avant 19h30).

## Idées retenues des recherches (`plan/recherche/*.md`), coût < 1 h chacune

1. L'animateur nomme l'objet réel au KO (« Knocked out by… a toothbrush! »).
2. Nom de l'objet réel dans le HUD à côté du sticker d'arme, pendant tout le combat.
3. « PERFECT! » prononcé par l'animateur en même temps que le texte (±100 ms, sur `parry:result`).
4. Stickers d'armes qui claquent (ressort 150-200 ms) au `GO!`.
5. Écran de fin avec les miniatures des objets vainqueurs.
6. Couleur de l'anneau de parade selon la catégorie d'arme qui arrive.

**Rejetée** : les 2 vues qui zooment vers le centre au KO (règle d'Adem, chaque vue reste sur son
joueur). Le KO se dramatise par le ralenti, le zoom dans la seule vue du perdant et `GAME!` au HUD.

## Notes de régie

- Touches `?demo=1` : la régie n'émet que `demo:cue` ; aujourd'hui **seule F4 est branchée** (P2
  passe à 150 %, `src/gameplay/hooks.ts`). F1, F2, F3, F5 sont des repères pour la personne au
  clavier ; les actions se font à la main (PLAY, choix de map).
- Si le juré ne veut pas être photographié : le visage d'un membre de l'équipe, préparé en cache.
- Si le scan de l'objet dépasse 10 s : l'animateur meuble, et on prend un objet de `demo/OBJETS.md`
  déjà en cache.
- Si l'écran scindé n'est pas fluide (Chrome sur la puce Intel au lieu de la NVIDIA, 12-28 i/s) :
  `npm run demo` puis `npm run demo:chrome` (voir LPERF dans `plan/SUIVI.md`).
- Objectif non négociable : à 0:26, le visage du juré est visible sur le perso de gauche.
- Répéter avec plusieurs visages différents avant 19h30, pas seulement ceux d'Adem et Titouan.

## Pilotage par script (`demo/parcours.json`)

`node tools/capture.mjs --parcours [--demo]` rejoue le combat (pas les écrans de photo, qui
dépendent du réseau) avec les seuls hooks qui existent dans `src/core/types.ts` : `setSeed`,
`startMatch({ split: true })`, `input(player, action, down)` et `forcerVictoire`. `capture.mjs`
appelle un hook avec **un seul** argument : les appels à `input` passent donc par le champ
`attendre` (expression évaluée sur la page), qui renvoie vrai après l'appel.

## 8 objets physiques de démo

Voir `demo/OBJETS.md`. Les armes d'Adem et les 2 autres armes de Titouan sont scannées et mises en
cache **avant** la démo ; seul l'objet du juré (0:26) est scanné en vrai, en direct.
