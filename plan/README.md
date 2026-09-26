# BROSKIS : plan de travail partagé

> Snap any real object: it becomes your weapon. Turn-based 3D cartoon duels on crumbling maps, called live by an AI ring announcer.

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

## Le jeu en 30 secondes
- **Parcours** :
  1. PLAY.
  2. Choix du perso : 4 prédéfinis, ou photo d'une personne.
  3. Arsenal de 3 armes, prédéfinies ou photographiées (webcam, import).
  4. **Présentation des armes** : chaque arme sur une carte, présentée à voix haute par l'animateur (comme la pesée d'un match de boxe).
  5. Choix de la map.
  6. Duel à 2 sur le même PC.
  7. KO au ralenti, « Damage Report », revanche.
- **Tour (20 s maximum)** :
  1. Bandeau « P2 — YOUR TURN! » pendant 1 s, et la caméra tourne vers le joueur actif (vue épaule, 3 s maximum, un clic la saute).
  2. **Déplacement** : 6 m (anneau au sol qui se vide) + 1 saut (qui coûte 1,5 m).
  3. **Arme** 1/2/3 → visée à la souris (trajectoire en pointillés, cercle d'impact, flèche de recul) → charge.
  4. **Parade** du défenseur avec ESPACE.
  5. Impact, décor qui réagit, réplique de l'animateur.
- **4 raisons de bouger** :
  - **Caisse Snap** : tous les 2 à 3 tours, annoncée par son ombre ; l'atteindre donne 10 s pour scanner un objet en plein combat ;
  - **angle** : pousser l'autre vers le vide ;
  - **couvert et portée** : le blaster est arrêté par les murs, la grenade passe par-dessus ;
  - **fuir** le danger annoncé.
- **Victoire** :
  - 100 PV (80 à 120 selon le perso) ;
  - le recul grandit quand les PV baissent (façon Smash) ;
  - sortir de la map = KO ;
  - mort subite au tour 7 : l'arène rétrécit, un objet scanné géant tombe du ciel.
- **Armes** (4 catégories) :

| Catégorie | Comportement | Stats (a / b / c) | Anim KayKit |
|---|---|---|---|
| BLASTER | rafale droite, arrêtée par les murs | power / shots / accuracy | `cast`, `raise` |
| GRENADE | cloche, rebond, zone | power / radius / bounce | `throw` |
| THROWABLE | lancer lourd, fort recul, renvoyable | power / speed / knockback | `throw` |
| SHIELD | pose un mur-sticker (couvert), renvoie sur parade parfaite | guard / size / reflect | `block` |

- **Stats et traits** : un budget de 10 points (chaque stat de 1 à 6) + 1 trait parmi `bouncy`, `sticky`, `explosive`, `heavy`, `healing`, `split`, `slippery`, `loud`.
- **Arsenal** : 3 armes ; une arme utilisée recharge 1 tour.
- **Parade** : Parfaite ≤ 90 ms (0 dégât, renvoi), Bonne ≤ 220 ms (moitié), Ratée. Les repères visuels, combos et difficulté seront précisés, en attente de validation par Adem.
- **Maps**, dans l'ordre de construction :
  1. **Archipel qui s'effrite** : dalles hexagonales qui tombent, tonneaux, catapulte, l'anneau extérieur tombe tous les 2 tours ;
  2. **Galion dans la tempête** : canon, barils, vergue, le pont gîte tous les 3 tours ;
  3. **Cuisine géante** : minuscules sur un plan de travail, grille-pain tremplin, rouleau, évier = sortie, éponge géante.

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
type Phase = 'title'|'fighter-select'|'arsenal'|'reveal'|'map-select'|'turn-intro'|'move'|'aim'|'resolve'|'snap-time'|'ko'|'end';
interface Weapon { id; object; name; category; why; stats:{a,b,c}; trait; palette:[string,string];
  stickerUrl?; lines:{intro,hit,miss,parried}; source:'preset'|'scan'|'cache'; cooldown }
interface FighterDef { id; name; model:'barbarian'|'knight'|'mage'|'rogue_hooded'|'skeleton_mage'|'skeleton_warrior'|'custom';
  look?:{primary,secondary,hair?,accessory?,faceUrl?}; hpMax; power; agility; trait?; portraitUrl?; catchphrase? }
interface GameState { phase; turn; active:PlayerId; players:[PlayerState,PlayerState]; mapId; seed;
  suddenDeath; timerLeft; crate?:{pos,landsInTurns}; winner?; lastEvent? }
interface Ctx { bus; state; three:{scene,camera,renderer}; loop; physics; rng; demo:boolean }
type Install = (ctx: Ctx) => void | Promise<void>;   // chaque dossier exporte install() depuis son index.ts
```

Événements du bus (`src/core/events.ts`, noms figés) :

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
- `window.gameHooks` : `startMatch(opts)`, `move(dx,dz)`, `jump()`, `pickWeapon(i)`, `aim(yaw,pitch)`, `fire(power)`, `parry(offsetMs)`, `grabCrate()`, `scan(objectKey)`, `skipCamera()`, `forcerVictoire(p?)`, `setSeed(n)`, `action(text)`.
- `?demo=1` : graine fixe, IA lue depuis `public/demo-cache/`, régie F1 à F5, F9 panique.

## Pipeline IA (lot LI)
- **Scan d'objet** : photo réduite à 768 px, envoyée à deux services en parallèle :
  - `api/scan-object` : Gemini Flash vision, sortie JSON (catégorie, stats, trait, répliques) en environ 1 s ;
  - `api/sticker` : Nano Banana 2 Lite, dessin cartoon sur fond `#FF00FF`, environ 4 s ;
  - le navigateur détoure puis extrude le sticker en 3D (lot LS).
- **Animateur** : répliques générées **et vocalisées (Gradium) pendant la présentation des armes**. En direct, seulement pour les moments rares.
- **Perso photo** (lot LP) : attributs Gemini, puis corps KayKit recoloré, puis visage sticker Nano Banana. Les vedettes en vraie 3D sont préparées à l'avance (lot LP2).

## Horaire
| Heure | Jalon |
|---|---|
| 12h30 | L0 poussé : tout le monde peut démarrer |
| 15h00 | boucle jouable et belle sur l'Archipel |
| 16h30 | Galion |
| 17h30 | Cuisine + vague 2 (adversaire IA, Scandex, voix clonée) |
| 18h00 | **GEL** : polish seulement |
| 19h00 | opt-in + vidéo |
| 19h30 | répétition chronométrée |
| 20h00 | démo |
