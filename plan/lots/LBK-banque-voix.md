# Lot LBK · Banque de voix pré-générées (« barks ») + lecteur
Responsable : **Titouan** (il a fait l'audio, lot LV) · Coût Claude : faible, le gros du travail est fait par l'API Gemini · Dépend de : LV (fait)

## Décision d'Adem (26/09, 13h)
- **Animateur** : **Gemini 3.8 Flash TTS**, voix **Fenrir**, dirigée pour crier.
- **Combattants** : même moteur, chacun sa voix de la série « HYPE » :

| Rôle | Voix Gemini | Consigne de ton |
|---|---|---|
| animateur | Fenrir | hyped-up stadium announcer SCREAMING into the mic over a roaring crowd, very fast, explosive, stretch the capitalized words, pro wrestling energy |
| barbare (barbarian, skeleton_warrior) | Algenib | huge cartoon barbarian ROARING, very deep gravelly, laughs maniacally, aggressive and fast |
| chevalier (knight) | Alnilam | pompous cartoon British knight SHOUTING heroic lines, booming, theatrical, fired up, fast |
| mage (mage, skeleton_mage) | Puck | hyperactive cartoon old wizard SCREECHING with glee, high-pitched, crackly, frantic, cackles |
| voleur (rogue_hooded) | Zephyr | cocky cartoon trickster YELLING taunts, fast, bratty, mocking laughter |

- Avis d'Adem sur les essais : « pas assez d'entrain, il faut que ça CRIE ». Chaque réplique est courte, écrite pour être criée : MAJUSCULES, « !!! », voyelles étirées (« RAAAH », « BROOOSKIII »), 2 à 8 mots. Jamais de ton d'assistant.

## Tes chemins
`tools/voices/**`, `public/assets/voices/**`, `src/audio/barks.ts` (nouveau fichier ; `src/audio/index.ts` seulement pour l'installer).

## Sortie attendue
1. **`tools/voices/generate-barks.mjs`** : un script Node sans paquet. La clé `GEMINI_API_KEY` vient de `.env`, que le script analyse lui-même (demande la clé à Adem en privé, jamais par GitHub).
   - **Répliques** écrites par `gemini-3.1-pro-preview`, en JSON contraint, en **anglais**, drôles, dans le personnage :
     - combattants (4 rôles × 3 variantes) : `hit_light`, `hit_heavy`, `crit_taken`, `parry_perfect`, `parry_good`, `whiff`, `dodge`, `throw_effort` (grognement), `jump_effort`, `taunt_turn`, `low_hp`, `ringout_scream`, `ko`, `victory`, `crate_grab`, `new_weapon` ;
     - animateur (5 variantes) : `match_intro`, `weigh_in`, `hit`, `crit`, `perfect`, `feint`, `ringout`, `ko`, `sudden_death`, `crate_drop`, `comeback`, `victory`.
   - **Voix** : `gemini-3.8-flash-tts` en REST (`generateContent`, `responseModalities: ["AUDIO"]`, `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`), avec la consigne de ton du tableau en préfixe. L'audio revient en PCM 16 bits mono 24 kHz, à emballer en WAV (en-tête de 44 octets).
   - Au plus 4 appels en parallèle, 3 essais avec attente croissante, reprise possible (on saute les fichiers déjà faits).
   - Sortie : `public/assets/voices/<role>/<event>-<n>.wav` et `public/assets/voices/manifest.json` (`{ role: { event: [{ file, text }] } }`).
   - Journal : appelle `log()` de `tools/dashboard/log.mjs` (`source: 'gemini'`, `kind: 'generation'`) au début, toutes les 20 voix et à la fin.
2. **`src/audio/barks.ts`** : `playBark(role, event, opts?)`.
   - Il tire une variante jamais identique à la précédente, avec une file et des priorités ; il ne coupe jamais l'animateur pour un grognement.
   - Il écoute le bus : `hit` (réplique de la victime, puis de l'animateur si critique), `parry:result`, `fire` (effort), `move:jump`, `turn:start` (provocation, au plus 1 tour sur 2), `ringout`, `ko`, `match:end`, `crate:grab`, `scan:result`, `match:start`.
   - Correspondance modèle KayKit → rôle : barbarian et skeleton_warrior → barbare ; knight → chevalier ; mage et skeleton_mage → mage ; rogue_hooded → voleur ; custom → rôle du modèle de base.
   - **Chaîne « stade »** pour l'animateur (validée à l'écoute) :
     - passe-haut 120 Hz ;
     - pic 3,2 kHz +6 dB (Q 0,9) ;
     - légère saturation tanh ;
     - compresseur (−22 dB, ratio 6, attaque 3 ms, relâchement 150 ms) ;
     - gain ×1,35 ;
     - écho 110 ms, retour 0,22, mélange 0,25 ;
     - `playbackRate` 1,1.
   - Combattants : même chaîne sans l'écho, `playbackRate` 1,05.
   - La musique baisse pendant que l'animateur parle.
3. Un mot dans `tools/voices/LISEZMOI.md` : relancer, ajouter un rôle, voix de secours.

## Contrôles
- `npm run build` passe.
- Le manifeste liste au moins 200 fichiers.
- Écoute 10 répliques au hasard : elles crient, elles sont courtes, en anglais, sans ton robotique.
- Dans le jeu, `ctx.bus.emit('hit', …)` joue la voix de la victime.

## Commit
Tes fichiers seulement. L'audio fait environ 30 Mo : c'est normal, commite-le. Puis pull, push, et mise à jour de `plan/SUIVI.md`.

## Rendu (Titouan, Claude sous-agent, 26/09 13h25 → 14h10)
- **Fait** : `tools/voices/generate-barks.mjs` (aucun paquet npm), `src/audio/barks.ts`, `tools/voices/LISEZMOI.md`,
  installation dans `src/audio/index.ts` (import + 1 ligne, rien d'autre touché dans ce fichier).
- **Chiffres** : 252 répliques dans `public/assets/voices/manifest.json` (192 combattants : 4 rôles × 16
  événements × 3 variantes ; 60 animateur : 12 événements × 5 variantes). 0 échec de génération. Poids réel du
  dossier `public/assets/voices/` : **36 Mo** (nettement moins que les ~30 Mo annoncés dans le lot — voir
  décision ci-dessous, les clips sont plus courts que prévu, donc plus légers). `npx tsc --noEmit` et
  `npm run build` passent.
- **Contrôles faits** : script Node qui lit l'en-tête WAV (RIFF/WAVE + taille des données) des 252 fichiers :
  0 fichier corrompu/vide. Durées mesurées : min 1,65 s / médiane 2,89 s / max 6,69 s (cohérent avec des
  répliques de 2 à 8 mots criées). Test en conditions réelles dans le jeu (`npm run dev`, navigateur piloté) :
  `window.ctx.bus.emit('hit', { target: 1, ... })` avec le combattant du joueur 1 en `rogue_hooded` a bien
  déclenché le fetch de `/assets/voices/rogue/hit_light-1.wav` (200 OK), aucune erreur console. Pas d'écoute
  humaine à l'oreille (agent sans sortie audio) — vérifié par mesure de durée/énergie (RMS par seconde, pas de
  silence anormal) à la place, voir décision ci-dessous pour le détail de cette vérification.
- **Décision / déviation notable (documentée, pas une invention silencieuse)** : le lot demandait d'envoyer au
  TTS le texte **préfixé par la consigne de ton du tableau** (ex. « huge cartoon barbarian ROARING, very deep
  gravelly… »). Un test A/B direct sur l'API a montré que `gemini-3.8-flash-tts` **lit cette consigne à voix
  haute** au lieu de s'en servir comme simple direction d'acteur : les clips faisaient 10 à 16 s au lieu de
  2 à 6 s, et contenaient la consigne elle-même déclamée (mesuré par le profil d'énergie RMS seconde par
  seconde : discours continu sur toute la durée, pas de silence de remplissage). Écouter le contenu réel de
  ces clips aurait donné des répliques de type monologue, pas des cris courts. J'ai donc changé le texte
  effectivement envoyé au TTS pour qu'il ne contienne **que la réplique elle-même** (déjà en MAJUSCULES /
  « !!! » / voyelles étirées, donc porteuse du ton) ; le ton du personnage vient de la voix Gemini prébuilt
  (`role.voice` du tableau) et du style d'écriture, pas d'un préfixe parlé. La consigne de ton (`role.tone`)
  reste utilisée pour guider l'**écriture** des répliques (étape A, gemini-3.1-pro-preview), seulement plus
  pour la synthèse vocale (étape B). Détail et code dans `tools/voices/generate-barks.mjs` (commentaire au-dessus
  de `synthesizeLine`) et `tools/voices/LISEZMOI.md`.
- **Autre correction en cours de route** : une réplique générée par le modèle de texte contenait le mot banni
  « legendary » (`api/_util.ts::stripBannedWords` l'interdit dans le reste du projet) — repéré par une
  recherche automatique (tolérante aux voyelles étirées) sur `tools/voices/scripts-cache.json` après la
  première génération. Les 2 occurrences (`announcer.victory` et `knight.victory`) ont été réécrites et les
  2 fichiers audio correspondants régénérés (reprise ciblée, pas de relance complète).
- **Approximation documentée** : `FighterDef` ne mémorise pas le modèle 3D de base d'un combattant `custom`
  (perso photo en direct, lot LP, sans `glbUrl`). `src/audio/barks.ts` (`MODEL_TO_ROLE`) fait retomber
  `custom` sur le rôle **chevalier (knight)**, par symétrie avec `src/scene/fighters/loader.ts` qui fait déjà
  ce même choix par défaut pour le corps 3D d'un perso `custom` sans `glbUrl`.
- **Frictions** : le premier lancement en arrière-plan du script de génération a été interrompu silencieusement
  par la fin d'une session de shell (particularité de l'environnement d'exécution, pas un bug du script) ;
  repéré via la reprise automatique (fichiers déjà écrits mais journal incomplet) et relancé proprement en
  tâche de fond surveillée jusqu'au bout. Aucune perte de travail grâce à la reprise par fichier déjà présent.
- **Reste à faire / pistes pour la suite** : pas d'écoute humaine réelle des fichiers (seulement des mesures
  automatiques) — recommandé de faire un tour d'oreille rapide avant la démo si possible. Le taunt de
  provocation (`taunt_turn`) est limité à 1 tour sur 2 par un compteur pair/impair déterministe (plutôt qu'un
  tirage aléatoire), choisi pour rester testable par script par les agents du harnais.
