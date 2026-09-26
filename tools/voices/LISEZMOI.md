# Lot LBK · Banque de voix (« barks »)

## Relancer la génération
```
node tools/voices/generate-barks.mjs
```
- Aucune installation nécessaire (pas de paquet npm, seulement `fs`/`path`/`fetch` natifs de Node 24).
- Lit `GEMINI_API_KEY` et `GRADIUM_API_KEY` dans `.env` à la racine du dépôt (le script le parse lui-même).
- **Moteur par rôle** : l'animateur (`announcer`) utilise Gemini TTS. Les 4 combattants utilisent Gradium TTS.
- **Reprise automatique** : 
  - Pour Gemini TTS : si `public/assets/voices/<role>/<event>-<n>.wav` existe déjà, l'appel TTS est sauté.
  - Pour Gradium TTS : la génération est suivie dans `tools/voices/gradium-done.json`. Si l'entrée existe et que le fichier `.wav` est présent, l'appel est sauté.
  On peut donc relancer le script après une interruption (Ctrl+C, coupure réseau, quota dépassé) sans tout refaire : seuls les fichiers manquants sont regénérés.
- Les répliques écrites (texte) sont mises en cache dans `tools/voices/scripts-cache.json`, pour que le texte d'une variante ne change pas d'une relance à l'autre.
- Pour forcer une réécriture complète des textes d'un rôle, supprime son entrée dans `scripts-cache.json` avant de relancer.
- Pour regénérer l'audio d'un rôle Gradium, supprime les `.wav` dans `public/assets/voices/<role>/` et retire les entrées correspondantes de `tools/voices/gradium-done.json`, puis relance.
- `public/assets/voices/manifest.json` n'est réécrit qu'à partir des fichiers **réellement présents sur disque** à la fin du run : il reste toujours cohérent.

## Voix Gradium utilisées (Gagnantes de l'audition - Lot LBK2)
- **barbarian** : `vox_emb_ydTmlMAUNCO2vbmT` (temp: 1.4, padding_bonus: -2.0)
- **knight** : `vox_emb_06GtztKKMwJUunyK` (temp: 1.25, padding_bonus: -1.5)
- **mage** : `vox_emb_lXuuPMv87ugtRCS7` (temp: 1.35, padding_bonus: -1.5)
- **rogue** : `vox_emb_LbemuKLtMYt3PuVJ` (temp: 1.4, padding_bonus: -2.0)

## Ajouter un rôle
1. Dans `tools/voices/generate-barks.mjs`, ajoute une entrée dans `ROLES` :
   ```js
   monRole: {
     engine: 'gradium', // ou 'gemini'
     gradium: { id: "...", config: { temp: 1.3, padding_bonus: -1.5 } }, // Si engine === 'gradium'
     voice: 'NomDeVoixGemini', // Si engine === 'gemini'
     tone: 'consigne de ton en anglais, ex. cocky cartoon trickster YELLING taunts',
     persona: 'description courte du personnage pour l’écriture des répliques',
     events: FIGHTER_EVENTS, // ou une autre liste d'événements si besoin
     variants: 3,
   },
   ```
2. Ajoute la correspondance modèle 3D → rôle dans `src/audio/barks.ts` (`MODEL_TO_ROLE`).
3. Relance le script : seules les nouvelles répliques du nouveau rôle seront générées (reprise automatique).

## Ajouter un événement à un rôle existant
1. Ajoute la clé dans `FIGHTER_EVENTS` (ou la liste `events` du rôle) et une entrée dans `EVENT_HINTS` dans `tools/voices/generate-barks.mjs`.
2. Supprime l'entrée du rôle dans `tools/voices/scripts-cache.json` si tu veux forcer la réécriture du texte.
3. Ajoute le type d'événement dans `FighterBarkEvent`/`AnnouncerBarkEvent` (`src/audio/barks.ts`) et abonne-le au bus.

## Stratégie de secours (si le TTS échoue)
- **Le jeu ne dépend jamais de la banque de voix pour tourner.** `src/audio/barks.ts` charge `manifest.json` en tâche de fond ; si le fetch échoue (fichier absent, réseau coupé), `BarkPlayer` reste inactif sans crasher le jeu.
- **Le filet de sécurité, ce sont les bruitages synthétiques du lot LV** (`src/audio/sfx.ts`) : ils sont toujours actifs. Si la génération de voix est incomplète avant la démo, il suffit de **ne pas appeler `installBarks(...)`** dans `src/audio/index.ts`.
- Si seul un rôle/événement pose problème, supprime-le simplement : le `manifest.json` ne liste que les `.wav` présents, et les appels manquants sont ignorés sans crash.
