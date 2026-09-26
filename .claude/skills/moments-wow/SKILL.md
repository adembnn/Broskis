---
name: moments-wow
description: Catalogue de techniques de surprise et de « moments wow » pour une démo de jeu devant un jury. À utiliser pour l'idéation, pour choisir le climax de la démo, et quand le jeu est « bien mais pas mémorable ».
---

# Moments wow

Un moment wow = une seconde où le jury réagit physiquement (rire, « oh ! », se pencher). Il en faut **un par 30 secondes de démo**, et un climax.

## Les 4 ressorts de la surprise
1. **Rupture d'échelle** : le petit devient immense (un murmure qui fait trembler tout le décor), ou l'inverse.
2. **Le monde réagit** : le décor, le public, la musique répondent à ce que fait le joueur. Le monde est vivant.
3. **L'IA fait l'impossible** : quelque chose qu'aucun jeu scripté ne pourrait faire (l'adversaire cite ta phrase, invente une riposte à ton idée absurde, se souvient de ton habitude).
4. **Le quatrième mur** : le jeu parle au jury, à la salle, au présentateur.

## Banque d'idées (à adapter au jeu, à trier, pas tout faire)
- **Le jury crée** : un membre du jury dicte une idée absurde (« une pluie de baguettes de pain ») → elle existe dans le jeu 2 s plus tard, avec son nom et son effet. Le meilleur wow possible pour DeepMind.
- **L'IA qui a lu la partie** : un personnage commente un détail réel de ce que le joueur vient de faire (« Tu tournes toujours à gauche… »).
- **Le ralenti sur l'instant décisif** : temps figé, caméra qui tourne, particules suspendues, puis tout repart.
- **Le public vote** : une foule réagit (applaudit, hue, lance des objets) et son humeur change la lumière et la musique.
- **La règle absurde** : une loi tombe (« la gravité est au plafond ») et le décor bascule réellement.
- **Première mondiale** : bannière dorée quand un joueur crée une combinaison jamais vue.
- **Le générique** : en fin de partie, l'IA raconte la partie en 3 lignes, lues par une voix (Gradium).
- **La commande dictée à voix haute** : un juré parle dans le micro, la reconnaissance vocale de Chrome (Web Speech API, `lang='fr-FR'`) transcrit, et la phrase s'écrit à l'écran lettre par lettre, à l'encre, pendant que Gemini répond. L'attente devient un spectacle. Plan B : champ texte.
- **Le souvenir** : chaque moment fort de la partie devient une carte ou une page illustrée (image pré-générée, palette des tokens) ; le QR code final mène à cette galerie. Le jury repart avec un souvenir.
- **Transition d'ouverture** : la caméra part d'un détail en gros plan et recule jusqu'à révéler le monde — premier plan du jury, 4 secondes, mémorable.

## Règles
- Un wow doit être **lisible sans explication** en 2 secondes.
- Il doit être **fiable** : s'il échoue 1 fois sur 5, prévoir la réponse en cache (mode `?demo=1`).
- Le climax arrive à 1:30, pas à la fin.
- Préparer le wow comme au théâtre : un temps de silence avant.
