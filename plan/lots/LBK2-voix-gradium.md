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
