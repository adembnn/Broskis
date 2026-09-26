# Lot LW2 · « Ton perso crie avec TA voix » (clonage Gradium en direct)
Exécution : **Gemini** · Dépend de : LBK (banque de voix, fusionnée), LI · Moment « waouh » de la démo (IA indispensable + sponsor Gradium).

## Ce que voit le joueur
1. À l'écran de choix du combattant, chaque joueur a un bouton **🎤 USE MY VOICE** (optionnel, aussi pour les persos prédéfinis).
2. Un clic ouvre un panneau « Vinyle » : **« Scream this, loud! »** avec un texte à lire (environ 30 mots, drôle, à crier, ex. : *« I am the greatest Broski of all time! Nobody touches my snacks! Bring it on, you little toaster! Victory is MINE! Ha ha ha! »*), un anneau qui se remplit pendant **12 s** d'enregistrement micro et un vumètre qui bouge avec la voix.
3. Pendant que le jeu continue (choix des armes, présentation), le serveur clone la voix, puis génère **8 répliques** criées avec elle. Un petit badge « 🎤 VOICE READY » apparaît sur la carte du joueur.
4. En match, le perso de ce joueur utilise **sa voix clonée** au lieu de la voix prédéfinie : provocation, coup reçu, parade parfaite, éjection, KO, victoire. L'animateur garde sa voix (Fenrir).
5. Mention visible sous le bouton : « Your voice is only used for this session. » Le clone est supprimé chez Gradium à la fermeture de l'onglet (`navigator.sendBeacon` vers l'API) et, par sécurité, le serveur supprime les clones `broskis-*` vieux de plus de 3 h à chaque nouveau clonage.

## Tes chemins
- `api/voice-clone.ts` (nouveau) : reçoit l'audio en base64 (WebM/Opus ou WAV, depuis `MediaRecorder`), l'envoie à Gradium, renvoie `{ voiceId }` ; gère aussi `DELETE`.
- `api/voice-lines.ts` (nouveau) : `{ voiceId, role, lines[] }` → pour chaque réplique, TTS Gradium avec `voice_id`, renvoie les WAV en base64. **2 appels Gradium simultanés au maximum** (limite du compte).
- `src/ia/voice/**` (nouveau) : enregistrement micro (`getUserMedia` + `MediaRecorder`), panneau UI, file de génération, cache mémoire des répliques (URL blob).
- L'écran de choix du combattant dans `src/ui/` : seulement le bouton et le badge. Lis `src/ui/index.ts` pour trouver l'écran.
- `src/audio/barks.ts` : **uniquement** une fonction exportée `setVoiceOverride(player: PlayerId, bank: Partial<Record<BarkEvent, string[]>> | null)`, que `playBark` consulte avant la banque du rôle. Titouan retravaille ce fichier en parallèle (lot LVOX) : garde ton ajout petit et isolé en fin de fichier.
- Ne touche à rien d'autre.

## API Gradium (vérifiée dans la doc officielle, skill `gradium-voice-cloning`)
- Clé : `GRADIUM_API_KEY`, lue côté serveur dans `env` comme dans `api/tts.ts`. Jamais côté navigateur.
- **Cloner** : `POST https://api.gradium.ai/api/voices/`, en-tête `x-api-key`, **multipart**. La partie du fichier s'appelle exactement **`audio_file`**, avec un nom de fichier qui porte la bonne extension (`sample.webm` ou `sample.wav`) ; ajoute aussi les champs `name` (`broskis-<horodatage>-p<1|2>`), `language=en` et `start_s=0.5`.
  - Réponse **201** : `{ "uid": "...", "error": "Please wait a bit till the voice is ready to be used." }`. Ce champ `error` n'est qu'un avertissement, pas un échec.
  - La voix est utilisable en quelques secondes ; en cas d'erreur « Embeddings not found », réessaie la TTS une fois après 2 s.
- **Parler** : même appel TTS que `api/tts.ts` (`POST https://api.gradium.ai/api/post/speech/tts`) avec `voice_id: <uid>` et `json_config: { cfg_coef: 2.6, temp: 1.2, padding_bonus: -1.5 }`. `cfg_coef` va de 2 à 3 : plus haut, plus ressemblant.
- **Supprimer** : `DELETE https://api.gradium.ai/api/voices/{uid}` → 204.
- **Lister** (ménage) : `GET https://api.gradium.ai/api/voices/`.
- Référence brute : https://docs.gradium.ai/llms.txt, à consulter si un appel échoue.

## Les 8 répliques (en anglais, à CRIER, 1 à 5 mots, une seule voyelle étirée ; voir la « Direction vocale » de plan/lots/LBK-banque-voix.md)
`taunt_turn` ×2, `hit_heavy`, `parry_perfect`, `ringout_scream`, `ko`, `victory`, `low_hp`. Écris-les en dur : une liste courte et drôle par événement, adaptée à n'importe quel joueur (« THAT'S ALL YOU GOT?! », « NOT MY FAAACE! », « BROSKI POWEEER! »). Pas d'appel LLM ici : la latence compte.

## Confidentialité (dépôt PUBLIC)
- Aucun enregistrement n'est écrit sur disque, ni dans le dépôt, ni dans les logs. Pas de `console.log` de l'audio ni de la clé.
- Si le micro est refusé ou si Gradium échoue : message clair (« Mic blocked: using the default voice ») et le jeu continue avec la voix prédéfinie. Rien ne doit bloquer le parcours.

## Contrôles
- `npm run build` passe.
- Test serveur réel, sans navigateur : un script `tools/test-voice-clone.mjs` qui génère 12 s de parole avec la TTS Gradium d'une voix du catalogue (déjà dans `api/_models.ts` ou `api/tts.ts`), la clone, fait dire « BROSKI POWEEER! » au clone, écrit le WAV dans `reports/tmp/` (ignoré par git), puis supprime le clone. Donne les temps mesurés (clonage, première réplique, 8 répliques) dans ton rendu.
- Test navigateur (Playwright, port 5300-5399, faux micro : `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`) : le panneau s'ouvre, l'enregistrement dure 12 s, le badge apparaît. Capture dans `captures/lw2/`.
