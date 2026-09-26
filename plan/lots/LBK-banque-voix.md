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
