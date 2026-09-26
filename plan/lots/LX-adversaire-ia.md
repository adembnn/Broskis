# Lot LX · Adversaire IA (mode « vs AI »)
> **Obsolète depuis le pivot temps réel (15h25)** pour : IA au tour par tour ; remplacée par RTBOT (`plan/lots/RTBOT-ia-temps-reel.md`). Référence : `plan/PIVOT-TEMPS-REEL.md`.
Exécution : **Gemini** · Dépend de : LG, LK, LBAL (fusionnés) · Démo : l'IA doit être **indispensable** (jury DeepMind), pas décorative.

## Ce que voit le joueur
1. Écran-titre : le bouton **vs AI** est actif (plus de « coming soon »). Un clic ouvre 4 boutons de difficulté : **EASY · MEDIUM · HARD · HARDCORE**, puis le parcours habituel (perso, arsenal, map). L'IA joue **P2 (bleu)**.
2. Au tour de l'IA, elle **joue comme un humain, visiblement** :
   - 0,5 s de « réflexion » : une bulle au-dessus de son perso affiche une **provocation** écrite par Gemini (8 mots maximum, anglais, drôle, dans le personnage), par exemple « That spatula? CUTE. »
   - elle marche jusqu'à sa position (déplacement réel par les hooks, pas une téléportation), saute si le coup le demande ;
   - elle choisit son arme (1/2/3), vise pendant 0,8 s (la trajectoire en pointillés s'affiche comme pour un humain), charge, puis tire ;
   - elle utilise les **feintes** et le **NICE!** selon sa difficulté (`feintRate`, `niceRate`).
3. Quand l'humain attaque, l'IA **pare** avec une probabilité et un timing bruité selon sa difficulté.

## Tes chemins
- `src/gameplay/ai/**` (nouveau) : `index.ts` (install), `planner.ts` (coups possibles et score), `brain.ts` (appel Gemini + repli), `parry-bot.ts`, `taunt-bubble.ts`.
- `api/ai-move.ts` (nouveau) : fonction serveur, même format que `api/commentary.ts` (lis-le).
- `src/ui/screenTitle.ts` et, si nécessaire, **quelques lignes** de `src/ui/index.ts` pour passer le mode au lancement.
- `src/core/types.ts` : ajoute seulement `vsAI?: boolean` et `difficulty?: 'easy' | 'medium' | 'hard' | 'hardcore'` à `StartMatchOptions`, et `vsAI: boolean` + `difficulty: ...` à `GameState` (valeurs par défaut dans `src/core/state.ts`).
- `src/gameplay/index.ts` : une ligne pour installer l'IA.
- Ne touche à rien d'autre. Un autre agent modifie en ce moment `src/scene/fighters/**`, `src/scene/animation/**` et `src/scene/camera/**` : n'y touche pas.

## Comment l'IA joue (réutilise l'existant, ne réécris pas les règles)
- **Actions** : exclusivement via les hooks `ctx.hooks` / `window.gameHooks` (`move(dx, dz)`, `jump()`, `pickWeapon(i)`, `aim(yawDeg, pitchDeg)`, `fire(power)`, `parry(offsetMs?)`). Lis `src/gameplay/hooks.ts` pour leur comportement exact et `src/gameplay/movement.ts` pour le budget (6 m + saut 1,5 m).
- **Difficulté** : `src/gameplay/difficulty.ts` (lot LBAL) contient déjà les 4 réglages (`DIFFICULTY_LEVELS` : `Facile`, `Moyen`, `Difficile`, `Hardcore` → easy, medium, hard, hardcore). Utilise `aimSigmaYaw`, `aimSigmaPower`, `attackChoice`, `attackErrorRate`, `parrySigmaMs`, `parryMissRate`, `feintRate`, `niceRate`. `AdaptiveDifficulty` ajuste d'un match à l'autre.
- **Planificateur déterministe** (`planner.ts`) : 12 à 20 positions candidates atteignables dans le budget (cercle autour du perso + la Caisse Snap si elle est au sol), × les armes prêtes (hors recharge) × quelques angles/puissances. Score de chaque coup :
  - dégâts attendus (`src/gameplay/rules.ts` / `damage.ts` : réutilise leurs fonctions, ne les recopie pas) ;
  - chance d'éjection (recul vers le vide le plus proche, utilise `trajectory.ts`) ;
  - danger de sa propre position (bord, dalle annoncée qui va tomber : événements `map:warn`) ;
  - bonus Caisse Snap.
  - Simule la trajectoire avec `src/gameplay/trajectory.ts` pour vérifier que le tir touche.
- **Gemini** (`brain.ts` → `POST /api/ai-move`) : envoie l'état résumé (PV, positions, distance au bord, armes des 2 joueurs) + les **3 meilleurs coups** (id, description courte en anglais, score). Gemini renvoie `{ choice: 0|1|2, taunt: string }` en JSON contraint. Modèle `GEMINI_TEXT_MODEL` de `api/_models.ts`, réflexion minimale. Persona : un rival cartoon arrogant qui commente ses propres choix (« Going for the ledge. Bye bye. »). Filtre : 8 mots max, anglais, pas d'insulte réelle, jamais le mot « AI ».
  - **Repli** : si pas de réponse en 1,5 s, ou erreur, l'IA prend le meilleur coup scripté et une provocation tirée d'une liste locale de 20 répliques.
  - Journal : appelle le point d'entrée du tableau de bord seulement côté outils, jamais depuis le navigateur.
- **Parade** (`parry-bot.ts`) : écoute `parry:window` (défenseur = IA) ; avec une probabilité `1 - parryMissRate`, appelle `hooks.parry(offset)` où `offset` suit une loi normale d'écart-type `parrySigmaMs`, programmé pour tomber à `tImpact`.
- **Provocation** : bulle HTML style « Vinyle » (voir `src/art/tokens.js` et `src/ui/`) au-dessus du perso IA, 2,5 s, et émet `commentary:line` avec priorité basse (pour que l'animateur puisse réagir). Si `src/audio/barks.ts` exporte `playBark`, joue la réplique `taunt_turn` du rôle du perso.
- **Temps** : un tour IA complet dure 3 à 6 s, jamais plus. Jamais d'attente bloquante sur Gemini au-delà de 1,5 s.

## Contrôles
- `npm run build` passe.
- Test par script Playwright (port libre 5300-5399, garde le PID du serveur, arrête-le à la fin) : `startMatch({ vsAI: true, difficulty: 'medium', map: 'archipel' })`, puis simule l'humain avec les hooks (déplacement + tir) ; vérifie que l'IA **joue 3 tours complets** (déplacement, tir) et qu'elle **pare** au moins une fois sur 5 attaques en `hard`.
- Captures dans `captures/lx/` : la bulle de provocation, l'IA en train de viser.
- Mesure dans le rendu : temps moyen de réponse de `/api/ai-move`, taux de repli.
