# Lot LFACE · « On s'est pris en photo, on est dans le jeu » (photo → combattant)
Exécution : **agent Claude (Opus)** · Feature ESSENTIELLE selon Adem : « c'est ultra drôle si je suis avec mon pote, qu'on s'est pris en photo tous les deux, qu'on est dans le jeu, et en écran scindé on voit nos personnages se battre ».

## Existant (lot LP, fusionné à 13h35, à vérifier de bout en bout)
- `api/scan-fighter.ts` : Gemini extrait les traits, couleurs et accessoires, et Nano Banana dessine le visage ;
- `src/ia/fighter/index.ts` (`scanFighter`) ;
- `src/scene/fighter-custom/index.ts` (`applyFighterLook` : recoloration, **visage en sticker 3D sur l'os de la tête**) ;
- `src/ui/screenFighters.ts` (capture webcam ou photo, forge, Confirmer / Refaire, bouton « USE MY VOICE » du lot LW2).
**Attention** : la recoloration LP patchait des `MeshToonMaterial`. Le lot LDA2 est passé en `MeshStandardMaterial` : la recoloration est sans doute cassée. Vérifie.

## Objectif : reconnaissable et hilarant en 15 s
1. **Tête « figurine à ressort »** : la tête du perso KayKit est remplacée par, ou recouverte d'une **grosse tête (×1,6)** portant le **visage cartoon du joueur** (portrait Nano Banana Pro, style cohérent avec le jeu, grands yeux, expression drôle). Elle doit être lisible **de face**, et c'est la vue qu'a l'adversaire en écran scindé. Les cheveux et la couleur de peau viennent de la photo, la tête a un léger rebond quand il court.
2. **Corps** : couleurs de la tenue de la photo sur le corps KayKit le plus proche. Les couleurs d'équipe P1 / P2 restent lisibles (liseré ou brassard).
3. **Nom** : le joueur tape son prénom (ou Gemini en propose un surnom drôle, modifiable). Il s'affiche dans son HUD et sur l'écran de fin.
4. **Voix** : branche la voix clonée du lot LW2 si le joueur l'a enregistrée : son perso crie avec SA voix.
5. **Parcours à 2** : sur l'écran de choix, P1 puis P2 se prennent en photo à la webcam, ou déposent une photo. Pendant la génération d'environ 15 s, on voit la forge et l'autre joueur peut déjà faire son scan. Les 2 persos apparaissent **côte à côte en 3D** sur l'écran de choix, en pose de combat, avant de valider.
6. **Robustesse** :
   - photo floue, pas de visage, refus de sécurité : message clair + perso par défaut ;
   - cache par photo ;
   - délai maximum de 25 s, puis secours.

## Confidentialité (dépôt PUBLIC)
Aucune photo ni aucun visage généré n'est écrit sur disque, dans le dépôt ou dans les logs : tout reste en mémoire (URL blob).
Pour tes tests, **n'utilise pas de photo de personne réelle**. Génère un visage fictif avec l'API d'images du projet (`/api/sticker` ou l'appel Nano Banana de `api/scan-fighter.ts`), ou utilise un visage d'illustration.

## Tes chemins
`api/scan-fighter.ts`, `src/ia/fighter/**`, `src/scene/fighter-custom/**`, l'écran de choix des persos (`src/ui/screenFighters.ts` : le lot LUX refait l'interface en parallèle, garde sa structure et fais des modifications ciblées).
**Pas** `src/scene/fighters/**` (LATK2), `src/gameplay/**` (RTCORE).

## Contrôles
- `npm run build` passe.
- Test de bout en bout (Playwright, faux flux de caméra : `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m ou mjpeg d'un visage fictif>`, ou dépôt d'un fichier image) : 2 persos créés depuis 2 photos fictives, puis visibles en match, avec capture de face.
- Temps mesurés : photo → perso prêt, par étape.
- Planche `captures/lface/planche.png` : la photo fictive, le portrait généré, le perso en jeu de face et de dos.
