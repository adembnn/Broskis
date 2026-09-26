# Recherche UI/UX — HUD temps réel écran scindé (BROSKIS)

Contexte : combat 1v1 temps réel, écran scindé vertical, caméra 3e personne verrouillée par joueur, visée auto, 3 armes-objets avec recharge, blocage + parade parfaite (150 ms), dégâts en %, 2 vies, arène qui s'effondre, démo live 2 min devant jury debout à quelques mètres d'un projecteur.

## 1. Principes concrets, chiffrés, sourcés

1. **Redessiner pour l'écran scindé, ne pas juste réduire.** Un HUD lisible en plein écran devient illisible une fois coupé en deux — il faut une interface simplifiée dédiée au multi-écran, pas un simple rescale. [Split-screen game development challenges](https://salivity.github.io/game-development/article/split-screen-game-development-challenges)
2. **Symétrie entre les deux joueurs.** Street Fighter 6 utilise une disposition miroir pour que chaque joueur lise l'état de l'adversaire aussi vite que le sien — même position relative des éléments (barre de vie/arme côté extérieur, %/vie côté intérieur près du centre). [Game HUD Design — Argentics](https://www.argentics.io/game-hud-design)
3. **Radial > numérique pour un cooldown lu en un coup d'œil.** Un cooldown radial, une barre qui se vide ou une silhouette qui change se lit plus vite qu'un chiffre — à utiliser sur chacune des 3 icônes d'arme (1/2/3). [Diegetic UI — indieklem](https://indieklem.substack.com/p/19-the-diegetic-dilemma-benefits)
4. **Couleur = fonction, pas décoration.** Assigner un rôle fixe à chaque couleur (ex. rouge = dégât reçu, jaune = prêt à parer, gris = en recharge) et ne jamais réutiliser cette couleur pour autre chose ailleurs dans le HUD. [Game HUD Design — Argentics](https://www.argentics.io/game-hud-design)
5. **Feedback d'état = confirmation immédiate, proportionnelle à l'importance.** Une fin de recharge d'arme ou une perte de vie doivent déclencher un retour visuel instantané, dont l'intensité (flash, secousse, taille) correspond à la gravité de l'événement. [Argentics — HUD best practices](https://www.argentics.io/game-hud-design)
6. **Lisibilité en vision périphérique = contraste + mouvement, pas typo fine.** Les éléments qu'on ne regarde pas directement (ex. % de l'adversaire, cooldown en coin) doivent se distinguer par un contraste fort et une animation, pas par un texte petit à lire. [Argentics — HUD best practices](https://www.argentics.io/game-hud-design)
7. **Éviter les couleurs impossibles à distinguer pour les daltoniens.** Rouge/vert est la pire combinaison (daltonisme le plus courant) ; éviter aussi bleu/violet et vert/gris. P1 rouge / P2 bleu est un choix sûr, mais chaque camp doit avoir en plus une forme ou un symbole distinct (pas seulement la couleur). [Colorblind-friendly game design — Chris Fairfield](https://chrisfairfield.com/unlocking-colorblind-friendly-game-design/) ; [Can I Play That — guide daltonisme](https://caniplaythat.com/2020/01/29/color-blindness-accessibility-guide/)
8. **Indicateur de menace hors-écran = flèche au bord + halo de dégât.** Un indicateur qui circule/s'approche du bord de l'écran dans la direction de la source, combiné à un flash radial rouge sur l'écran pour renforcer la direction du danger. Pertinent pour l'anneau `projectile:incoming` déjà prévu (400 ms avant impact) — le placer près du bord de l'écran côté origine du tir, pas seulement autour du perso. [Off-screen indicator design — Envato Tuts+](https://code.tutsplus.com/positioning-on-screen-indicators-to-point-to-off-screen-targets--gamedev-6644t)
9. **Le HUD doit rester exact frame par frame.** Un cooldown affiché "prêt" une frame trop tôt, ou une vie qui se met à jour en retard pendant un burst de dégâts, brise la confiance du joueur dans l'affichage — à tester spécifiquement en combat rapide (rafale du blaster). [Argentics — état du HUD](https://www.argentics.io/game-hud-design)
10. **`transform` et `opacity` uniquement pour tout ce qui bouge à 60 i/s dans le HUD DOM.** Ces deux propriétés sautent le layout/paint et passent sur le thread de composition GPU ; `top`, `left`, `width`, `height`, `margin` déclenchent un reflow coûteux à chaque frame — proscrits pour les barres qui varient en continu (%, cooldown). Utiliser `translateX/Y` et `scale`, jamais `left/top` animés. [MDN — Animation performance](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate) ; [Front-End Checklist — transform/opacity](https://frontendchecklist.io/rules/css/animation-performance)
11. **Texte lisible à distance de démo (jury debout à 2-4 m d'un écran ou projeté) : viser au moins 24 pt effectif, 30 pt pour les infos critiques (%, GO!, PERFECT!).** Règle standard salle/projo : hauteur mini de texte ≈ 1 pouce (2,5 cm) tous les 4,5 m de recul ; sous 18 pt le texte devient limite même en lecture rapprochée. [Presentation Guild — règle des 8H](https://presentationguild.org/how-big-big-enough-the-8h-rule-reveals-all/) ; [Extron — Font size legibility](https://www.extron.com/article/videowallfontsize)
12. **Progressive disclosure : n'afficher une info que si elle est actionnable.** Le detail de charge d'une arme (0 à 1) ne doit apparaître que pendant qu'on la charge (touche maintenue), pas en permanence — réduit le bruit visuel sur un écran déjà coupé en deux. [Game HUD Design — Argentics](https://www.argentics.io/game-hud-design)
13. **Un HUD scindé doit être testé en conditions réelles (capture avec VFX, secousses caméra, mouvements), pas en statique.** Un HUD qui semble propre en maquette peut devenir illisible pendant l'action — filer ce test à `node tools/capture.mjs` pendant un combat, pas sur un écran figé. [Argentics — testing HUD](https://www.argentics.io/game-hud-design)
14. **Icônes d'arme reconnues instantanément grâce à l'objet réel photographié, pas une icône générique.** Le principe diegetic UI (Dead Space, Pip-Boy) : plus l'élément d'interface ressemble à l'objet réel qu'il représente, plus il est compris sans explication — directement exploitable avec le sticker Nano Banana de chaque arme comme icône. [Wayline — diegetic interfaces](https://www.wayline.io/blog/diegetic-interfaces-game-design)
15. **Layout miroir + lecture centre-vers-extérieur.** Les infos les plus urgentes (vies, %) près du bord extérieur de chaque demi-écran (zone la moins regardée par l'autre joueur mais toujours dans son champ), les infos d'action (armes, cooldowns) près du centre où l'œil revient entre deux échanges. Cohérent avec le principe de symétrie SF6 (point 2).
16. **1 seul post-traitement, appliqué une fois sur l'image complète des deux vues** (déjà prévu dans `PIVOT-TEMPS-REEL.md`) — s'assurer que le HUD DOM est superposé par-dessus le canvas et non recalculé par vue, pour ne pas doubler le coût CPU/DOM à 60 i/s.

## 2. Maquette textuelle du HUD scindé recommandé

```
┌─────────────────────────────┬─────────────────────────────┐
│  P1 (gauche)                 │  P2 (droite)                 │
│                               │                               │
│ [Vies●●] [BARRE % ROUGE]     │     [BARRE % BLEUE] [●●Vies] │
│  coin haut-gauche, 30 pt     │      coin haut-droit, 30 pt  │
│  % en gros chiffres,         │      symétrique inversé      │
│  tremble + rougit >100%      │                               │
│                               │                               │
│         (zone de jeu — caméra 3e personne verrouillée)       │
│                               │                               │
│  ← anneau "incoming" apparaît │  anneau "incoming" apparaît → │
│    près du bord GAUCHE si     │    près du bord DROIT si      │
│    tir venant de P2           │    tir venant de P1           │
│                               │                               │
│ [1][2][3] icônes-objets bas-  │   bas-droite, inversé [8][9][0]│
│  gauche, radial cooldown      │   radial cooldown autour de   │
│  autour de chaque icône,      │   chaque icône                │
│  icône = sticker réel de      │                               │
│  l'objet photographié         │                               │
│                               │                               │
│ [ ] jauge de blocage/charge   │        jauge miroir [ ]       │
│   fine sous les armes,        │                               │
│   visible seulement en train  │                               │
│   de bloquer ou charger       │                               │
└─────────────────────────────┴─────────────────────────────┘
        centre : ligne de séparation fine (2-4 px), teinte
        neutre — PAS rouge/bleu pour ne pas empiéter sur le
        code couleur des deux joueurs.

  Bannières plein écran (les 2 vues) : READY? → GO! → PERFECT!
  / KO / GAME! — 30-40 pt, contraste fort, durée courte (0,3-0,6 s),
  jamais superposées à une icône d'arme.
```

Détails :
- % : taille de police ≥ 30 pt (point 11), tremble légèrement et vire au rouge après ~100 % (référence directe à l'esthétique Smash, sans texture ou dégradé superflu).
- Icônes d'armes = sticker Nano Banana de l'objet réel, cadre radial de cooldown autour, pas de texte "1.2s" affiché sauf pendant le chargement (progressive disclosure, point 12).
- L'anneau `projectile:incoming` doit apparaître à la fois autour du perso menacé (déjà prévu) ET comme un repère de bord d'écran orienté vers la source, pour être visible même en vision périphérique (points 6, 8).
- Ligne de séparation centrale neutre pour ne pas créer un 3e "camp" de couleur qui brouillerait le code P1 rouge/P2 bleu (point 7).

## 3. 8 idées créatives peu coûteuses (< 1 h chacune)

1. **Icônes d'armes = vrai sticker scanné, pas une icône générique.** Déjà presque acquis via Nano Banana : s'assurer que le HUD affiche bien le sticker réel de l'objet (banane, chaussure, etc.) et non un pictogramme "grenade/blaster" — effet "waouh" immédiat car le jury reconnaît l'objet qu'il a vu scanné 30 secondes plus tôt.
2. **Le cadre de cooldown se remplit avec la texture/couleur dominante de l'objet scanné** (extraite au moment du scan), pas une couleur HUD générique — renforce le lien objet réel → arme du jeu.
3. **Mini-portrait du visage du joueur (photo prise en intro) à côté de sa barre de vie**, comme un visage de combattant façon jeu de baston — coût faible (une capture webcam déjà utilisée pour le perso), impact fort sur la personnalisation.
4. **Le texte "PERFECT!" de la parade parfaite est prononcé en même temps par l'animateur IA vocal, en synchro à ±100 ms** — un simple événement JS supplémentaire sur `parry:result`, effet waouh car voix + texte se répondent.
5. **L'anneau `projectile:incoming` change de couleur selon l'arme qui arrive** (ex. jaune pour blaster, vert pour grenade) — un seul mapping couleur à ajouter, donne au joueur un début de lisibilité tactique sans expliquer les armes à l'oral.
6. **Flash de bord d'écran teinté avec la couleur de l'objet qui vient de toucher**, pas juste rouge générique — réutilise l'extraction de couleur de l'idée 2, cohérence visuelle immédiate.
7. **Bannière GAME! affiche automatiquement une miniature des 2 objets scannés vainqueurs**, façon "arme du combat" — flatte le concept "n'importe quel objet devient une arme" jusqu'à l'écran de fin, sans texte à écrire.
8. **Au compte à rebours GO!, les 2 icônes d'arme principales de chaque joueur "claquent" à l'écran avec un petit rebond (spring, 150-200 ms)** au lieu d'apparaître statiques — un seul effet CSS `transform: scale` avec easing, contraste net avec un HUD qui apparaîtrait "plat" ou instantané.

## 4. Grille d'évaluation (critique sur captures d'écran)

| Critère | /10 | Seuil mesurable |
|---|---|---|
| Lisibilité du % à distance | /10 | Police ≥ 30 pt effectif sur la capture pleine résolution ; contraste texte/fond ≥ 4.5:1 (WCAG AA) ; ≤ 8/10 si le chiffre est confondable avec le fond en 1 coup d'œil de 2 s |
| Symétrie P1/P2 | /10 | Miroir exact des positions (écart de position < 5 % de la largeur d'un demi-écran) ; -3 points si un joueur a un élément que l'autre n'a pas |
| Distinction couleur des joueurs | /10 | P1/P2 distinguables en simulation daltonisme (deutéranopie/protanopie) ; -5 points si confusion possible sans la forme/icône en appui |
| Lisibilité du cooldown | /10 | Compréhensible en < 1 s sans lire de chiffre (radial/silhouette visible) ; icônes = objet réel reconnaissable, pas une forme générique |
| Bruit visuel / éléments superflus | /10 | Nombre d'éléments HUD simultanément visibles en combat normal ≤ 8 par demi-écran (hors bannières) ; -1 point par élément surnuméraire |
| Réactivité perçue (pas de retard visible) | /10 | Aucun délai visible > 1 frame (16 ms) entre événement (hit, cooldown fini) et mise à jour HUD sur la capture/vidéo |
| Indicateur de menace hors-champ (`incoming`) | /10 | Visible en périphérie sans fixer le centre ; orienté correctement vers la source ; apparaît ≥ 300 ms avant impact sur la capture |
| Cohérence avec l'objet réel scanné | /10 | Icône/couleur du HUD reconnaissable comme provenant de l'objet photographié, pas une icône stock |
| Impact démo / effet waouh | /10 | Un spectateur non-joueur identifie l'état du combat (qui gagne, qui va perdre) en < 3 s sur une capture figée |

Note globale = moyenne des 9 critères. Seuil de refus aligné sur `critique-aaa` : < 7 avant 15h, < 8 après.

## Sources

- [Split-Screen Game Development Challenges](https://salivity.github.io/game-development/article/split-screen-game-development-challenges)
- [Game HUD Design: Types, Best Practices — Argentics](https://www.argentics.io/game-hud-design)
- [The Diegetic Dilemma — indieklem](https://indieklem.substack.com/p/19-the-diegetic-dilemma-benefits)
- [Beyond the HUD: Diegetic Interfaces — Wayline](https://www.wayline.io/blog/diegetic-interfaces-game-design)
- [Unlocking Colorblind Friendly Game Design — Chris Fairfield](https://chrisfairfield.com/unlocking-colorblind-friendly-game-design/)
- [Color-Blindness Accessibility Guide — Can I Play That?](https://caniplaythat.com/2020/01/29/color-blindness-accessibility-guide/)
- [Positioning On-Screen Indicators to Point to Off-Screen Targets — Envato Tuts+](https://code.tutsplus.com/positioning-on-screen-indicators-to-point-to-off-screen-targets--gamedev-6644t)
- [Animation performance and frame rate — MDN](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate)
- [Use transform and opacity for animations — Front-End Checklist](https://frontendchecklist.io/rules/css/animation-performance)
- [How big is big enough? The 8H Rule — Presentation Guild](https://presentationguild.org/how-big-big-enough-the-8h-rule-reveals-all/)
- [Font Size and Legibility for Videowall Content — Extron](https://www.extron.com/article/videowallfontsize)
- [Damage meter — SmashWiki](https://www.ssbwiki.com/Damage_meter)
