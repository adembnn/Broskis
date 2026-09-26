# Lot LA · Rendu, persos, caméra, effets
> **Obsolète depuis le pivot temps réel (15h25)** pour : rotation de caméra au `turn:start` et bascule ; chaque vue de l'écran scindé reste sur son joueur (RTVIEW). Référence : `plan/PIVOT-TEMPS-REEL.md`.
Responsable : Adem (sous-agent Sonnet) · Coût : élevé · Dépend de : L0

## Tes chemins
`src/scene/**` **sauf** `src/scene/maps/`, `src/scene/sticker/`, `src/scene/fighter-custom/`. Plus `public/assets/characters/`.

## À reprendre (voir `plan/ASSETS.md`)
`toon-kit.js`, `src/kaykit.js` (avec `loadAsync` et le décodeur meshopt), `src/fx.js`, `src/wow/onomato.js`, les réglages de `design-system-cartoon.md` (§3 et §4).

## Sortie attendue (`install(ctx)` dans `src/scene/index.ts`)
1. **Rendu** : WebGLRenderer, toon en 3 paliers, contours, `RoomEnvironment`, tone mapping et bloom lus dans les tokens. Budget : 150 appels de dessin.
2. **Persos** : chargement des 6 KayKit (armes d'origine masquées), contrôleur d'animations (`idle`, `run`, `jump`, `throw`, `cast`, `block`, `dodge`, `hit`, `death`, `cheer`), squash & stretch.
   - L'arme-sticker du joueur (fournie par LS via `weapon.stickerUrl`) s'accroche à l'os `handslot.r`.
3. **Caméra** :
   - vue épaule du joueur actif ;
   - au `turn:start`, rotation en arc autour du centre de l'arène (≈ 1,1 s, easing, coup de FOV) + bandeau via `camera:cue`, en 3 s maximum, un clic la saute ;
   - suivi du projectile ; montée pour les tirs en cloche ;
   - coup d'impact (arrêt sur image via `loop.setSlow`, secousse = trauma²) ;
   - orbite au ralenti sur le KO ;
   - obstacles devant la caméra rendus transparents.
4. **Aides de visée en 3D** (écoute `aim:update`) : trajectoire en pointillés, cercle d'impact, flèche de recul (rouge si elle éjecte).
5. **Anneau de déplacement** au sol, qui se vide selon `moveLeft`.
6. **Effets** : particules par catégorie d'arme, onomatopées 3D (BONK, KABOOM…), flash sur la cible, chiffres de dégâts.

## Contrôles
`npm run build`. Dans la console : `gameHooks.startMatch()`, puis capture avec `node tools/capture.mjs --out captures/LA`. Au moins 50 images/s. Agents `directeur-artistique` et `auditeur-juice` sur les captures.

## Commit
Tes fichiers seulement, puis pull, push, et mise à jour de `plan/SUIVI.md`.
