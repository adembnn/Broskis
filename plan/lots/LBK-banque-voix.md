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

## Direction vocale (recherche du 26/09, 13h30) : à appliquer
- **Barks courts** : 1 à 4 mots, 1,5 s maximum (« GAME! », « K.O.! »). Commentaire : 12 mots maximum.
- **Débit** : 6 à 7 syllabes/s, avec des pointes à 9 ; **une seule** voyelle étirée, sur le mot-clé (0,6 à 1,2 s).
- **Écriture** :
  - des « ! » et des points, **pas de virgules** (elles donnent un ton de narrateur) ;
  - **une seule majuscule** par réplique, jamais sur un mot de 2 ou 3 lettres ;
  - au plus 3 voyelles répétées (« Nooo ») ;
  - nombres en toutes lettres.
- **Générer par lots de 5 à 8 répliques**, puis découper : les textes très courts sont instables. Garder la meilleure de 4 prises.
- **Consigne Gemini TTS de l'animateur** : « yelling at full volume like a boxing ring announcer, speaking rapidly, one big stretched vowel on the key word, pitch leaping up ».
- **Système** :
  - une réplique toutes les 4 à 6 s au plus ;
  - le bark du perso d'abord, l'annonceur 250 ms après ;
  - priorités KO / PERFECT / sortie de ring > critique / caisse > coup > remplissage ;
  - une réplique plus prioritaire coupe l'autre avec un fondu de 60 ms ;
  - jamais une des 2 dernières répliques jouées ;
  - `playbackRate` ±3 % et gain ±1,5 dB aléatoires.
- **Chaîne WebAudio par rôle** :

| | playbackRate | EQ | Compresseur (seuil, ratio, attaque, relâchement) | Saturation (k, mix) | Écho, réverbération |
|---|---|---|---|---|---|
| Animateur | 1,10 | HP 110 Hz ; 300 Hz −3 dB ; 3,5 kHz +5 dB ; aigus 10 kHz +2 dB | −24 dB, 4:1, 5 ms, 120 ms | 3, 20 % | écho 110 ms (retour 0,28, mélange 0,2) + 2e écho 230 ms à 0,1 ; réverbération 1,6 s, mélange 0,12 |
| Barbare | 0,94 | HP 70 Hz + graves 150 Hz +3 dB ; 2,5 kHz +3 dB | −24 dB, 6:1 | 5, 35 % | réverbération 0,8 s, 0,06 |
| Mage | 1,15 | HP 180 Hz ; 4,5 kHz +4 dB ; 1,2 kHz +3 dB | −24 dB, 4:1, 3 ms, 100 ms | 2, 10 % | réverbération 2,2 s, 0,18 |
| Chevalier | 1,0 | comme l'animateur | comme l'animateur | 2, 10 % | effet « heaume » : délai 9 ms, retour 0,35, passe-bande 1,5 kHz, mélange 20 % |

  - Gain de 0,7 après le compresseur (le compresseur WebAudio ajoute environ +11 dB), puis un limiteur (−2 dB, knee 0, 20:1, 1 ms, 50 ms).
- **Mixage** :
  - la musique baisse à 0,4 (`setTargetAtTime(0.4, t0, 0.03)`) puis revient avec 0,15 s de retard ;
  - la foule reste 12 dB sous la voix, et monte de +6 dB en 300 ms sur un KO ;
  - la voix démarre 200 ms après l'impact, 350 ms sur un KO ;
  - le silence de début de fichier est coupé (au-dessus de −45 dBFS).
- **À éviter** :
  - le même fichier rejoué à l'identique ;
  - un blanc avant la voix ;
  - un annonceur qui parle sans arrêt ;
  - `playbackRate` au-delà de 1,25 ;
  - une réverbération au-delà de 0,2.
