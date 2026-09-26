# Rendu LMAP2 · Arènes ouvertes façon Smash (Claude Opus, 14h15 → 15h55)

Branche : `worktree-agent-a511eb8784f1d5e5e`. Rien n'est poussé.
Suite au contre-ordre de 15h50, le lot est rendu à LMAP3 (session « Map design »), qui devient propriétaire de `src/scene/maps/**`.

## Commits

| Commit | Contenu | Déjà sur main ? |
|---|---|---|
| `c702891` | Moteur : physique synchrone, one-way, matières standard, dangers annoncés, poussées/chutes. Archipel refait. | oui |
| `be8369e` | Galion ouvert (pont, coque procédurale, mer démontée, gîte). | oui |
| `7d500e9` | Cuisine (billot, îlot, éponge). | oui |
| `6d1f34f` | Pont du Galion en forme de navire, collider convexe exact. | oui |
| `419b4e2` | Boulet préchargé, `maxEvents` (3 anneaux puis stop), apparitions du Galion à z = 0. | **non**, sûr à fusionner |
| `fb88016` | Fusion de main dans la branche, sans conflit (applyEffect de LSMASH et mon calendrier cohabitent). | — |
| `7c3d059` | **À prendre ou laisser par LMAP3.** Kit LKIT branché, arènes temps réel agrandies (fait avant le contre-ordre). | non |

## Fait
- **Cause des « arènes fermées » trouvée et corrigée.** Les colliders de la map étaient créés en asynchrone. Au `match:start`, `fallback-ground.ts` ne trouvait donc aucun sol et créait **un sol invisible de 30 × 30 m à y = 0**. Il n'était jamais retiré, et sur le Galion et la Cuisine on ne pouvait pas tomber.
  - Maintenant : physique synchrone dans `loadMap`, visuels en asynchrone.
  - Le moteur retire aussi tout corps `userData.kind === 'fallback-ground'`.
  - Mesuré : `fallbackGround: false` sur les 3 maps. Un perso poussé sort : `stock:lost(bottom)` sur l'Archipel ; sur le Galion, il se rattrape au bord (mécanique de LSMASH).
- **Plateformes traversables (one-way).**
  - Corps Rapier : `userData = { kind: 'oneway', oneWay: true, topY, id }`. LSMASH l'utilise déjà dans `controllerFilter`.
  - En plus, le moteur n'active le collider que si un perso est au-dessus (hystérésis) : les tirs passent au travers quand personne n'est dessus.
  - Testé sur les 3 maps : on traverse en sautant par-dessous (pic à 3,46 m), on se pose à 2,3-2,4 m, on atterrit en tombant d'en haut.
- **Matières** : fini le toon à 2 aplats et les contours d'encre sur le décor. MeshStandard mat (`materials.ts`). Le décor lointain est étalonné par `tokens.maps.<id>.decor`. Les surfaces jouables et les pièces du kit gardent leur pleine couleur.
- **Dangers lisibles.**
  - Zone rayée jaune/encre qui clignote à 2,5 Hz, fusionnée en 1 appel de dessin.
  - Préavis de 2 tours : chaque joueur a un tour pour fuir. Avant, l'anneau tombait au début du tour de celui qui n'avait pas pu bouger.
  - Archipel : la catapulte, sur son île du fond, pilonne l'anneau extérieur, puis les dalles tombent en cascade depuis l'impact.
  - Galion : le pont (collider kinématique) gîte de 12° ; seule la bande avant éjecte.
  - Cuisine : l'éponge balaie une bande et pousse vers le bout.
- **Structure « une fonction par élément »** dans chaque map : `plateau()`, `plateformes()`, `couverts()`, `fond()`. Les pièces du kit s'y branchent en une ligne (`kit.ts`).
- **API** (`src/scene/maps/api.ts`) : `getArenaBounds()` (centre, rayon, réapparition, voidY) et `isOneWayCollider(c)`.
- Commit `7c3d059`, pour LMAP3 :
  - Les pièces du kit sont chargées sans re-teinte (`instantiate(..., raw)`).
  - Les colliders convexes suivent exactement les contours de `kit.json`.
  - La zone d'alerte peut être un polygone (`waveZone`, `frontZone()`).
  - Le socle rocheux rétrécit avec l'île (`undersides` : `socle_hex_4` ×1,5 / ×1,25 / ×1, puis `socle_hex_3`).
  - Minuterie des dangers dans le type (`everySeconds` / `warnSeconds` / `firstSeconds`) pour le `map-events` temps réel.
  - Arènes : Archipel 26 m (disque de rayon 6), Galion 24,7 × 17,2 m (pont du kit ×1,3), Cuisine 24,7 × 18,2 m (îlot ×1,3). Apparitions à 15 m, 3 plateformes en triangle (2 à 2,2 m, 1 à 4,0 m), couverts à hauteur de torse.

## Pas fait / reste pour LMAP3
- **Cuisine version kit (`7c3d059`)** : sur la capture à 4,5 s, les bocaux, le grille-pain et le fond n'étaient pas encore affichés. Aucune erreur console : probablement un chargement plus long (dressing LDECOR + kit). Voir la capture `cuisine-p3` à 12 s, citée en bas si elle est faite.
- `map-events` en minuterie : laissé au cœur temps réel (consigne). Le moteur réagit seulement à `map:warn` / `map:event`, quelle que soit leur source.
- Brume et ciel de l'Archipel : délavés (halo du soleil de `Sky` + brouillard de 24 à 75 m). C'est à LSKY / LDA2.

## Frictions à régler hors de mes chemins (à transmettre)
1. **Doublons de LDA2 dans `src/scene/render/environment.ts`**, qui recoupent les maps et LDECOR :
   - 8 cônes plats (îles de l'Archipel) ;
   - une 2e mer plate à y = -3. Ma mer à vagues est à -3,2 : ses crêtes traversent le plan et font des « blocs noirs » au premier plan du Galion ;
   - un cylindre sombre de 40 m autour de la Cuisine.

   À retirer : les maps et LDECOR/LSKY font déjà le fond.
2. **Erreur console en boucle** : `CameraDirector.shoulderPose` → `raycaster.intersectObjects` touche un `THREE.Sprite` sans `raycaster.camera`. Il faut `raycaster.camera = camera` ou filtrer les sprites (caméra, RTVIEW / LFIX2).
3. **Hauteur de saut** : le double saut atteint ~1,8 m (0,78 + 1,02). Les plateformes du lot et du kit sont à 2,2-2,8 m. C'est le lot LJUMP (≥ 2,6 m).
4. **Budget d'appels de dessin** : le dressing LDECOR du Galion (flotte multi-meshes) coûte cher. Voir la table.

## Appels de dessin (1 vue, ombres comprises : scène entière / map seule)

| Moment | Archipel | Galion | Cuisine |
|---|---|---|---|
| Avant LMAP2 (turn-based, vinyle) | 201 / — | 215 / — | 161 / — |
| Mes maps seules (avant LDECOR) | 164 / 25 | 170 / 31 | 171 / 32 |
| Après fusion main (LDA2 + LDECOR) | 134 / 46 | 166 / 77 | 138 / 51 |
| `7c3d059` (kit, temps réel) | 120 / 32 | 148 / 56 | 125 / 38 |

Pour l'écran scindé (120 par vue), la map doit viser 30 à 35 au maximum. Le Galion déborde à cause de la flotte de `dressing.ts`.

## Notes /10 (œil de level designer Smash)
- **Archipel : 8/10 en disposition** (plateau net, vide visible, catapulte et anneau rayé très lisibles, one-way testé). **6/10 à l'écran aujourd'hui**, à cause de la brume et du halo de LDA2.
- **Galion : 7,5/10.** Le pont du kit est propre et le bord se lit, tout comme la gîte et sa bande. Il manque une seule mer et moins de navires au fond.
- **Cuisine : 7/10.** La lecture « minuscule sur un îlot » marche. Les couverts sont à vérifier sur la version kit (voir plus haut), et le cylindre de LDA2 cache le fond.

## Captures (dossier local `captures/lmap2/`, non commité)
- `archipel-v3` / `-dessus` / `-v7-loin` / `-v2-alerte` / `-v9-danger-a` : Archipel avant fusion.
- `galion-v8`, `galion-v5-alerte` : Galion.
- `cuisine-v4` : Cuisine.
- Après fusion : `*-m1`.
- Kit temps réel : `*-p2`.
- Outils : `shoot.mjs` (vues, appels de dessin, chute), `event.mjs` (danger), `oneway.mjs`, `calendrier.mjs`.
