# Lot LBK2 · Les combattants parlent avec les voix Gradium
Exécution : **Gemini** · Dépend de : LBK (fusionné) · Décision d'Adem (26/09, 14h) : **personnages = Gradium**, **animateur = Fenrir** (Gemini TTS, on n'y touche pas).

## À faire
1. Dans `tools/voices/generate-barks.mjs` (écrit par Titouan, lis-le d'abord), ajoute un moteur **Gradium** pour les 4 rôles de combattants. L'animateur reste en Gemini TTS Fenrir : ne régénère pas ses fichiers.
2. Régénère les **192 répliques des combattants** (4 rôles × 16 événements × 3 variantes) avec les **mêmes textes** (`tools/voices/scripts-cache.json` et `public/assets/voices/manifest.json`), en écrasant les WAV de `public/assets/voices/{barbarian,knight,mage,rogue}/`. Garde les mêmes noms de fichiers : le jeu n'a rien à changer.
3. Mets à jour `tools/voices/LISEZMOI.md` (moteur par rôle, relance).

## Voix Gradium (créées par Voice Design pour le casting, validées par Adem)
| Rôle | `voice_id` | `json_config` |
|---|---|---|
| barbarian | `vox_emb_8LauZijS47Vkk4IJ` | `{ "temp": 1.3, "padding_bonus": -1.5 }` |
| knight | `vox_emb_06GtztKKMwJUunyK` | `{ "temp": 1.25, "padding_bonus": -1.5 }` |
| mage | `vox_emb_lXuuPMv87ugtRCS7` | `{ "temp": 1.35, "padding_bonus": -1.5 }` |
| rogue | `vox_emb_K094e8x6A3ZzaRdx` | `{ "temp": 1.3, "padding_bonus": -2 }` |

## Retours d'Adem à l'écoute (13h) : À CORRIGER EN PRIORITÉ
- **Chevalier** : « pas encore assez d'entrain ». **Barbare** : « pas du tout assez convaincant pour un barbare ».
- **Pas d'effet stade sur les combattants** : il est réservé à l'animateur.
- Les voix Gemini lisaient leur consigne à voix haute. Avec Gradium, la consigne de ton ne va **jamais** dans le texte : le ton vient de la voix (Voice Design) et de l'écriture (MAJUSCULES, « !!! », une voyelle étirée).

### Étape 0 : re-casting énergique, avant de générer les 192 répliques
1. **Voice Design** Gradium : `POST https://api.gradium.ai/api/voice-generator/generate`, corps `{ "prompt": "...", "language": "en", "n_samples": 4 }`, qui renvoie `{ embeddings: [{ embedding_id }] }`. Attends ensuite que chaque voix soit prête : `GET https://api.gradium.ai/api/voice-generator/embeddings?embedding_id=<id>`, jusqu'à `embeddings[0].ready === true`, toutes les 2 s. L'`embedding_id` s'utilise comme `voice_id` en TTS.
2. Pour **chacun des 4 rôles**, 4 nouvelles candidates avec des consignes encore plus extrêmes, par exemple :
   - **barbare** : « A gigantic barbarian warlord BELLOWING a battle cry at the top of his lungs, monstrous deep chest voice, raspy, growling between words, spit flying, berserker rage, laughing like a maniac, cartoon Viking » ;
   - **chevalier** : « An over-the-top heroic knight SCREAMING a charge into battle, booming theatrical British voice cracking with excitement, absolutely fired up, fast, cartoon hero » ;
   - **mage** et **voleur** : même esprit.
   Garde aussi la voix actuelle du tableau ci-dessous comme 5e candidate.
3. **Audition jugée par Gemini** : fais dire à chaque candidate la même réplique test du rôle, par exemple « RAAAAAH! YOU CALL THAT A HIT?! », avec `temp` 1,35 à 1,5 et `padding_bonus` −2. Envoie les 5 WAV à `gemini-3.1-pro-preview`, l'audio étant accepté en `inlineData`, `audio/wav`. Demande un classement JSON : énergie et cri, crédibilité du personnage, zéro ton robotique, articulation compréhensible. **Garde la gagnante** et note son `voice_id` dans `tools/voices/LISEZMOI.md`.
4. Pour chaque réplique, génère **3 prises** et garde la meilleure selon le même juge Gemini (la plus énergique et compréhensible). La direction vocale demande la meilleure de 4 prises ; 3 suffisent ici.

## API Gradium (déjà utilisée dans `api/tts.ts` : copie son appel)
- `POST https://api.gradium.ai/api/post/speech/tts`, en-tête `x-api-key: <GRADIUM_API_KEY>` (lue dans le `.env` du dépôt principal ; le script remonte les dossiers pour le trouver, comme `vite.config.ts`). Corps : `{ text, voice_id, output_format: "wav", only_audio: true, model_name: "gradium-tts-beta", json_config }`.
- **2 requêtes simultanées au maximum** (limite du compte), 3 essais avec attente croissante, reprise possible : saute les fichiers déjà régénérés, suivis dans `tools/voices/gradium-done.json`.
- Le WAV Gradium est en 48 kHz : garde-le tel quel.
- Coupe le silence de début de fichier (au-dessus de −45 dBFS), comme le demande la direction vocale de `plan/lots/LBK-banque-voix.md`.

## Contrôles
- `npm run build` passe.
- Les 192 fichiers des combattants sont régénérés (date de modification) et l'animateur est intact.
- Dans ton rendu : durée moyenne d'une réplique, nombre d'échecs, 5 fichiers écoutés avec une transcription (Gradium STT : `POST https://api.gradium.ai/api/post/speech/asr`, corps = octets audio bruts) comparée au texte attendu.
- Commit des WAV (environ 30 Mo : normal).
