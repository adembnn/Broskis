# Script de démo — 2 minutes

> Mis à jour 15h40 pour le **pivot temps réel** (`plan/PIVOT-TEMPS-REEL.md`) : fini le tour par
> tour, c'est un 1v1 temps réel, écran scindé, à 2 amis sur le même PC. Priorité d'Adem : **on se
> prend en photo pour devenir son perso** (lot LFACE) et **on scanne un objet pour en faire son
> arme** (lot LSCAN), voix clonée par joueur (LW2).

Ce script tient tout seul, même si le gameplay réel (autres lots) n'est pas encore fini : chaque
étape décrit ce qu'on doit VOIR à l'écran, pas comment le code y arrive. S'il manque une feature à
l'heure de la démo, on la simule côté régie (`?demo=1`, cache IA, `forcerVictoire`) sans que ce
script change.

**Phrase d'accroche : « Snap anything. Become anyone. Fight in real time. »**

## Le principe (30 secondes pour le comprendre)

Deux amis, un seul PC, un écran coupé en deux. Chacun se prend en photo → devient son perso dans le
jeu. Chacun scanne un objet réel → devient son arme. Puis combat en temps réel, à la troisième
personne, visée automatique verrouillée sur l'adversaire (pas de souris) : on court, on saute deux
fois, on tire, on bloque au bon moment pour renvoyer le tir. Chacun entend l'autre parler avec SA
PROPRE VOIX clonée. Un animateur IA commente en direct.

## Table seconde par seconde

| Temps | Touche régie | Ce qu'on voit | Ce qu'on dit | Wow |
|---|---|---|---|---|
| 0:00–0:15 | F1 | Écran-titre BROSKIS (logo sticker, vraies armes collées autour) → deux joueurs (Titouan et un ami / un membre du jury) se prennent en photo l'un après l'autre à la webcam | **« Snap anything. Become anyone. Fight in real time. »** (voix animateur) | Le jury voit littéralement un des deux joueurs devenir son perso 3D en quelques secondes |
| 0:15–0:35 | F2 | Écran scindé : chaque perso (visage photographié, plaqué sur un corps KayKit) apparaît de son côté de l'écran, `READY?` puis `GO!` | L'animateur présente les deux combattants comme à une pesée de boxe, avec leurs voix clonées respectives qui répondent en criant | Deux vrais visages du public, dans le jeu, prêts à se battre en 15 secondes |
| 0:35–1:05 | F3 | Combat en temps réel : les deux joueurs courent, sautent, se tirent dessus (armes déjà scannées avant la démo), un joueur bloque au bon moment → **PARFAIT !**, renvoi du tir au ralenti | Chaque combattant crie avec sa propre voix (coup pris, parade), l'animateur relance entre les échanges | La parade parfaite renvoie littéralement le tir de l'adversaire — lisible en un coup d'œil, aucune explication nécessaire |
| 1:05–1:35 | F4 | Caisse Snap : elle tombe au milieu de l'arène → **le jury tend un objet à la webcam** → scan en direct (quelques secondes, sans pause du match) → l'objet devient une 4e arme, immédiatement utilisée | Réplique de l'animateur sur l'objet du jury en particulier (improvisée par Gemini) + cri d'impact du joueur touché | L'IA scanne un objet QUE PERSONNE n'a préparé, en live, en plein combat qui continue — la preuve que « l'IA est indispensable » |
| 1:35–2:00 | F5 | KO : un joueur est éjecté hors de l'arène (perte de la 2e vie), ralenti + zoom, écran de fin (score, Scandex des armes découvertes), logo BROSKIS + « Built for Voodoo × Google DeepMind » | Silence pendant l'éjection, puis un dernier sting audio bref | Ferme la boucle : le jury repart avec la promesse (2 amis qui jouent, temps réel, fluide) et la preuve technique (visage + objet + voix, tout généré en live) dans la même image |

Panique : **F9**. Vidéo de secours : `captures/video/` (générée par `npm run video`).
Chronos des répétitions : à consigner ici après chaque répétition chronométrée (3 minimum avant 19h30).

## Notes de régie

- Les touches F1–F5 sont des repères pour la personne qui pilote le clavier pendant la démo live ;
  elles ne correspondent pas forcément 1-pour-1 à des hooks (le pilotage automatique pour les
  captures/tests est dans `demo/parcours.json`, voir plus bas).
- **Deux joueurs réels sur le même clavier pendant la démo live** (P1 ZQSD/F/G, P2 flèches/L/K,
  `plan/PIVOT-TEMPS-REEL.md`) : si un des deux n'est pas disponible le jour J, la régie peut piloter
  le second perso au clavier en restant simple (juste bouger + tirer), ou le laisser géré par le bot
  temps réel s'il est prêt (`LX`/« bot temps réel » — voir NOUVELLES.md, pas garanti).
- Le tableau ci-dessus reste valable même si l'écran scindé n'est pas encore parfaitement fluide, si
  la voix clonée d'un joueur n'est pas prête (repli sur les voix Gradium génériques du lot LBK2/LBK3),
  ou si le KO/ralenti n'est pas encore câblé (on coupe simplement le son et on ralentit la voix de la
  régie).
- Objectif non négociable : à 0:15, les deux visages réels doivent déjà être visibles sur leurs
  persos 3D respectifs, chacun de son côté de l'écran scindé. Tout le reste peut être approximatif
  si le temps manque, pas ce moment-là (règle d'or du `CLAUDE.md`, mise à jour pour la priorité
  photo → perso du pivot).
- Prévoir un plan B de cadrage webcam si le rendu photo → visage est imparfait sur un visage inconnu
  au moment de la démo : répéter avec plusieurs visages différents avant 19h30, pas seulement celui
  de Titouan/Adem.

- `demo/parcours.json` n'utilise que les 4 hooks garantis par `plan/PIVOT-TEMPS-REEL.md`
  (`setSeed`, `startMatch`, `input`, `forcerVictoire`) — les hooks fins du tour par tour
  (`move`, `pickWeapon`, `aim`, `parry`, `scan`, `grabCrate`...) ne sont plus la référence tant que
  RTCORE n'a pas fixé le nouveau contrat. `tools/capture.mjs` appelle chaque hook avec **un seul**
  argument (`fn(e.arg)`, pas d'étalement) : `input` y est donc passé comme un tableau
  `[joueur, action, appui]` — si l'implémentation réelle de `window.gameHooks.input` attend 3
  arguments séparés plutôt qu'un tableau, il faudra soit adapter `capture.mjs` (hors de mon
  périmètre, à signaler à qui le fait), soit que `input` accepte aussi un tableau en entrée.

## 8 objets physiques de démo

Voir `demo/OBJETS.md` pour la liste complète (drôles, fiables à scanner, une catégorie d'arme par
objet parmi les 4 du jeu). Les objets des deux joueurs (armes de départ) sont scannés et mis en
cache **avant** la démo ; seul l'objet de la Caisse Snap (1:05–1:35) est scanné en vrai, en direct.
