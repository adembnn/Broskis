# Rendu LE2E · de la photo à l'objet jouable, dans le vrai jeu
Agent Claude (Opus), branche `worktree-agent-a5399d4fc3ca2735d`, 16h10 → 17h50.

## Les tests
**`npm run e2e:photo -- --visages <dossier des 2 visages fictifs>`** (`tools/e2e/photo-jouable.mjs`) joue le parcours d'un joueur dans le VRAI jeu (`http://localhost:<port>/`, pas une page de test) :
- **vrais gestes** : clics (PLAY, Snap yourself, Snap a real object, pastille de catégorie, Confirm, Ready, Skip, arène), **import de fichier** par le sélecteur du navigateur pour P1 et **glisser-déposer** pour P2, **vraies touches** en combat (1-2-3 / 8-9-0 pour l'arme, F / L pour lancer) ;
- **vraies API** (Gemini, Nano Banana) : le script lance son propre Vite (port 5300-5399, `tools/e2e/vite.e2e.config.mjs` : sans rechargement à chaud) et n'arrête que son PID ; un seul navigateur, sans fenêtre, sur la carte NVIDIA ;
- **photos réelles d'Adem** lues à leur chemin absolu, jamais copiées ; **masquées** sur toutes les captures (carte, forge) ; canette **dessinée** (`tools/e2e/canette-dessinee.jpg`, Adem n'en a pas) ; persos = 2 visages **fictifs** générés ;
- 2 matchs en écran scindé : P1 chaise, feutre, tasse · P2 canette, tabouret, téléphone ; puis mocassin, pendule, lampe · roi d'échecs, montre, canard (préréglé, pour le rebond). Les 4 objets comparés passent en « throwable » par la pastille de catégorie : même règle, seule la physique change ;
- chaque arme est lancée 2 fois : **coup au but à 7 m** (% remis à 0) puis **tir long** sur une cible intouchable (portée réelle, rebonds, éclats, flaque au sol) ;
- mesures = **événements du bus** (`fire` + recharge posée, `projectile:spawn`, `hit`, `projectile:bounce`, `ground:slippery`, `projectile:end`, `scan:progress`) et taille de l'objet en main lue dans la scène (attendue = `lookOf`, la taille que le jeu tire de la taille réelle) ; recul comparé « à 0 % » (sans l'effet du % ni d'un critique) ;
- rapport `reports/e2e/<horodatage>/index.html` : verdict VERT / ROUGE par critère, tableau des mesures, captures (carte, en main, en vol, impact, au sol), `mesures.json`, `evenements.json` ; toute perte du contexte WebGL est signalée.

**`tools/e2e/portrait-tardif.mjs`** : retient la réponse « portrait » de `/api/scan-fighter` (réseau lent simulé, vraie API derrière) ; VERT à 60 s de retard : écran débloqué à 30 s (tête de secours), combat à 43 s, **grosse tête posée en plein match à 66 s**.

**`tools/e2e/objet-visible.mjs`** : état de l'objet tenu (visible, couches, matériaux, écart à la main, position à l'écran) et les 4 images « vue du lanceur » (chaise et canette, en main puis en vol).

**`npm run e2e:attente -- --visages <dossier>`** (`tools/e2e/film-attente.mjs`, demande d'Adem 17h55) : film des attentes, une capture toutes les 0,5 s pendant la génération d'une tête (visage fictif) et d'un objet (chaise, photo masquée), en bandes chronologiques ; 3 passages (réseau normal, ralenti de 8 s, API coupée) ; critères : texte progressif (≥ 3 états), image qui se révèle, 3D qui se construit, aucune seconde immobile, validation bloquée tant que la tête / l'objet 3D n'est pas affiché, pas de sortie automatique à 8 s de retard, boutons Retry et Default si l'API est coupée. Rapport `reports/e2e/attente-<horodatage>/index.html`.

## Jointures réparées (petits commits « LE2E : »)
1. **Carte d'arme sans physique** : `weapon.physics` (LSCAN) n'était visible nulle part avant le match → ligne « 9.5 kg · 85 cm · fabric · fragile · splashes · bouncy » (`src/ui/weaponCard.ts`, `src/ui/styles.ts`).
2. **Forge qui montrait un autre objet** : le sticker TARDIF du scan précédent (objet validé sans attendre) s'affichait dans la forge du scan suivant (la canette de P2 montrait la tasse de P1). La forge ne s'identifie plus que sur SON étape `stats` (`src/ui/loading/forge.ts`).
3. **Portrait tardif perdu** : au-delà de 25 s, la requête était abandonnée → perso sans visage pour tout le match. L'écran se débloque toujours à 25 s, la requête continue (75 s) ; à l'arrivée, `fighter:portrait` (nouvel événement, `src/core/events.ts`) → grosse tête posée EN JEU avec un pop, plaque du HUD et écran de choix à jour (`src/ia/fighter/index.ts`, `src/scene/fighters/index.ts`, `src/ui/hud.ts`, `src/ui/screenFighters.ts`). LFACE l'a étendu au dos de la tête (9baa001). Scan des 2 visages vérifié en parallèle.
4. **Objet rebondissant qui ne rebondissait jamais** : un objet léger (feutre 20 g) volait 85 m en ligne droite sans gravité. Gravité minimale de 6 m/s² pour un objet lancé rebondissant (`src/gameplay/physics-feel.ts`).
5. **On ne voyait pas son objet** (retour d'Adem : « je ne vois pas du tout la chaise en main, ni la chaise lancée ») : l'objet était bien dessiné, mais c'est un sticker plat tenu PAR LA TRANCHE face à la caméra, pile derrière le corps et la grosse tête. Caméra d'épaule plus à droite et plus haute (`src/scene/camera/tokens.ts` : 0,9 → 2 m, 3,2 → 3,6 m) ; dans SA vue seulement, sa grosse tête ×0,85 et translucide (0,6) pendant la charge et tant que son objet vole (`src/scene/fighters/ownHead.ts`, copies de matériaux : textures LFACE intactes) ; objet tenu à droite de la main et tourné vers la caméra de chaque vue (`src/scene/weapons/hand.ts`) ; en vol, l'objet fait face à la caméra de chaque vue et tourne dans le plan de l'image (`src/scene/weapons/flight.ts`) ; lueur de charge adoucie. Avant / après : `reports/e2e/objet-visible-1726/` → `reports/e2e/objet-visible-1747/`.
6. Fusion de main : conflit sur `src/scene/weapons/tokens.ts` résolu en gardant la nouvelle échelle « vinyle gonflé » (DA, LBENCH) et les réglages LE2E de la main.

Relevé mais pas un bug du jeu : 3D blanche sur les captures des passages 2 et 3 = contexte WebGL perdu pendant l'arsenal, après 6 s de page figée (puce Intel partagée avec une RAM saturée par la dizaine d'agents). Le test passe désormais sur la carte NVIDIA.

À suivre (hors de mes fichiers) : le sticker Nano Banana de la chaise montre parfois 2 chaises et du texte (« SPIN BLOCK ») ; le projectile part du centre du perso, donc au tout début du vol l'objet passe derrière la tête translucide du lanceur.

## Chaise contre canette (lancées toutes les deux, mesures en jeu, rapport 5)
| Mesure (événements du bus) | Chaise de bureau | Canette | Rapport |
|---|---|---|---|
| Masse estimée par Gemini, bornée par le code | 10 kg | 0,35 kg | ×29 |
| Dégâts (`hit.damage`, % remis à 0) | 32 % | 12 % | ×2,7 |
| Recul à 0 % (`hit.launch`, sans l'effet du %) | 3,5 m/s | 1,5 m/s | ×2,3 |
| Vitesse au lâcher (`projectile:spawn.vel`) | 11,7 m/s | 19,7 m/s | ×0,59 |
| Portée (tir long, cible intouchable) | 12,6 m, retombe au sol | 69 m, file tout droit | ×0,18 |
| Recharge (posée au `fire`) | 7,2 s | 3,6 s | ×2 |
| Taille en main (scène) | 0,95 m | 0,54 m | ×1,8 |

Les 4 objets comparés, du plus léger au plus lourd : feutre 20 g < canette 0,35 kg < tabouret 2,8 kg < chaise 10 kg → dégâts 5 < 12 < 25 < 32 %, vitesse 24,3 > 19,7 > 11,7 = 11,7 m/s (plancher), recharge 2,4 < 3,6 < 6,7 < 7,2 s.

## Film des attentes : passage de référence (avant LWAIT)
`reports/e2e/attente-20260926-1754` : 8/13 VERT. Vert : texte progressif (tête 5 états, objet 6), image qui se révèle, 3D de la tête (vitrine), tête jamais immobile plus de 0,5 s, « Ready » bloqué jusqu'à la tête (11,8 s), réseau ralenti de 8 s sans sortie de l'écran des persos. Rouge : pas de 3D de l'objet dans l'encart, 7 s immobiles pendant le dessin du sticker, « Confirm » actif dès les stats, API coupée sans bouton « Default » (tête : « Retry » seul ; objet : arme de secours avec « Confirm / Retry »).

## Rapports
| Heure | Rapport | Verdict |
|---|---|---|
| 16h34 | `reports/e2e/20260926-1634` (référence, main d'avant LSCAN/LATK1/LFACE) | 0/11 : parcours arrêté aux persos |
| 16h45 | `reports/e2e/20260926-1645` (main avec LSCAN/LATK1/LFACE) | 6/11 |
| 17h01 | `reports/e2e/20260926-1701` | 9/11 (3D blanche : contexte WebGL perdu) |
| 17h08 | `reports/e2e/20260926-1708` (carte NVIDIA) | 9/11 |
| 17h15 | `reports/e2e/20260926-1715` | **11/11** |
| 17h41 | `reports/e2e/20260926-1741` (nouvelle caméra, objet face caméra, échelle vinyle gonflé) | 10/11 (rebond : feutre tiré hors de l'arène par le test, corrigé) |
