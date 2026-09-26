# Lot RTVIEW · Écran scindé + caméras troisième personne verrouillées
Exécution : **agent Claude (Opus)** · Priorité 1 du pivot temps réel (`plan/PIVOT-TEMPS-REEL.md`, qui fait foi).

## Règle d'Adem (15h21) — NON NÉGOCIABLE
**En écran scindé, chaque vue reste TOUJOURS sur le joueur qui lui est attribué** (vue gauche = P1, vue droite = P2), du `GO!` au `GAME!` :
- aucune bascule de point de vue, aucun échange de caméras entre les vues, aucun mouvement de caméra vers l'autre joueur ;
- aucune caméra de tour, aucun plan cinématique partagé (intro, KO, victoire) qui prendrait le contrôle des 2 vues ;
- les effets (secousse, zoom KO, suivi d'éjection) se jouent dans la vue du joueur concerné **sans quitter son joueur**.
Seule exception : le mode solo / vs IA (une seule vue, sur l'humain).

## À livrer
1. **Rendu en 2 vues** (`src/core/ctx.ts`, `src/scene/render/**`) :
   - un seul `WebGLRenderer` ; mode `split` : P1 à gauche, P2 à droite, séparateur de 4 px à la couleur de l'encre ; mode `solo` : 1 vue plein écran ;
   - pour chaque vue : `setViewport` + `setScissor` + `setScissorTest(true)` et sa propre `PerspectiveCamera` (aspect de la demi-vue, FOV vertical 55°) ;
   - les ombres sont calculées **une seule fois** par image (`shadowMap.autoUpdate = false`, puis `needsUpdate = true` avant la 1re vue) ;
   - le post-traitement existant (`postfx.ts` : bloom, vignette, étalonnage) s'applique **une fois** : les 2 vues sont rendues dans la même cible, puis passées dans le compositeur. S'il ne s'adapte pas proprement, désactive le bloom en mode scindé plutôt que de le faire tourner deux fois ;
   - `ctx.three.cameras: [cam1, cam2]` (ajout au contrat) et `ctx.three.camera` = caméra de P1 (compatibilité) ;
   - `ctx.three.viewOf(player)` pour que les effets et l'interface sachent dans quelle vue dessiner.
2. **Caméra verrouillée par joueur** (`src/scene/camera/**`) :
   - placée derrière et au-dessus de son joueur (distance 6,5 m, hauteur 3,2 m, décalage latéral 0,9 m), sur l'axe joueur → adversaire ;
   - le point visé est entre les 2 persos, plus près de l'adversaire ; les 2 toujours dans le cadre ;
   - lissage 0,12 s, collision caméra ↔ décor, occlusion par vue (le décor qui masque devient transparent : reprendre `occlusion.ts` et son optimisation LPERF) ;
   - pendant une éjection, la caméra de la victime suit sa trajectoire ;
   - secousses et zoom KO (effets Smash, `camera:cue`) seulement dans la vue concernée ;
   - expose `forwardOf(player): Vec3` (direction avant horizontale de la caméra) : le déplacement du joueur est relatif à sa caméra (le cœur temps réel, `src/gameplay/**`, l'utilise).
3. Supprime la caméra du tour par tour : bascule vers le défenseur, plans de tour.

## Tes chemins
`src/core/ctx.ts`, `src/scene/render/**`, `src/scene/camera/**`, `src/scene/api.ts` et `registry.ts` si besoin, plus des ajouts au contrat dans `src/core/types.ts`. **Pas** `src/gameplay/**` (RTCORE en parallèle), `src/ui/**` (LUX), `src/scene/fighters/**` (LATK2), `src/scene/weapons/**` (LATK1), `src/scene/maps/**` (LMAP2).

## Contrôles
- `npm run build` passe.
- Captures (Chromium avec GPU : `--use-angle=d3d11 --ignore-gpu-blocklist`, port libre 5300-5399) : écran scindé sur les 3 maps, les 2 persos visibles dans chaque vue.
- 60 i/s visés en 1080p sur la RTX 5060 ; `renderer.info.render.calls` par vue dans le rendu.
