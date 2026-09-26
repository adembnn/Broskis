# Lot LVOX · Une seule voix d'animateur, un seul mixage
Responsable : **Titouan** (auteur de LV et LBK) · Coût Claude : faible · Dépend de : LBK, LI, LX (fusionnés sur main)

## Constat (Claude, 14h)
Deux animateurs parlent en même temps :
- **LBK** (`src/audio/barks.ts`) : barks Fenrir pré-générés sur `match:start`, `hit`, `parry:result`, `ringout`, `ko`, `match:end`, `crate:grab`, `scan:result` ;
- **LI** (`src/ia/index.ts` → `say()` de `src/ia/commentary.ts`) : répliques écrites par Gemini, vocalisées par **Gradium** (`api/tts.ts`, voix Marcus), sur `hit`, `parry:result`, `ko`, `crate:grab`, `match:start`, et jouées par `src/audio/commentary.ts`.

Résultat : sur chaque coup, deux voix d'animateur différentes se chevauchent. Troisième source : l'adversaire IA (lot LX, `src/gameplay/ai/taunt-bubble.ts`) émet sa provocation comme `commentary:line`, donc la carte de l'animateur l'affiche comme si l'animateur parlait.

## Décision d'Adem
L'animateur a **une seule voix : Gemini 3.8 Flash TTS, Fenrir**. Gradium sert au clonage de la voix des joueurs (lot LW2, fait par Gemini en parallèle).

## À faire
1. **Un seul lecteur de voix** : `barks.ts` devient la seule file audio pour l'animateur et les persos (priorités, cooldown de 4 à 6 s, bark du perso puis animateur 250 ms après, coupure en fondu de 60 ms, jamais une des 2 dernières répliques). `src/audio/commentary.ts` ne joue plus rien lui-même : il passe ses lignes à cette file.
2. **Répartition** :
   - **Barks pré-générés** pour tous les événements génériques (coup, parade, KO, sortie de ring, caisse, mort subite, victoire).
   - **Répliques Gemini de LI** seulement pour les moments propres à une arme : sa **présentation pendant la pesée** (`weigh_in`) et la **révélation d'une arme scannée** en plein match (Caisse Snap). Elles sont vocalisées en **Gemini TTS Fenrir**, avec la même chaîne « stade » que les barks. Dans `src/ia/index.ts`, retire les `say()` sur `hit`, `parry:result`, `ko` et `match:start`, déjà couverts par les barks.
3. **`api/tts.ts`** : voix de l'animateur = `gemini-3.8-flash-tts`, voix `Fenrir`, même appel que ton `tools/voices/generate-barks.mjs`, texte envoyé **sans** préfixe de ton, comme tu l'as découvert. Garde Gradium en secours si Gemini échoue ou dépasse 6 s. Ajoute les constantes dans `api/_models.ts`. **Le paramètre `voiceId` doit continuer d'accepter un identifiant Gradium** : LW2 s'en sert pour les voix clonées.
4. **Sous-titres** : la carte de l'animateur (`src/ui/hud.ts`) affiche le texte de ce qui est **réellement dit** : `barks.ts` émet `voice:line` `{ text, speaker: 'announcer' | 0 | 1 }` quand une réplique démarre (le `manifest.json` contient le texte). La carte de l'animateur n'affiche que `speaker === 'announcer'`. Ajoute `voice:line` au contrat dans `src/core/events.ts`.
5. **Provocation de l'IA** (LX) : dans `taunt-bubble.ts`, remplace l'émission de `commentary:line` par `playBark` du rôle du perso IA, événement `taunt_turn`. Le texte Gemini reste affiché dans la bulle.
6. **Clonage (LW2)** : Gemini ajoute en fin de `barks.ts` une petite fonction `setVoiceOverride(player, bank)`. Si elle arrive avant ta fusion, garde-la ; sinon laisse-lui la place en fin de fichier.

## Tes chemins
`src/audio/**`, `src/ia/commentary.ts`, `src/ia/index.ts`, `src/ia/tts-client.ts`, `api/tts.ts`, `api/_models.ts` (constantes TTS seulement), `src/ui/hud.ts` (carte de l'animateur seulement), `src/gameplay/ai/taunt-bubble.ts`, `src/core/events.ts` (ajout de `voice:line` seulement).

## Contrôles
- `npm run build` passe.
- Dans le jeu : un match de 3 tours sans jamais deux voix d'animateur en même temps. Sous-titre = voix entendue.
- Pesée : chaque arme est présentée par Fenrir.
- `git pull` avant de commencer (beaucoup de fusions depuis 13h45), puis commit de tes fichiers, pull, push, et ligne `LVOX` dans `plan/SUIVI.md`.
