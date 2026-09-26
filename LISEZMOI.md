# Harnais Voodoo-Hack — mode d'emploi

Ce dossier transforme Claude Code en petit studio : des **skills** (fiches de savoir-faire que Claude lit tout seul quand le sujet arrive), des **agents** (des Claude spécialisés qui n'ont pas écrit le code et le jugent sans indulgence) et des **hooks** (automatismes qui se déclenchent seuls).

## Installer (10 min, ce soir, sur chaque PC)
0. Il faut un projet de jeu Vite à la racine du dépôt. Deux façons :
   - base vierge : `npm create vite@latest . -- --template vanilla` (ou `vanilla-ts` pour TypeScript), puis `npm i three` ;
   - base du pack threejs-game-skills (TypeScript, plus complète) : demander à Claude « démarre le projet avec la base du pack threejs-game-skills », APRÈS l'installation.
   Dans les deux cas, une seule personne le fait, pousse, et l'autre récupère (`git pull`).
1. Copier tout le contenu de ce dossier (y compris le dossier caché `.claude`) à la racine du projet du jeu.
2. PowerShell dans ce dossier : `powershell -ExecutionPolicy Bypass -File .\tools\installer.ps1`
3. Lancer `claude`. Accepter la « confiance du dossier » (sinon les automatismes ne tournent pas).
4. Test : demander « lance l'agent inspecteur-harnais ». Il doit rendre une note et une liste.

## Ce qui tourne tout seul
- Git doit connaître votre nom (l'installeur le demande), sinon aucune sauvegarde automatique.
- **Au démarrage** : Claude reçoit l'heure et le temps restant avant le gel de 18h.
- **Avant chaque commande** : blocage des gestes dangereux (push forcé, lecture ou commit de la clé API).
- **À chaque fin de réponse** (si du code a changé) : le jeu est compilé. S'il est cassé, Claude doit réparer avant de s'arrêter. S'il marche, un commit est fait automatiquement (une sauvegarde datée).

## Les agents — quand les appeler
Écrire simplement : « lance l'agent X », ou taper `@` puis le nom. Plusieurs d'un coup : « lance playtesteur et critique-aaa en parallèle ».

| Agent | Quand | Rend |
|---|---|---|
| `chasseur-de-wow` | au début, et quand c'est « bien mais pas mémorable » | 7 idées de surprise chiffrées en minutes |
| `directeur-artistique` | au début (3 directions), puis sur tout visuel | note + corrections + 1 idée visuelle |
| `playtesteur` | après chaque changement de code | bugs reproductibles, frustrations |
| `auditeur-juice` | après chaque nouvelle action jouable | actions « mortes » à réveiller |
| `critique-aaa` | au plus 1 fois par heure, sur le parcours de démo | note /10, refus sous 7 avant 15h, sous 8 ensuite |
| `red-team-ia` | quand l'IA est branchée, avant 18h | failles de l'IA adverse |
| `jury-simule` | toutes les 2 h | à quelle seconde le jury décroche |
| `coupeur` | toutes les 2 h ou en cas d'hésitation | ce qu'on coupe, les 3 prochaines tâches |
| `inspecteur-harnais` | ce soir, et si on modifie `.claude/` | défauts du harnais lui-même |

## Les skills (Claude les charge seul, on peut aussi les citer)
`anti-slop` · `direction-artistique` · `rendu-premium` · `game-feel` · `moments-wow` · `demo-2min` · `ia-en-jeu` · `son` · `discipline-code` (+ le pack Three.js externe installé par le script).

## Commandes utiles
- `npm run verifier` : compile + captures + erreurs + images/seconde.
- `npm run captures` : joue le parcours de démo (`demo/parcours.json`) et capture chaque étape.
- `npm run video` : enregistre le parcours de démo en vidéo (`captures/video/`) — c'est la vidéo de secours.
- `npm run planche` : met chaque capture à côté des images de référence (`art/references/`) et en noir et blanc.
- Les captures sont dans `captures/` : ouvre-les, c'est ce que voit le jury.

## Le rythme de la journée
construire → `npm run verifier` → l'agent qui correspond (playtesteur si le gameplay change, auditeur-juice si c'est une action, directeur-artistique si c'est visuel) → corriger (5 points max). `critique-aaa` une fois par heure. Après 2 refus sur le même point, c'est vous qui tranchez. À **18h**, plus aucune nouvelle fonctionnalité. À **19h**, opt-in + `npm run video`.

## Pour que les agents voient le jeu, le code doit exposer
- `window.gameState` : l'état du jeu en JSON (score, vies, action en cours…).
- `window.gameHooks` : `action(texte)`, `forcerVictoire()`, `setSeed(n)` (à adapter au jeu).
- En `?demo=1`, la régie au clavier : F1 à F5 pour chaque moment de la démo, F9 panique.
Demander à Claude de les créer dès la première heure.
