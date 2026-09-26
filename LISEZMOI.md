# Harnais Voodoo-Hack — mode d'emploi

Ce dossier transforme Claude Code en petit studio : des **skills** (fiches de savoir-faire que Claude lit tout seul quand le sujet arrive), des **agents** (des Claude spécialisés qui n'ont pas écrit le code et le jugent sans indulgence) et des **hooks** (automatismes qui se déclenchent seuls).

## Installer sur le 1er PC (10 min, ce soir)
0. Le projet de jeu Vite existe déjà à la racine du dépôt (`package.json`, `tsconfig.json`) : **le dépôt actuel EST la base**, rien à créer. N'utilise JAMAIS le script `create_threejs_game.py` du pack threejs-game-skills (même archivé dans `reference/`) : il écrase `package.json` et `tsconfig.json`, donc le projet existant.
1. Copier tout le contenu de ce dossier (y compris le dossier caché `.claude`) à la racine du projet du jeu, si ce n'est pas déjà fait.
2. PowerShell dans ce dossier : `powershell -ExecutionPolicy Bypass -File .\tools\installer.ps1`
3. Lancer `claude`. Accepter la « confiance du dossier » (sinon les automatismes ne tournent pas).
4. Test : demander « lance l'agent inspecteur-harnais ». Il doit rendre une note et une liste.

## Installer sur un 2e PC (5 min)
Le 1er PC a déjà créé le projet et poussé. Ici, pas besoin de l'installeur (réservé au 1er PC) :
1. Cloner le dépôt : `git clone <url>` (ou `git pull` si déjà cloné).
2. `npm ci` (installe exactement les paquets déjà verrouillés — plus rapide et plus sûr que `npm i`).
3. `npx playwright install chromium` (le navigateur piloté par les captures ne s'installe pas avec `npm ci`).
4. `git config --global user.name "Prénom"` et `git config --global user.email "mail"`, si pas déjà fait ailleurs (sinon les commits automatiques échouent).
5. Copier `.env.example` en `.env` et remplir les clés API (fichier jamais commité).
6. Lancer `claude`, accepter la « confiance du dossier ».

## Ce qui tourne tout seul
- Git doit connaître votre nom (l'installeur le demande), sinon aucune sauvegarde automatique.
- **Au démarrage** : Claude reçoit l'heure et le temps restant avant le gel de 18h.
- **À chaque message envoyé** : rappel court d'une ligne (heure, temps avant le gel de 18h, opt-in, démo).
- **Avant chaque commande** : blocage des gestes dangereux (push forcé, suppressions massives, lecture ou commit de la clé API).
- **À chaque fin de réponse** (si du code a changé) : le jeu est compilé. S'il est cassé, Claude doit réparer avant de s'arrêter (une seule relance ; si ça reste cassé, un message le dit à l'humain). S'il marche, un commit est fait automatiquement (une sauvegarde datée).

## Rituel de synchro (à la main, au moins toutes les heures)
Les sauvegardes automatiques ne font qu'un commit EN LOCAL. Personne ne pousse à ta place :
1. `git pull --no-rebase`
2. `git push`
Sinon le travail de l'équipe reste bloqué sur une seule machine.

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
| `relecteur` | pour vérifier qu'un diff respecte son lot (`plan/lots/*.md`) et `CLAUDE.md` | conforme / à réparer / à arbitrer, preuve fichier:ligne (ne modifie rien) |

## Les skills (Claude les charge seul, on peut aussi les citer)
`anti-slop` · `direction-artistique` · `rendu-premium` · `game-feel` · `moments-wow` · `demo-2min` · `ia-en-jeu` · `son` · `discipline-code` · `threejs-debug-profiler` · `threejs-game-ui-designer` (les 2 seuls du pack Three.js externe encore actifs ; le reste du pack est archivé, en lecture seule, dans `reference/threejs-game-skills/`).

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
