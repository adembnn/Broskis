# Lot LK2 · Parade : repères visuels, HUD, sons, « NICE! » et feintes
Exécution : **Gemini** · Dépend de : LK (logique fusionnée : événements `parry:cue`, `parry:window`, `parry:streak`, `bro:gauge`, `super:ready`, `attack:nice`, `feint` dans `src/core/events.ts`)

Spécification complète dans `plan/lots/LK-parade.md` (validée par Adem). LK a fait la logique dans `src/gameplay/parry.ts`, mais **pas** les repères ni la commande d'action de l'attaquant. **Crée les dossiers** listés ci-dessous : ils n'existent pas encore, c'est normal.

## Tes chemins (à créer)
- `src/scene/parry-fx/**` (branché depuis `src/scene/index.ts`, une ligne d'installation) ;
- `src/ui/parry-hud/**` (branché depuis `src/ui/index.ts`) ;
- `src/audio/parry-cues/**` (branché depuis `src/audio/index.ts`) ;
- `src/gameplay/aim.ts` (pour « NICE! » et les feintes seulement).

## À livrer
1. **3D (parry-fx)** :
   - anneau d'approche qui part à 3 fois la taille de la cible et se resserre linéairement jusqu'à `tImpact` (données de `parry:window`) ;
   - **bande dorée** sur la cible, d'épaisseur = fenêtre PERFECT ;
   - reflet ✦ au lâcher, liseré rouge de 100 ms sur l'attaquant ;
   - étincelles dorées et gel de 120 ms sur un PERFECT ;
   - zoom et désaturation (pas de ralenti) pendant l'approche.
   - Couleurs : `tokens.js` (`palette.lumiere`, `ui.alerte`, `joueurs.*`).
2. **HUD (parry-hud)** :
   - « !! » doré au-dessus du défenseur, avec sa touche (« SPACE » ou « ENTER »), dès `parry:cue` ;
   - textes « PERFECT! ×2 », « GOOD », « TOO EARLY −140 ms » et « TOO LATE » ;
   - jauge **BRO** par joueur (se remplit sur `bro:gauge`), puis « SUPER READY! » ;
   - aide « PRESS SPACE » qui disparaît après 5 réussites et revient après 2 ratés.
   - Style sticker Vinyle, comme le reste de l'UI.
3. **Sons (parry-cues)** :
   - décompte tic (T−600), tic (T−300), TAC (T), programmé en WebAudio à `tImpact − outputLatency` ;
   - « clang » monté d'un demi-ton à chaque parade de la série ;
   - filtre passe-bas sur la musique pendant l'approche.
4. **Attaquant (aim.ts)** :
   - pendant la charge, un anneau pulse sur l'objet toutes les 400 ms ;
   - relâcher à ±100 ms d'une fermeture émet `attack:nice` et donne +25 % de dégâts ;
   - chaque pulsation en plus émet `feint` ; au-delà du nombre de feintes du palier, le lancer part tout seul.

## Contrôles
- `npm run build` ;
- via les hooks : un tir, puis `parry(0)`, doit afficher PERFECT! avec les étincelles ;
- captures dans `captures/lk2/`.
