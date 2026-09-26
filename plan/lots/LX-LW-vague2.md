# Vague 2 (après la boucle jouable de 15h)

## Lot LX · Adversaire IA
Responsable : Adem · Coût : moyen · Dépend de : LG · Chemins : `src/gameplay/ai/**`

- **Coup déterministe** : on note chaque combinaison de déplacement et de tir possible (dégâts attendus, chance d'éjection, couvert, Caisse Snap), puis on choisit selon la difficulté.
- **Gemini** choisit parmi les 3 meilleurs coups, avec repli sur le choix scripté au-delà de 1,5 s. Il assure aussi les provocations.
- **Parade de l'IA** : probabilité selon la difficulté, avec un timing bruité.

## Lot LW · Scandex + voix clonée
Responsable : partagé · Coût : faible

- **Scandex** (Titouan) : collection de toutes les armes scannées, gardée dans le `localStorage`, visible au menu et en fin de match. Chemins : `src/ui/scandex/**`.
- **Voix clonée** (Adem) : le joueur lit une phrase de 10 s au micro, Gradium clone sa voix, et son perso lance ses provocations avec elle. Chemins : `api/voice-clone.ts`, `src/ia/voice/**`.
