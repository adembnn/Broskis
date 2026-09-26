# Harnais Voodoo-Hack — AI Gaming Hack (Paris)

## Le jeu : BROSKIS (plan complet : `plan/README.md`, lots : `plan/lots/`, suivi : `plan/SUIVI.md`)
- Concept en une phrase : « Snap any real object: it becomes your weapon. » Duels 3D cartoon au tour par tour à 2 sur le même PC, sur des maps qui s'effondrent (façon Smash), commentés par un animateur de ring IA.
- Boucle de jeu (10 s) : la caméra tourne vers le joueur actif → il se déplace (6 m + 1 saut) → vise et tire avec une de ses 3 armes-objets → l'autre pare avec ESPACE au bon moment → impact, décor qui réagit, réplique vocale de l'animateur.
- Rôle de l'IA (impossible sans elle) : n'importe quel objet photographié devient une arme jouable (Gemini : catégorie, stats, trait ; Nano Banana : sticker 3D) ; une photo devient un combattant ; l'animateur (Gemini + voix Gradium) connaît vos armes et commente vos coups.
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

## Boucle de travail
construire → `npm run verifier` (toujours) → `playtesteur` si le gameplay a changé · `auditeur-juice` si c'est une nouvelle action · `directeur-artistique` si c'est visuel.
`critique-aaa` : au plus une fois par heure, sur le parcours de démo. Seuil : **refus sous 7 avant 15h, sous 8 ensuite**. Après 2 refus d'affilée sur le même point, l'humain tranche.
Toutes les 2 h : `jury-simule` + `coupeur`. Au démarrage et quand c'est « bien mais pas mémorable » : `chasseur-de-wow`. Avant 18h : `red-team-ia`.

## Code
- `window.gameState` (état du jeu en JSON) et `window.gameHooks` (fonctions pour piloter le jeu par script) sont OBLIGATOIRES : les agents testent par là, pas en devinant des clics.
- `?demo=1` dans l'URL = mode démo : graine aléatoire fixe, IA en cache si le réseau tombe.
- Découpage pour éviter les conflits : personne A → `src/ia/`, `src/gameplay/`, `src/ui/` · personne B → `src/scene/`, `src/art/`, `src/audio/`. Le fichier d'entrée (`src/main.*`) ne fait qu'assembler.
- Pack externe threejs-game-skills (installé par `tools/installer.ps1`) : sa base de projet TypeScript est autorisée pour DÉMARRER le jeu, une seule fois, au début. Ensuite, on ne change plus de fondations. S'il expose déjà ses propres fonctions de test, les brancher aussi sur `window.gameHooks`.
- Modèles fournis : `demo/SCRIPT.md` (script de démo) et `src/art/tokens.js` (tokens à remplir par le directeur artistique).
- Une seule personne installe les paquets npm, pour éviter les conflits sur `package-lock.json`.

## Horaire
10h30 concept figé + direction artistique choisie · 12h00 script de démo · 15h00 boucle jouable belle · 18h00 **GEL des fonctionnalités** · 18h–19h polish seulement · 19h opt-in + vidéo de secours · 19h30 répétition chronométrée.
