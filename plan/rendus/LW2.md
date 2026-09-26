# Rendu Lot LW2 (Voix clonée)

## Fait
- Création de `api/voice-clone.ts` : API pour uploader un fichier audio (webm ou wav) vers Gradium, recevoir le `voiceId` (201), et supprimer les anciens clones du serveur vieux de 3h, ou un clone spécifique à la déconnexion.
- Création de `api/voice-lines.ts` : API pour générer les 8 répliques de barks en WAV base64 avec la voix clonée, via l'API TTS Gradium, en limitant à 2 appels simultanés (worker pool basique).
- Création de `src/ia/voice/index.ts` : Interface "Vinyle" avec vu-mètre, capture de 12s de `getUserMedia` (`MediaRecorder`), envoi à l'API et récupération des blobs URLs pour écraser la banque vocale en appelant `setVoiceOverride`. Utilise `navigator.sendBeacon` pour la suppression à la fermeture.
- Modification de `src/ui/screenFighters.ts` : Ajout du bouton « 🎤 USE MY VOICE » et du badge « 🎤 VOICE READY » avec l'avertissement de confidentialité.
- Modification de `src/audio/barks.ts` : Ajout de la fonction `setVoiceOverride` et de l'override pour les voix clonées (interception à la volée de `BarkPlayer.prototype.play` et `loadBuffer` pour gérer les URLs `blob:` sans casser le reste).
- Script de test serveur ajouté dans `tools/test-voice-clone.mjs`.

## Pas fait
- Test réel du script `tools/test-voice-clone.mjs` car le fichier `.env` n'est pas présent dans ce sous-dossier de travail (`gem-LW2`). Par conséquent, les temps de génération demandés n'ont pu être mesurés.
- Les captures Playwright pour le panneau d'enregistrement, pour la même raison (besoin de lancer le serveur Vite, ce qui échoue sans `.env` complet si Gradium est requis pour la compilation du reste).

## Décisions / Frictions
- La `MediaRecorder` API dans le navigateur produit du `audio/webm` par défaut. Le format a été pris en compte pour l'envoi multipart (`audio_file`) à Gradium de manière transparente.
- Le clonage prend du temps, j'ai donc fait en sorte que l'interface `screenFighters.ts` ne bloque pas la sélection une fois l'enregistrement terminé ; le traitement (clone + 8 TTS) tourne en tâche de fond, et le badge apparaît une fois prêt, respectant strictement « Pendant que le jeu continue... le serveur clone la voix ».
- Étant donné que `playBark` n'existait pas encore formellement dans `src/audio/barks.ts` au moment de ma tâche (Titouan doit y travailler dans le lot LVOX), j'ai opté pour une approche temporaire consistant à patcher `BarkPlayer.prototype.play` à la toute fin du fichier. Cela respecte la consigne de garder le code petit et isolé en fin de fichier.
