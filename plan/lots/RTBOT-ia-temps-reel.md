# Lot RTBOT · Adversaire IA en temps réel (un juré seul doit pouvoir jouer)
Exécution : **agent Claude (Opus, game design)** · Les jurés testent sur leur propre ordinateur, souvent seuls : le mode **vs AI** devient indispensable. Le jeu est en temps réel (`plan/PIVOT-TEMPS-REEL.md`).

## Principe
- **Solo** : l'humain est P1, en plein écran (vue unique, voir RTVIEW) ; le bot joue P2.
- Le bot pilote P2 **uniquement par les entrées**, comme un joueur : `gameHooks.input(player, action, down)` (contrat du pivot, codé par RTCORE en parallèle). Si ce hook n'existe pas encore dans ta copie, code contre ce contrat et ajoute un simulateur d'entrées minimal derrière un drapeau, que tu enlèveras à la fusion.
- **Réflexe à 20 Hz, local et déterministe** : machine à états avec les comportements suivants.
  - **Approche** jusqu'à la portée idéale de l'arme choisie : blaster 8-12 m, grenade 10-16 m, throwable 5-9 m.
  - **Mitraillage latéral** et changement de direction toutes les 1 à 2,5 s.
  - **Saut** au-dessus d'un projectile au sol ou vers une plateforme.
  - **Blocage** quand un projectile arrive (`projectile:incoming`), avec un temps de réaction selon la difficulté, et une parade parfaite avec une probabilité selon la difficulté.
  - **Tir** quand la ligne de tir est libre et que l'arme est prête, avec la charge adaptée.
  - **Caisse Snap** : il la prend si elle est plus proche de lui que de l'humain.
  - **Survie** : il s'éloigne du bord quand son % est haut, et remonte avec le double saut s'il tombe.
- **Difficultés** : réutilise `src/gameplay/difficulty.ts` (Facile, Moyen, Difficile, Hardcore) :
  - temps de réaction : 450 / 300 / 200 / 130 ms ;
  - précision et taux de parade parfaite ;
  - agressivité.
- **Gemini stratège** (l'IA reste indispensable pour le jury DeepMind) : toutes les 8 s, le bot envoie un résumé du combat à `/api/ai-move`. Le résumé contient les % des 2 joueurs, les distances, l'arme la plus utilisée par l'humain, les parades réussies et la position par rapport au bord.
  - Gemini répond en JSON contraint : `{ stance: 'aggressive'|'defensive'|'edgeguard'|'bait', preferredWeapon: 0|1|2, taunt: string (≤ 8 mots) }`.
  - Le réflexe applique la posture choisie.
  - Si pas de réponse en 2 s, le bot garde sa posture actuelle.
  - Le lot LX avait écrit `api/ai-move.ts` pour le tour par tour : adapte-le.
- **Provocation** : bulle au-dessus du bot (`taunt-bubble.ts` existe) + bark de voix du rôle.

## Tes chemins
`src/gameplay/ai/**` (réécriture complète du bot tour par tour), `api/ai-move.ts`. Branche le mode solo en coordination avec LUX (bouton vs AI + difficulté sur l'écran-titre : son `screenTitle.ts` existe déjà) et RTCORE / RTVIEW (`startMatch({ vsAI: true, difficulty, split: false })`). Modifications minimales hors de tes chemins, signalées dans ton rendu.

## Contrôles
- `npm run build` passe.
- Test Playwright (port 5300-5399) : un match solo où l'humain est simulé par un script simple. En Moyen, le bot doit gagner environ 50 % des 10 matchs simulés, et Facile doit être facile. Donne les chiffres.
- Mesure : temps de réponse de Gemini, et taux de maintien de la posture quand Gemini ne répond pas.
