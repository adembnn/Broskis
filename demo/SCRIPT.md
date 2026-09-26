# Script de démo — 2 minutes

Ce script tient tout seul, même si le gameplay réel (autres lots) n'est pas encore fini : chaque
étape décrit ce qu'on doit VOIR à l'écran, pas comment le code y arrive. S'il manque une feature à
l'heure de la démo, on la simule côté régie (`?demo=1`, cache IA, `forcerVictoire`) sans que ce
script change.

**Phrase d'accroche : « Snap anything. Fight with it. »**

## Table seconde par seconde

| Temps | Touche régie | Ce qu'on voit | Ce qu'on dit | Wow |
|---|---|---|---|---|
| 0:00–0:10 | F1 | Écran-titre BROSKIS, logo, puis plan large sur la table pleine d'objets (mug, banane, téléphone, peluche…) posée devant la caméra du jeu | **« Snap anything. Fight with it. »** (voix animateur, ton pesée de boxe) | Le titre claque en 3 secondes ; le jury comprend le concept avant la première frame de gameplay |
| 0:10–0:40 | F2 | On scanne un objet posé sur scène (ex. le mug) : flash de scan → sticker cartoon qui se détoure et s'extrude en 3D → carte d'arme qui se retourne (stats, trait, nom) | L'animateur présente l'arme comme un commentateur de pesée : *« In the blue corner... The Caffeinator! Power 4, a nasty `sticky` trait. »* | L'objet réel devient littéralement une arme jouable en moins de 5 s, sous les yeux du jury |
| 0:40–1:20 | F3 | Caisse Snap : son ombre apparaît au sol pendant le duel, un joueur court dessus, elle s'ouvre → **le jury tend un objet à la webcam** → scan en direct (10 s) → l'objet devient une arme, le joueur tire dessus et touche l'adversaire | Réplique de l'animateur sur l'objet du jury en particulier (improvisée par Gemini) + cri d'impact | L'IA scanne un objet QUE PERSONNE n'a préparé à l'avance, en live, devant le jury — la preuve que « l'IA est indispensable » |
| 1:20–1:45 | F4 | KO au ralenti : le joueur touché est éjecté de la map, caméra en orbite lente autour de sa chute jusqu'au vide | *(silence)* — juste le bruit du vent/impact en ralenti | Le silence total fait ressortir le ralenti ; contraste avec le bruit du duel qui précède |
| 1:45–2:00 | F5 | Écran de fin : « K.O. » + Damage Report, puis logo BROSKIS et une ligne « Built for Voodoo × Google DeepMind — snap-to-weapon powered by Gemini » + QR code du dépôt | Silence, puis un dernier sting audio bref | Ferme la boucle : le jury repart avec la promesse (jeu) et la preuve technique (IA) dans la même image |

Panique : **F9**. Vidéo de secours : `captures/video/` (générée par `npm run video`).
Chronos des répétitions : à consigner ici après chaque répétition chronométrée (3 minimum avant 19h30).

## Notes de régie

- Les touches F1–F5 sont des repères pour la personne qui pilote le clavier pendant la démo live ;
  elles ne correspondent pas forcément 1-pour-1 à des hooks (le pilotage automatique pour les
  captures/tests est dans `demo/parcours.json`, voir plus bas).
- Le tableau ci-dessus reste valable même si : la Caisse Snap n'existe pas encore visuellement (on
  peut simuler avec `scan()` déclenché au clavier au bon moment), le ralenti n'est pas encore câblé
  (on coupe simplement le son et on ralentit la voix de la régie), ou l'écran de fin est un simple
  écran statique le jour J.
- Objectif non négociable : à 0:10, un objet réel scanné doit déjà être visible en 3D à l'écran.
  Tout le reste peut être approximatif si le temps manque, pas ce moment-là (règle d'or du
  `CLAUDE.md`).

## 8 objets physiques de démo

Voir `demo/OBJETS.md` pour la liste complète (drôles, fiables à scanner, une catégorie d'arme par
objet parmi les 4 du jeu).
