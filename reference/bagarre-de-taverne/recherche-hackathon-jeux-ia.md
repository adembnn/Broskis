# Ce qui gagne en hackathon de jeu IA : synthèse de 7 recherches (25/09/2026)

Sources : gagnants de hackathons, Hacker News, Reddit (archive Arctic Shift), X/Vibe Jam, jeux à la voix, game jams (GMTK, Ludum Dare), angle Voodoo/DeepMind. Chaque ligne a sa source ; [?] = non vérifié.

## 1. Les 8 règles qui reviennent partout

1. **L'IA est la mécanique, pas la déco.** Test du jury Supercell : « What problem are you solving with AI? ». Si on retire l'IA et que le jeu marche encore, c'est perdu.
   - Supercell AI Game Hack 2026, 1er : *Mr. Jacobs' Office*. Le joueur manipule librement des objets, le LLM simule la conséquence. Jury : « The AI isn't visibly controlling you, yet it's embedded in systems. » (aicu.blog/post/260212)
   - 1er d'une autre piste : *Chess with an Angry Four-Year-Old*, où l'enfant IA change les règles selon sa colère. Jury : « avoiding gimmickry ».
   - Reddit : « Doesn't matter if NPC says "Hi" or "Hi-but-in-a-fancy-way" » (r/LocalLLaMA).
2. **Le LLM traduit l'intention en paramètres, et c'est le code qui garde la vérité.**
   - *Where Winds Meet* : les joueurs obtiennent les récompenses en répétant la dernière phrase du PNJ, la « Solid Snake method ». Commentaire à 736 votes : c'est l'« inevitable consequence of making the LLM itself responsible for… granting rewards ». (r/Games, 3140 votes)
   - Zork + LLM sur HN : le LLM parse le texte libre, le vrai moteur Zork arbitre. Accueil très positif (HN 46786618).
3. **Un objectif clair, une boucle de 1 à 3 min, une révélation ou un score partageable.**
   - *Sven the Bouncer* : convaincre un videur berlinois en 7 tours, avec un « vibe score » donné par le LLM (« the vibe scoring is genius »).
   - *Continue? Y/N* (HN, 386 points), *Unusual Suspects* de neal.fun (HN, 213 points).
4. **Latence maîtrisée**, sinon « gimmick » :
   - mettre en cache les interactions réussies (Mr. Jacobs) ;
   - intégrer le délai dans la fiction, comme la radio spatiale de *Whispers from the Star* ;
   - interjections pré-générées (« hmm… ») : une attente d'1 s paraît alors deux fois plus courte ;
   - push-to-talk ;
   - transcription affichée à l'écran.

   Au-delà de 1,5 s, la conversation paraît cassée (zylos.ai).
5. **Zéro friction.** Jouable instantanément, sans login ni écran de chargement. En 2025, la moitié des 1 000 jeux de la Vibe Jam ont été éliminés parce qu'ils « didn't even load » (levels.io).
6. **Humour, absurde et persona forte dont les ratés sont drôles.** Le compagnon chien de Skyrim sur HN (399 points) : « the LLMisms fold neatly into "dumb but lovable sidekick" ». Prix de la Vibe Jam 2026 : Funniest, Most Unhinged, Most Cursed.
7. **Un moment « wow » dans les 30 premières secondes**, avec son, musique et un nom mémorable. Jury Vibe Jam 2025 (Karpathy, Mr.doob, Tim Soret) : « instant fun », « feels good ».
8. **Des partenaires indispensables.** Barème probable {Tech: Europe}, d'après une source non officielle sur le Big Berlin Hack : créativité, complexité technique, usage des technos partenaires. Seuil cité : « three tools where removing any breaks the demo » ; un usage décoratif vaut 0 [?, à confirmer sur place]. (github.com/ibxibx/berlin-hackathon-prep)

## 2. Ce qui est classé « slop » (à éviter)
- Rien à faire : « There's no gameplay here », « What's the actual gameplay loop? » (HN).
- Une IA qui dit oui à tout, une narration molle, un PNJ qui dit « j'ai fait un feu » sans que rien n'apparaisse à l'écran.
- Des textes d'interface ou un README au style ChatGPT : c'est rédhibitoire sur HN et sur Reddit.
- Des remakes de classiques « en un prompt », qui ne font que ressortir les données d'entraînement.
- Un compte obligatoire, des crédits d'API épuisés pendant la démo, aucune solution de secours.

## 3. Mécaniques validées par le public (Reddit et HN)
1. Persuader un gardien (videur, vampire, douanier) en N tours, avec un score attribué par l'IA.
2. Interroger des suspects pour trouver le coupable, avec la vérité gardée dans le code et des innocents qui mentent aussi. « the whole game is basically a prompt-injection defense problem, which is a genuinely fresh mechanic ».
3. Des sorts ou objets écrits librement, transformés en effets physiques. *Spellwright* (Three.js, multijoueur) : « I would never play with my friend again if he chose a boring fireball ». Incanta suit exactement ce modèle.
4. Inverser les rôles : jouer le chatbot, ou être le seul humain dans un salon d'IA.
5. La voix comme commande : crier des ordres, négocier. Très populaire en démo, plus décevant dans la durée.
6. Une IA qui s'adapte : elle analyse le style du joueur et génère des unités qui le contrent (AI Draft Arena, Supercell).

## 4. Angle jury
- **Voodoo**
  - Compris en 3 s, un seul geste, sessions courtes, « YouTubable » (Corentin Selz, GameAnalytics).
  - KPIs suivis : CPI, rétention J7, temps de jeu. Environ 2 000 prototypes par an.
  - Stratégie 2026 : l'IA partout, et des franchises durables plutôt que des jeux jetables (AFP, 19/02/2026).
  - Précédent : le gagnant d'une piste du Voodoo × Anthropic Hack était un **outil** de publicité, VoodRadar (github.com/edouardfoussier/voodoo-anthropic-hack-winner).
- **DeepMind**
  - Un usage des modèles *indispensable et nouveau* : voix en temps réel, un compagnon qui voit l'écran (dans l'esprit de SIMA 2), de la musique adaptative (Lyria RealTime), des assets générés à la volée (Nano Banana).
  - Thème récent : « AI as a catalyst, not a replacement » (annonce DeepMind × EVE Online, 21/08/2026).
  - Genie n'a pas d'API publique.
  - Juges DeepMind au dernier hack {Tech: Europe} à Londres : Amit Vadi et Ivan Leo [?, à Paris].
- **Gradium** : faible latence, Voice Design (on décrit une voix en texte et on l'obtient en 3 à 5 s), clonage de voix. Leur galerie montre un marchand fantasy avec qui l'on marchande à la voix.
- **YG** : identité inconnue. Hypothèse : Yield Guild Games. À demander sur place.
- **À demander dès 10h** : les tracks, les critères, la taille d'équipe, l'obligation de code écrit sur place, et l'accès à Omni/Genie avec les crédits.

## 5. Voix : leçons techniques
- Push-to-talk obligatoire dans une salle bruyante. Micro-casque. Couper le micro pendant que l'IA parle.
- Le STT de Gradium a un délai médian avant le premier mot de 1 560 ms, selon son propre benchmark : à comparer au STT natif de Gemini Live. Son TTS démarre en environ 214 ms.
- Envoyer le texte du LLM au TTS par phrases, en streaming.
- Le navigateur capture en 48 kHz même quand on demande autre chose : relire `AudioContext.sampleRate`.
- Préchauffer les connexions avant la démo, garder un champ texte de secours et une vidéo de secours.

## 6. Craft de jam (GMTK, Ludum Dare)
- Les gagnants ont un pitch d'une phrase qui retourne une idée, et un seul verbe central.
- **Juice en 30 min** :
  - un son sur chaque action, avec une variation de hauteur de ±5-10 % ;
  - un tremblement d'écran de 100 à 200 ms ;
  - un arrêt sur image de 20 à 60 ms sur les impacts ;
  - des animations adoucies (easing) ;
  - de l'écrasement/étirement (squash & stretch) ;
  - des particules ;
  - un flash blanc sur ce qui est touché ;
  - des chiffres de score qui « sautent » à l'écran.
- **Démo en 2 min** :
  1. accroche en une phrase, avec le jeu déjà ouvert ;
  2. jouer en direct pendant que le coéquipier commente l'IA ;
  3. pourquoi c'est bon pour Voodoo et DeepMind ;
  4. la vision, puis un QR code pour jouer.

## Sources principales
- https://www.aicu.blog/post/260212 (Supercell 2026)
- https://medium.com/@fullclustered12/48-hours-at-the-supercell-ai-game-hack-how-my-tower-defense-became-an-ai-strategist-33edc30ba866
- https://levels.io/winners-of-the-2025-vibe-code-game-jam · https://levels.io/vibe-jam-2026-winners-quality
- https://news.ycombinator.com/item?id=46786618 (Zork + LLM) · https://news.ycombinator.com/item?id=49413561 (Skyrim) · https://news.ycombinator.com/item?id=49238851 (whodunnitai)
- https://reddit.com/r/Games/comments/1pas93d/ · https://reddit.com/r/LocalLLaMA/comments/1pqn344/ · https://reddit.com/r/aigamedev/comments/1t0un9b/
- https://gradium.ai/content/how-to-connect-tts-to-llm-voice-pipeline · https://ai.google.dev/gemini-api/docs/live-api/capabilities
- https://www.gameanalytics.com/blog/voodoo-guide-mobile-game-design-keep-things-simple
- https://deepmind.google/blog/from-atari-to-eve-online-building-on-15-years-of-ai-research-in-games/
- https://github.com/ibxibx/berlin-hackathon-prep · https://luma.com/par-hack
- https://itch.io/jam/gmtk-2025/results · https://info.devpost.com/blog/how-to-present-a-successful-hackathon-demo
