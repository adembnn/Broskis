# Lot LTEX · Textures stylisées générées par Nano Banana pour les 3 arènes et leurs objets
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». **Fini et commité à 17h15.** Lis `CLAUDE.md`, skills `anti-slop`, `direction-artistique`, `rendu-premium`.

## Objectif
Des revêtements beaux et cohérents (retour d'Adem : « même des revêtements, c'est pas mal » ; juge Gemini : « aplats uniformes, tonneaux sans texture »), dans un style peint stylisé façon Smash Ultimate / Fall Guys / Sea of Thieves — jamais photoréaliste, jamais « AI slop ».

## À produire (uniquement des fichiers d'assets, un outil et une page d'aperçu)
1. Générateur `tools/textures/generate.mjs` : appelle l'API Gemini image (`gemini-3-pro-image`, voir `api/_models.ts` et `api/sticker.ts` pour l'appel REST). La clé GEMINI_API_KEY est lue par le script Node dans le fichier d'environnement du dépôt principal, exactement comme le fait `tools/anim/juge-gemini.mjs` (copie sa fonction de chargement) ; ne l'affiche jamais, ne la copie jamais. Plusieurs essais par texture, garde le meilleur en le regardant.
2. Textures **tuilables** (bords raccordés, vérifie en posant 2×2 côte à côte ; corrige par fondu en croix si besoin), 1024×1024 en .webp ≤ 300 Ko, dans `public/assets/textures/` :
   - archipel : `hex-herbe`, `hex-pierre` (côtés des dalles), `ruine-pierre` ;
   - galion : `pont-bois` (planches), `coque-bois`, `voile-toile`, `metal-canon` ;
   - cuisine : `plan-travail-bois` (bois de boucher), `carrelage-sol`, `planche-decouper`, `metal-inox` ;
   - communs : `tonneau-bois`, `caisse-bois`.
3. Page `public/textures-apercu.html` : chaque texture en 2×2 tuilé, avec son nom.
4. `public/assets/textures/textures.json` : nom → fichier → usage conseillé (map, objet, répétition conseillée en mètres).

## Interdits
Aucun changement dans `src/` (le lot LMAP3 intègre les textures dans les maps). Rien d'autre que les chemins ci-dessus.

## Rendu (`plan/rendus/LTEX.md`, commité)
Liste des textures avec poids, capture de la page d'aperçu (`captures/ltex/apercu.png`) regardée, défauts restants.
