# Harnais Voodoo-Hack — AI Gaming Hack (Paris)

## Le jeu : BROSKIS (plan complet : `plan/README.md`, lots : `plan/lots/`, suivi : `plan/SUIVI.md`)
- Concept en une phrase : « Snap any real object: it becomes your weapon. » Duels 3D cartoon en temps réel à 2 sur le même PC, écran scindé (P1 gauche, P2 droite), sur des maps qui s'effondrent (façon Smash), commentés par un animateur de ring IA. Référence depuis le pivot de 15h25 : `plan/PIVOT-TEMPS-REEL.md`.
- Boucle de jeu (10 s) : on court autour de l'adversaire (visée verrouillée) → on tire ou charge une de ses 3 armes-objets dès qu'elle est rechargée → on bloque ou on pare (moins de 150 ms avant l'impact) quand l'anneau se referme → impact, décor qui réagit, réplique vocale de l'animateur.
- Touches (réglables dans Settings, manettes acceptées) : P1 ZQSD, ESPACE saut ×2, F tir (maintenir = charger), G bloquer/parer, 1-2-3 armes · P2 flèches, MAJ DROITE, L, K, 8-9-0.
- Rôle de l'IA (impossible sans elle) : n'importe quel objet photographié devient une arme jouable (Gemini : catégorie, stats, trait ; Nano Banana : sticker 3D) ; une photo devient un combattant ; l'animateur (Gemini, voix Fenrir) connaît vos armes et commente vos coups ; les combattants crient en voix Gradium (clonée depuis 12 s de micro si possible).
- Tout le texte du jeu est en **anglais**. Sous-agents : Sonnet (effort medium) par défaut, Opus seulement pour le design et le game design.

Stack : jeu web 3D (Three.js + Vite, JavaScript ou TypeScript), IA Gemini au cœur du gameplay.
Jury : Voodoo (jeu compris en 3 s) + Google DeepMind (IA indispensable). **Démo live 2 min à 20h. Opt-in avant 19h.**

## La seule question qui compte
« Est-ce que ça rend les 2 minutes de démo plus belles ou plus surprenantes ? » Si non → on ne le fait pas.

## Règles (non négociables)
1. **Parcours de démo d'abord.** `demo/SCRIPT.md` est écrit avant midi. Chaque tâche sert une seconde de ce script. Hors script = brut autorisé, jamais montré.
2. **Beauté mesurée, pas déclarée.** Rien n'est « fini » sans capture d'écran regardée (`node tools/capture.mjs`). Jamais « c'est fait » sans avoir vu le jeu tourner.
3. **Zéro AI slop.** Skill `anti-slop`. Le premier réflexe est presque toujours le mauvais.
4. **Tokens avant écrans.** Couleurs, lumières, typos, durées vivent dans `src/art/tokens.js`. Aucune valeur visuelle écrite en dur ailleurs.
5. **Supprimer avant d'ajouter.** Chaque élément doit justifier sa présence.
6. **L'IA interprète, le code arbitre.** Gemini transforme l'intention du joueur en paramètres ; le code décide des dégâts et de la victoire. Délais : voir la table unique du skill `ia-en-jeu`.
7. **Le jeu tourne toujours.** Un build cassé bloque la fin de la réponse (hook automatique, une relance maximum : si ça reste cassé, le dire à l'humain). Rien de cassé ne reste 20 min.
8. **Expliquer en français clair.** Tout terme technique est défini à sa première apparition. Donner un point d'avancement en 2 lignes toutes les 5–10 min.
9. **Écran scindé : chaque vue reste toujours sur son joueur** (gauche = P1, droite = P2) ; aucune bascule de point de vue ni mouvement de caméra partagé (règle d'Adem).

## Boucle de travail
construire → `npm run verifier` (toujours) → `playtesteur` si le gameplay a changé · `auditeur-juice` si c'est une nouvelle action · `directeur-artistique` si c'est visuel · `critique-perf` si le rendu, les maps, les effets ou le HUD ont changé · `juge-maps` si une map a changé.
`critique-aaa` : au plus une fois par heure, sur le parcours de démo. Seuil : **refus sous 7 avant 15h, sous 8 ensuite**. Après 2 refus d'affilée sur le même point, l'humain tranche.
Toutes les 2 h : `jury-simule` + `coupeur`. Au démarrage et quand c'est « bien mais pas mémorable » : `chasseur-de-wow`. Avant 18h : `red-team-ia`, `equilibreur` et `critique-perf` (refus sous 8).

## Code
- `window.gameState` (état du jeu en JSON) et `window.gameHooks` (fonctions pour piloter le jeu par script) sont OBLIGATOIRES : les agents testent par là, pas en devinant des clics. Hooks temps réel (`src/core/types.ts`) : `startMatch({ split: true })`, `input(player, action, down)` (actions `up` `down` `left` `right` `jump` `weapon1-3` `fire` `parry`), `setSeed(n)`, `forcerVictoire(p)`, `scanObjectFromUrl(url)`, `scanFighterFromUrl(url, player)`. `move`, `jump`, `fire`, `parry`… sont des raccourcis hérités du tour par tour (P1 seulement).
- **Tester uniquement la dernière version** (règle d'Adem, 16h18) : avant tout test ou capture, `git rebase main` (ou partir de main à jour) et relancer son Vite ; un match se lance par `startMatch({ split: true })` et on vérifie `gameState.phase === 'fight'`. Tout test encore en tour par tour (phases `turn-intro`/`move`/`aim`) est faux : l'arrêter. Arrêter ses propres serveurs de test quand on a fini (seulement le PID qu'on a lancé).
- `?demo=1` dans l'URL = mode démo : graine aléatoire fixe, IA en cache si le réseau tombe.
- Découpage pour éviter les conflits : personne A → `src/ia/`, `src/gameplay/`, `src/ui/` · personne B → `src/scene/`, `src/art/`, `src/audio/`. Le fichier d'entrée (`src/main.*`) ne fait qu'assembler.
- Pack externe threejs-game-skills : le dépôt actuel EST déjà la base du jeu (`package.json`, `tsconfig.json` présents). Son script `create_threejs_game.py` est **interdit** : il écrase `package.json` et `tsconfig.json`, donc le projet existant. Ne jamais le lancer, même « juste pour voir ». Ce qui reste utile du pack est archivé en lecture seule dans `reference/threejs-game-skills/` ; seuls `threejs-debug-profiler` et `threejs-game-ui-designer` restent des skills actifs dans `.claude/skills/`.
- Modèles fournis : `demo/SCRIPT.md` (script de démo) et `src/art/tokens.js` (tokens à remplir par le directeur artistique).
- Une seule personne installe les paquets npm, pour éviter les conflits sur `package-lock.json`.

## Quel skill pour quelle tâche
- Scène (3D, lumière, matériaux, post-traitement) → skill `rendu-premium`.
- Action jouable (impact, retour, caméra) → skills `game-feel` + `son`.
- IA (Gemini, animateur, délais) → skill `ia-en-jeu`.
- Git (commits, branches, conflits) → skill `discipline-code`.

## Horaire
10h30 concept figé + direction artistique choisie · 12h00 script de démo · 15h00 boucle jouable belle · **gel de 18h levé par Adem (17h35) : on continue de livrer jusqu'à la démo** · 19h opt-in + vidéo de secours · 19h30 répétition chronométrée.
