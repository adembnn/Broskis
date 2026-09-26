# Rendu du lot LATK1 · « L'arme, c'est l'objet » (objets, projectiles, impacts)

Branche `worktree-agent-ac8bc1612a7aba86e`. Tout vit dans `src/scene/weapons/` (nouveau), installé par une ligne
dans `src/scene/index.ts`. Suit le pivot temps réel (15h25) et la demande « une chaise n'est pas une canette » (15h50).

## Fait
- **L'objet en main** (`hand.ts`) : le sticker de l'arme choisie suit `handslot.r` en position/orientation monde
  (indépendant de l'échelle du squelette), à sa **taille réelle** bornée 0,35 à 1,6 m, change avec l'arme.
  Pendant la charge (`players[i].charge`) : il tremble et luit (émissif `palette.lumiere`, franchit le bloom).
  Grenade, throwable, bouclier : la main reste vide tant que l'arme lancée recharge (`cooldowns`), puis l'objet
  revient d'un « pop ». Blaster : l'objet reste en main, recul + cabrage à chaque tir, éclair de bouche (étoile),
  douilles colorées qui rebondissent.
- **L'objet en vol** (`flight.ts`) : position = celle du projectile du gameplay (`liveProjectiles()`, lecture
  seule), à défaut rejouée depuis `projectile:spawn { from, vel, gravity }` ; départ de la main (l'écart main →
  origine du tir se résorbe en 0,15 s) ; fin = `projectile:end { pos, reason }`. Aucune supposition de timing.
  - grenade : mèche qui clignote de plus en plus vite (+ étincelles), tache d'encre au sol qui lit la cloche ;
  - throwable : traînée ; traçantes du blaster (corps étiré + halo lisible de face) ;
  - **rotation selon la forme réelle**, vitesse ≈ 1/√masse : long bout par-dessus bout, flat en frisbee (couché,
    penché vers le défenseur), round roule face au défenseur, box culbute lente, irregular axe aléatoire amorti ;
  - **épaisseur du carton = profondeur réelle** (canette = bloc, téléphone = carte) ;
  - **poids ressenti** : traînée épaisse et longue, ombre plus nette pour un lourd ; fine pour un léger ;
  - l'objet grossit (×1,4, plafonné) en arrivant sur le défenseur ;
  - **anneau de parade** (`projectile:incoming`, 400 ms) : se referme autour de l'objet, en temps de jeu (suit le
    ralenti), **dessiné seulement dans la vue du joueur visé** (`ctx.three.cameras`) ;
  - **parade parfaite** : c'est le MÊME objet qui repart vers son lanceur (étincelles + flash au renvoi, il tourne
    plus vite et luit) ;
  - trait split : deux copies plus petites escortent l'objet et se referment avant l'impact.
- **Impacts** (`blast.ts`, pools fixes, 300 particules maximum) :
  - grenade : flash, bouffées dessin animé aux couleurs de l'objet (contour d'encre), **anneau au sol au rayon
    réel** (même formule que le gameplay : stat b + trait explosive), éclats, fumée, trace brûlée, BOOM ;
  - objet lancé : force selon le poids (secousse, poussière, fissure au sol, THUD) ; un léger fait POP ;
  - **matière** : métal = gerbe d'étincelles (CLANG), bois = échardes, verre/céramique fragiles = l'objet se brise
    (CRASH), plastique/caoutchouc = rebond écrasé selon `bounciness`, tissu = bouffée molle, papier = confettis
    qui flottent, nourriture = éclaboussure, liquide = giclée de sa couleur + flaque brillante (SPLASH), pierre =
    éclats gris. La grenade garde sa signature de matière dans l'explosion (une bouteille éclate en verre) ;
  - traits : explosive (explosion en plus), sticky (éclaboussure gluante), slippery (flaque luisante), loud
    (ondes sonores), heavy (poussière), healing (étincelles vertes sur le lanceur), bouncy (écrasements).
  - **écran scindé** : les mots (BOOM, CRASH…) ne s'affichent que dans la vue du TIREUR (sa récompense) ; la vue
    du défenseur n'est jamais bouchée par un mot géant ; flashs bornés.
- **Mur-bouclier** (`shield.ts`) : l'objet grandit en sticker géant **à la taille exacte du collider** (largeur =
  stat b, hauteur = stat a), montée avec rebond, poussière à la pose ; touché : étincelles + vacillement ; se
  décolle à la fin de sa vie (`RT.shieldLifeS`, 5 s en temps de jeu).
- **Physique réelle** (`physics.ts`) : lit `weapon.physics` (contrat 8b5881f), la même source que le gameplay
  (`physics-feel.ts`) ; les presets sans physique sont estimés par mots-clés de l'objet (chaise, nain de jardin,
  poêle, canard, baguette, téléphone…), sinon par catégorie : la démo hors ligne montre aussi des objets
  différents. `guessPhysics(weapon)` est exporté : **à brancher par le lot IA sur les presets** (remplir
  `weapon.physics`) pour que le gameplay et le rendu disent la même chose hors ligne.
- **Rebonds et flaques du gameplay** : `projectile:bounce` (l'objet suit la vraie position et s'écrase à chaque
  rebond, poussière selon le poids, petite signature de matière) ; `ground:slippery` (flaque au rayon et à la
  durée exacts, à la couleur de l'objet qui a giclé). Aucune flaque inventée côté rendu.
- **Son** : nouvel événement `weapon:impact { pos, material, massKg, fragile, liquid, category, on }` (ajouté à
  `src/core/events.ts`) pour que le lot audio joue clang / crash / splash.
- **Bancs** : `tools/latk/capture-armes.mjs` (captures prises DANS la page juste après le rendu de l'image voulue,
  temps de jeu ralenti ×0,35 pour que la machine chargée ne saute pas les instants clés ; écran scindé puis plans
  rapprochés ; planche `captures/latk/planche.png`) et `tools/latk/perf-armes.mjs` (pire image par système,
  nouveaux shaders au 1er tir).

## Mesures
- Coût du système `latk-armes` : 1 à 2 ms au pire par image pendant les tirs (mesuré par `perf-armes.mjs`, avant
  l'ajout de la physique ; la physique n'ajoute que quelques rayons Rapier par objet en vol).
- Aucun nouveau shader compilé au premier tir de chaque catégorie (un exemplaire de chaque matériau créé à la
  volée est préchauffé avec la scène).
- Les longues images vues pendant les bancs (0,2 à 5 s) sont dans le RENDU, pas dans ce lot, et varient d'une
  exécution à l'autre : la machine faisait tourner 25 navigateurs et 45 processus node d'autres agents.

## Captures (regardées)
`node tools/latk/capture-armes.mjs --port <libre>` → `captures/latk/` (non versionné). Vu sur le vrai gameplay
temps réel (map Archipel), relu image par image :
- `01-charge-canard` : le canard en main pendant la charge (lueur trop forte à ce moment-là : texture délavée →
  corrigé, lueur plus douce qui pulse ; pas re-capturé, alerte mémoire de 16h40) ;
- `02`/`05-chaise-12kg` : explosion du canard en dessin animé (bouffées jaune/orange cernées d'encre, éclats,
  anneau blanc au sol au vrai rayon, BOOM lisible) ; `08` : la chaise de bureau (1,1 m, 12 kg) culbute en vol avec
  sa tache d'encre au sol ; `10` : elle s'écrase sur P2 ;
- `50-baguette-longue` : la canette (grenade liquide, loud) explose en bouffées rouge/blanc, éclats, ondes
  sonores, flaque ; la baguette vole bout par-dessus bout avec son ombre. La flaque sortait en bleu « eau »
  (l'événement du gameplay arrive avant la fin du vol) → corrigé (couleur de l'objet encore en vol) ;
- `33-telephone-verre` (caméra de banc derrière P2) : un mot d'impact géant en plein milieu de la vue du défenseur
  → d'où la règle « mot seulement dans la vue du tireur » (en écran scindé réel, la vue du tireur est derrière
  lui) ; mots désormais sans brouillard et jamais en blanc qui bave.
Limites du banc : machine saturée (images espacées de 100 à 800 ms malgré le ralenti), caméras de banc fixes (pas
les caméras RTVIEW), écran scindé pas encore activé sur main.

## Pas fait et pourquoi
- Rebond de la grenade avant l'explosion : le gameplay temps réel la fait exploser au 1er contact ; un rebond
  visuel aurait menti sur le point d'impact (le code arbitre). Le trait bouncy se voit en vol (écrasements).
- Éclats texturés avec le sticker lui-même quand l'objet se brise : éclats aux couleurs de sa palette à la place.

## Décisions prises seul
- Les mots d'impact sont réservés à la vue du tireur (écran scindé) ; le défenseur voit l'impact, pas le mot.
- L'objet en vol présente sa face au défenseur (lisible au moment de parer) ; le tireur voit l'envers (texture
  double face).
- Couleurs sans token DA : vert du soin, voile de verre, sciure, pierre (`src/scene/weapons/tokens.ts`).

## Retouches hors de mon dossier (à signaler à la fusion)
- `src/scene/fx/index.ts` : retrait de l'ancien mur-sticker (remplacé par `weapons/shield.ts`).
- `src/scene/fx/impact.ts` : les chiffres de dégâts ne sont plus touchés par le raycast de la caméra (erreur
  « Raycaster.camera » en boucle après le premier coup).
- `src/core/events.ts` : événement `weapon:impact` (une ligne + commentaire).
- `src/scene/fighters/index.ts` : l'ancien sticker en main avait été retiré ici ; LATK2 l'a aussi retiré sur main
  (sa version a été gardée à la fusion).

## Pour la fusion et les autres lots
- Lectures seules du gameplay : `liveProjectiles()` (projectiles.ts), `lerp` (trajectory.ts), `GRENADE_RADIUS_*`,
  `TRAIT_TUNING`, `SHOT_ORIGIN_HEIGHT`, `RT.shieldLifeS`, `SHIELD_*` (tuning.ts), `getRuntime()` : si RTCORE les
  renomme, le build casse ici.
- Lot IA : remplir `weapon.physics` des presets avec `guessPhysics()` (src/scene/weapons/physics.ts).
- Lot audio : écouter `weapon:impact` (matière, masse, fragile, liquide) et `projectile:bounce`.
- RTVIEW : l'anneau de parade et les mots filtrent par `ctx.three.cameras[joueur]` (caméra qui dessine la vue de ce
  joueur) ; sans écran scindé, tout s'affiche dans la vue unique.
- `plan/SUIVI.md` : noter le nouvel événement `weapon:impact` (pas modifié ici pour éviter les conflits).

## Frictions
- Pivot temps réel en plein lot : la première version calait le vol sur les minuteries du tour par tour ; réécrite
  sur `liveProjectiles()` / `projectile:end` dès que RTCORE les a exposés (bien plus simple et exact).
- Machine très chargée : captures Playwright à plus d'1 s chacune ; résolu en prenant les images dans la page et
  en ralentissant le temps de jeu pendant le banc.
- Un port « libre » (5363) était en fait le Vite d'un autre agent : mon banc s'y est branché et testait son code.
  Arrêté aussitôt (mes seuls processus) ; les bancs refusent désormais un port déjà occupé.
- L'écran scindé n'est pas encore activé sur main (personne n'appelle `setViewMode('split')`, pas de caméra P2) :
  le filtrage par vue (anneau de parade, mots) est en place mais vérifié seulement en vue unique.
