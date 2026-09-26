# BROSKIS : plan de travail partagé

> Snap any real object: it becomes your weapon. Real-time 3D cartoon duels, split screen, on crumbling maps, called live by an AI ring announcer.

**Pivot 15h25 : le jeu est passé du tour par tour au temps réel 1v1 en écran scindé. `plan/PIVOT-TEMPS-REEL.md` fait foi** ; ce fichier le résume sans le recopier.

Hackathon « {Tech: Europe} AI Gaming Hack » (Voodoo × Google DeepMind), samedi 26/09.
- **18h00** : gel des fonctionnalités.
- **19h00** : opt-in + vidéo de présélection + jeu jouable.
- **20h00** : démo live de 2 min.

Jury : Voodoo (compris en 3 s, addictif) + DeepMind (IA indispensable).

## Comment prendre un lot
1. `git pull`, puis ouvre `plan/SUIVI.md` et mets ton nom et l'heure sur la ligne du lot. Commit + push de cette seule ligne **avant** de commencer.
2. Ouvre Claude Code à la racine du dépôt et écris : « Fais le lot `plan/lots/<fichier>.md` ».
3. Le lot dit quels chemins tu as le droit de toucher. **Rien d'autre**, sinon on se marche dessus.
4. Avant de rendre : `npm run build` doit passer. Commite **tes fichiers nommés** (`git add <fichiers>`, jamais `git add -A`), puis `git pull --no-rebase` et `git push`. Mets ta ligne de `SUIVI.md` à jour.
5. Un point de contrat (types, événements) te manque ? N'invente rien en douce : ajoute-le dans `src/core/` en le signalant dans `SUIVI.md` (colonne Notes).

Installer le 2e PC (Titouan) :
1. `git clone https://github.com/adembnn/Voodoo-Hack` ;
2. `npm ci` ;
3. `npx playwright install chromium` ;
4. `git config --global user.name/user.email` ;
5. crée `.env` (demande les clés à Adem, jamais par écrit public) ;
6. `claude` dans le dossier, et accepte la confiance du dossier.

## Le jeu en 30 secondes (temps réel, détails : `plan/PIVOT-TEMPS-REEL.md`)
- **Parcours** : PLAY → photo d'une personne ou perso prédéfini (LFACE : grosse tête au visage du joueur) → arsenal de 3 armes, prédéfinies ou photographiées (LSCAN) → présentation des armes par l'animateur (pesée) → choix de la map → `READY?` 3-2-1 `GO!` → combat → `GAME!` au ralenti → écran de fin, revanche.
- **Écran scindé vertical** : P1 à gauche, P2 à droite, un seul rendu, 120 appels de dessin par vue au maximum. **Chaque vue reste toujours sur son joueur** (règle d'Adem) : caméra troisième personne verrouillée derrière lui, axe joueur → adversaire, les 2 persos dans le cadre. Contre l'IA (RTBOT) : plein écran.
- **Contrôles** (visée automatique verrouillée, pas de souris) : P1 ZQSD, ESPACE saut ×2, F tir (maintenir = charger), G bloquer/parer, 1-2-3 armes · P2 flèches, MAJ DROITE, L, K, 8-9-0. Manettes acceptées.
- **Combat** : course à 6,5 m/s, double saut, bords ouverts, rattrapage au bord. Chaque arme recharge en secondes après usage (BLASTER 1,2 s, GRENADE 3 s, THROWABLE 4 s, SHIELD 8 s). **Blocage** maintenu : dégâts ÷ 3, recul ÷ 2. **Parade parfaite** : bloquer moins de 150 ms avant l'impact, repérée par un anneau qui se referme autour du projectile (400 ms) ; renvoi, ralenti, « PERFECT! ».
- **Victoire façon Smash** : dégâts en %, éjection qui grandit avec le %, 2 vies (1 en démo), sortie de l'arène = vie perdue. Mort subite à 3:00 (les 2 à 150 %).
- **Caisse Snap** toutes les 35 s : la toucher donne instantanément une arme bonus (objet déjà scanné ou du cache), sans pause. **Dangers de map** sur minuterie (20 à 30 s, annoncés 3 s avant).
- **Abandonné** : tours, bascule de caméra vers le défenseur, budget de déplacement, feintes / NICE, IA au tour par tour.
- **Armes** (4 catégories, stats et traits inchangés) :

| Catégorie | Comportement en temps réel | Stats (a / b / c) |
|---|---|---|
| BLASTER | rafale de 3 tirs droit sur l'adversaire (avance selon sa vitesse), arrêtée par les murs | power / shots / accuracy |
| GRENADE | cloche calculée jusqu'à l'adversaire, rebond, zone | power / radius / bounce |
| THROWABLE | lancer tendu, fort recul | power / speed / knockback |
| SHIELD | mur-sticker de 5 s posé entre soi et l'adversaire | guard / size / reflect |

- **Stats et traits** : budget de 10 points (chaque stat de 1 à 6) + 1 trait parmi `bouncy`, `sticky`, `explosive`, `heavy`, `healing`, `split`, `slippery`, `loud`.
- **Maps** : Archipel qui s'effrite, Galion dans la tempête, Cuisine géante ; plateaux de 26 à 28 m, plateformes flottantes, couverts à hauteur de torse (LMAP3, LSKY, LDECOR).

## Lots en cours (d'après `plan/SUIVI.md`, 16h)
| Lot | Sujet | Chemins principaux |
|---|---|---|
| RTCORE | cœur temps réel (déplacement, recharges, blocage, parade, caisse) | `src/gameplay/**` |
| RTVIEW | écran scindé + caméras verrouillées | `src/core/ctx.ts`, `src/scene/camera/**`, `src/scene/render/**` |
| RTBOT | adversaire IA temps réel + Gemini stratège | voir `plan/lots/RTBOT-ia-temps-reel.md` |
| LUX | HUD scindé, Settings, guidage débutant | `src/ui/**` |
| LATK1 · LATK2 | objets en main / en vol / à l'impact · animations d'attaque et de défense | `src/scene/weapons/**` · `src/scene/fighters/**`, `src/scene/animation/**` |
| LFACE · LSCAN | photo → combattant (grosse tête) · photo → arme | `src/ia/fighter/**`, `src/scene/fighter-custom/**` · `src/ia/**`, `src/scene/sticker/**` |
| LMAP3 · LSKY · LJUMP | arènes agrandies + assets · panoramas 360° · constantes de saut | `src/scene/maps/**` · `gameplay/tuning.ts` (saut) |
| LPERF · LLOAD | fluidité (paliers de qualité) · zéro attente | — · `src/core/preload.ts`, `src/ui/loading/**` |
| LFIX2 · LDA2 · LSMASH-FX · LBK2 · LAB · LAN | caméra/parcours · style · effets Smash · voix · labo `?lab=1` · animation (Gemini) | voir leurs lots |
| LD | démo, vidéo de secours, bande-annonce (après 18h) | `demo/**` |

## Règles d'or (voir aussi `CLAUDE.md`)
- **Tout le texte du jeu est en anglais.** Le code et les documents peuvent être en français.
- **L'IA interprète, le code arbitre** : Gemini propose, le code borne et décide des dégâts.
- **Clés API côté serveur uniquement** (`.env`, fonctions `api/*`), jamais de `VITE_*`.
- **Toute valeur visuelle** vient de `src/art/tokens.js`.
- **Inventaire avant génération** : les assets sont listés dans `plan/ASSETS.md`.
- **Sous-agents** : Sonnet en medium par défaut, Opus seulement pour le design et le game design.

## Contrats partagés (lot L0, dans `src/core/`)
Les modules ne s'appellent pas entre eux : ils **émettent et écoutent des événements** sur le bus, et lisent l'état central.

```ts
// src/core/types.ts (extrait)
type PlayerId = 0 | 1;
type Category = 'blaster' | 'grenade' | 'throwable' | 'shield';
type Trait = 'bouncy'|'sticky'|'explosive'|'heavy'|'healing'|'split'|'slippery'|'loud';
type MapId = 'archipel' | 'galion' | 'cuisine';
type Phase = 'title'|'fighter-select'|'arsenal'|'reveal'|'map-select'|'countdown'|'fight'|'ko'|'end'
  |'turn-intro'|'move'|'aim'|'resolve'|'snap-time'; // phases de tour : encore dans le type, plus utilisées en match
interface Weapon { id; object; name; category; why; stats:{a,b,c}; trait; palette:[string,string];
  stickerUrl?; lines:{intro,hit,miss,parried}; source:'preset'|'scan'|'cache'; cooldown }
interface FighterDef { id; name; model:'barbarian'|'knight'|'mage'|'rogue_hooded'|'skeleton_mage'|'skeleton_warrior'|'custom';
  look?:{primary,secondary,hair?,accessory?,faceUrl?}; hpMax; power; agility; trait?; portraitUrl?; catchphrase? }
interface GameState { phase; turn; active:PlayerId; players:[PlayerState,PlayerState]; mapId; seed;
  suddenDeath; timerLeft; crate?:{pos,landsInTurns}; winner?; lastEvent? }
interface Ctx { bus; state; three:{scene,camera,renderer}; loop; physics; rng; demo:boolean }
type Install = (ctx: Ctx) => void | Promise<void>;   // chaque dossier exporte install() depuis son index.ts
```

Événements du bus (`src/core/events.ts`, noms figés). **Temps réel** : `turn:start`, `turn:end`, `move:update`, `parry:window` ne sont plus émis ; `camera:cue` `turn-swing` n'existe plus en match. Ajoutés : `block {player, on}`, `weapon:ready {player, index}`, `countdown {n}`, `match:banner {kind:'ready'|'go'|'game'}`, `stock:lost`, `respawn`. `parry:result` est émis quand un projectile touche un joueur qui bloque.

| Événement | Données |
|---|---|
| `phase:change` | `{from, to}` |
| `turn:start` / `turn:end` | `{turn, active}` |
| `move:update` / `move:jump` | `{player, pos, moveLeft}` / `{player}` |
| `weapon:pick` | `{player, index}` |
| `aim:update` | `{player, dir, power}` |
| `fire` | `{player, weapon, dir, power}` |
| `projectile:spawn` | `{id, weapon, from, vel}` |
| `projectile:incoming` | `{id, target, etaMs}` (déclenche les repères de parade) |
| `parry:result` | `{player, grade:'perfect'\|'good'\|'miss', deltaMs}` |
| `hit` | `{target, attacker, weapon, damage, knockback, crit}` |
| `shield:placed` | `{player, weapon, pos}` |
| `map:warn` / `map:event` | `{mapId, kind, turnsLeft?, area?}` |
| `prop:triggered` | `{propId, kind}` |
| `crate:warn` / `crate:land` / `crate:grab` | `{pos}` / `{pos}` / `{player}` |
| `scan:start` / `scan:result` | `{player, source}` / `{player, weapon}` |
| `ringout` / `ko` | `{player}` / `{player, cause:'hp'\|'ringout'}` |
| `match:end` | `{winner}` |
| `commentary:line` | `{text, priority, audioUrl?}` |
| `camera:cue` | `{shot:'turn-swing'\|'follow-projectile'\|'impact'\|'ko-orbit', target?}` |
| `slowmo` | `{factor, ms}` |

Tests par script (obligatoires pour les agents du harnais) :
- `window.gameState` : l'état en JSON.
- `window.gameHooks` (temps réel, `src/core/types.ts`) : `startMatch({ split: true, map, stocks, vsAI })`, `input(player, action, down)` (actions `up` `down` `left` `right` `jump` `weapon1` `weapon2` `weapon3` `fire` `parry` ; même chemin que le clavier), `setSeed(n)`, `forcerVictoire(p?)`, `scanObjectFromUrl(url, opts?)`, `scanFighterFromUrl(url, player)`, `grabCrate()`, `scan(objectKey)`. Hérités du tour par tour, agissent sur P1 seulement : `move`, `jump`, `pickWeapon`, `fire`, `parry` (bloque pour P2) ; `aim` ne fait plus rien.
- `tools/capture.mjs --parcours` appelle chaque hook avec **un seul** argument : pour `input`, passer par le champ `attendre` (voir `demo/parcours.json`).
- `?demo=1` : graine fixe, IA lue depuis `public/demo-cache/`, 1 vie par joueur, régie F1 à F5 + F9 (événement `demo:cue` ; aujourd'hui seule F4 est branchée : P2 passe à 150 %).

## Pipeline IA (lot LI)
- **Scan d'objet** : photo réduite à 768 px, envoyée à deux services en parallèle :
  - `api/scan-object` : Gemini Flash vision, sortie JSON (catégorie, stats, trait, répliques) en environ 1 s ;
  - `api/sticker` : Nano Banana 2 Lite, dessin cartoon sur fond `#FF00FF`, environ 4 s ;
  - le navigateur détoure puis extrude le sticker en 3D (lot LS).
- **Animateur** : répliques générées **et vocalisées (Gemini TTS, voix Fenrir ; repli Gradium) pendant la présentation des armes** ; en combat, banque de répliques pré-enregistrées (LBK, LVOX) et Gemini pour les moments rares (arme de la Caisse Snap). Combattants : voix Gradium, clonée par joueur (LW2).
- **Perso photo** (lot LP) : attributs Gemini, puis corps KayKit recoloré, puis visage sticker Nano Banana. Les vedettes en vraie 3D sont préparées à l'avance (lot LP2).

## Horaire
| Heure | Jalon |
|---|---|
| 12h30 | L0 poussé : tout le monde peut démarrer |
| 15h25 | **pivot temps réel** (`plan/PIVOT-TEMPS-REEL.md`) |
| 16h30 | combat temps réel jouable en écran scindé sur l'Archipel |
| 17h30 | photo → perso et photo → arme de bout en bout, bot temps réel, 3 maps |
| 18h00 | **GEL** : polish seulement |
| 19h00 | opt-in + vidéo |
| 19h30 | répétition chronométrée |
| 20h00 | démo |
