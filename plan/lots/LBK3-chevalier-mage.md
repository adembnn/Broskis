# Lot LBK3 · Chevalier (et mage) : une vraie voix qui CRIE
Exécution : **Gemini** · Dépend de : LBK2 (fusionné)

## Constat
Adem, sur le chevalier Gradium : « il n'y a pas encore assez d'entrain dans la voix ». LBK2 a changé les voix du barbare et du voleur, mais **a gardé l'ancienne voix du chevalier** (`vox_emb_06GtztKKMwJUunyK`, temp 1,25) et celle du mage (`vox_emb_lXuuPMv87ugtRCS7`) : ce sont précisément les voix jugées trop molles.

## À faire (outils existants : `tools/voices/audition.mjs` et `generate-barks.mjs`, lis-les)
1. **Voice Design Gradium**, 6 nouvelles candidates par rôle : `POST https://api.gradium.ai/api/voice-generator/generate` `{ prompt, language: "en", n_samples: 6 }`, puis attendre `ready` avec `GET /api/voice-generator/embeddings?embedding_id=…`. Consignes :
   - **chevalier** : « A hot-blooded heroic knight SCREAMING a battle charge at the absolute top of his lungs, voice cracking from sheer excitement, booming, breathless, over-the-top theatrical British, like a cartoon hero leading a cavalry charge, extremely fast and loud » ;
   - **mage** : « A deranged old wizard SHRIEKING with manic glee at maximum volume, high-pitched cackling, voice breaking, frantic and extremely fast, cartoon mad sorcerer casting a giant spell ».
2. **Audition** : les 6 candidates + la voix actuelle disent 2 répliques test criées du rôle (ex. chevalier : « FOR GLORYYY! CHAAAARGE! » et « NOT TODAY, KNAVE!!! »), avec `temp` 1,45 et `padding_bonus` −2,2. Juge : `gemini-3.1-pro-preview` avec l'audio en `inlineData`. Critère n° 1 : **énergie et volume du cri**. Critère n° 2 : crédibilité du personnage. **Refuse la voix actuelle** sauf si elle gagne nettement. Classement JSON dans ton rendu.
3. Régénère les **48 répliques** de chaque rôle avec la gagnante (meilleure de 3 prises, même juge), en gardant les mêmes noms de fichiers et les mêmes textes. Mets à jour `tools/voices/LISEZMOI.md` et `gradium-done.json`.

## Tes chemins
`tools/voices/**`, `public/assets/voices/knight/**`, `public/assets/voices/mage/**`, `public/assets/voices/manifest.json`.

## Contrôles
`npm run build` passe. Rendu : identifiants des gagnantes, scores du juge (actuelle contre nouvelles), 0 échec.
