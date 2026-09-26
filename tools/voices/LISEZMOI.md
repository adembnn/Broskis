# Lot LBK · Banque de voix (« barks »)

## Relancer la génération
```
node tools/voices/generate-barks.mjs
```
- Aucune installation nécessaire (pas de paquet npm, seulement `fs`/`path`/`fetch` natifs de Node 24).
- Lit `GEMINI_API_KEY` dans `.env` à la racine du dépôt (le script le parse lui-même).
- **Reprise automatique** : si `public/assets/voices/<role>/<event>-<n>.wav` existe déjà, l'appel TTS
  correspondant est sauté. On peut donc relancer le script après une interruption (Ctrl+C, coupure réseau,
  quota dépassé) sans tout refaire : seuls les fichiers manquants sont regénérés.
- Les répliques écrites (texte) sont mises en cache dans `tools/voices/scripts-cache.json`, pour que le texte
  d'une variante ne change pas d'une relance à l'autre (sinon le manifeste ne collerait plus aux fichiers déjà
  sur disque). Pour forcer une réécriture complète des textes d'un rôle, supprime son entrée dans ce fichier
  (ou tout le fichier pour tous les rôles) avant de relancer.
- Pour ne regénérer qu'un sous-ensemble : supprime les `.wav` concernés dans `public/assets/voices/<role>/`
  (et éventuellement l'entrée correspondante dans `manifest.json`, régénéré de toute façon à la fin du script)
  puis relance — seuls les fichiers absents seront redemandés à l'API.
- `public/assets/voices/manifest.json` n'est réécrit qu'à partir des fichiers **réellement présents sur
  disque** à la fin du run : il reste toujours cohérent même après une interruption.

## Ajouter un rôle
1. Dans `tools/voices/generate-barks.mjs`, ajoute une entrée dans `ROLES` :
   ```js
   monRole: {
     voice: 'NomDeVoixGemini',       // voir la liste des voix prébuilt Gemini TTS
     tone: 'consigne de ton en anglais, ex. cocky cartoon trickster YELLING taunts',
     persona: 'description courte du personnage pour l’écriture des répliques',
     events: FIGHTER_EVENTS,          // ou une autre liste d'événements si besoin
     variants: 3,
   },
   ```
2. Ajoute la correspondance modèle 3D → rôle dans `src/audio/barks.ts` (`MODEL_TO_ROLE`), si ce rôle
   correspond à un nouveau `ModelId`.
3. Relance le script : seules les nouvelles répliques du nouveau rôle seront générées (reprise automatique).

## Ajouter un événement à un rôle existant
1. Ajoute la clé dans `FIGHTER_EVENTS` (ou la liste `events` du rôle) et une entrée dans `EVENT_HINTS` (courte
   description en anglais du contexte de la réplique) dans `tools/voices/generate-barks.mjs`.
2. Supprime l'entrée du rôle dans `tools/voices/scripts-cache.json` si tu veux forcer la réécriture du texte
   (sinon le script réutilise le cache et régénère uniquement l'audio manquant).
3. Ajoute le type d'événement dans `FighterBarkEvent`/`AnnouncerBarkEvent` (`src/audio/barks.ts`) et abonne-le
   au bus si un événement du jeu doit le déclencher.

## Stratégie de secours (si Gemini TTS échoue)
- **Le jeu ne dépend jamais de la banque de voix pour tourner.** `src/audio/barks.ts` charge
  `public/assets/voices/manifest.json` en tâche de fond ; si le fetch échoue (fichier absent, réseau coupé,
  build sans les assets), `BarkPlayer` reste simplement inactif (`ready = false`) et toutes les répliques sont
  silencieusement ignorées (`console.warn` une seule fois). Aucune exception ne remonte au reste du jeu.
- **Le filet de sécurité, ce sont les bruitages synthétiques du lot LV** (`src/audio/sfx.ts`) : ils sont
  toujours actifs, indépendamment de `barks.ts`, et couvrent déjà `fire`, `hit`, `parry:result`, `ko`,
  `ringout`, `crate:land`, `crate:grab`, `map:warn`, `map:event`, `turn:start`, `ui:click`. Si la génération de
  voix est incomplète ou instable juste avant la démo, la solution la plus sûre et la plus rapide est de **ne
  pas appeler `installBarks(...)`** dans `src/audio/index.ts` (commenter la ligne) : le jeu retombe alors
  entièrement sur ces bruitages synthétiques, sans voix criées, mais sans rien de cassé.
- Si seul un rôle ou un événement particulier pose problème (voix vide, fichier corrompu), il suffit que
  `public/assets/voices/manifest.json` ne liste pas ce couple `(role, event)` — le script ne liste que les
  `.wav` réellement présents et non vides sur disque, donc un échec ponctuel de génération n'y apparaît pas et
  `BarkPlayer.play(...)` ne fait rien pour ce couple (aucun crash).
- En cas de quota Gemini TTS dépassé pendant la génération : relance simplement le script plus tard (voir
  « Relancer la génération » ci-dessus), il reprendra là où il s'est arrêté.
