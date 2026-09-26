# Trailer BROSKIS — storyboard (v1, 26/09 12:25)

Deux livrables, une seule timeline :
- **Trailer 60 s** (vidéo de secours + réseaux) → `captures/trailer/broskis-trailer-60.mp4`
- **Coupe 15 s** (ouvre la démo live à 0:00) → `captures/trailer/broskis-trailer-15.mp4`

Décisions (grilling du 26/09 avec Adem) : tout est rendu dans le jeu (aucun plan filmé), voix de
l'animateur Gradium + musique générée par code, mise en scène autorisée pour les fonctions pas finies
(voix → combattant), code rangé dans `src/trailer/` + `tools/trailer/`, validation par
`directeur-artistique` puis `critique-aaa` avant de montrer à l'humain.

## Grammaire (non négociable)

- **Tempo 130 BPM** : 1 temps = 0,4615 s = 27,7 images à 60 i/s. Chaque coupe tombe sur un temps.
- **Aucun zoom, aucun changement de focale.** Mouvements autorisés : orbite, travelling latéral,
  grue (montée), panoramique fouetté (whip pan), roulis (dutch 5–10°), tremblement à l'impact seulement,
  « push-in » = la caméra avance physiquement (parallaxe réelle), FOV fixe.
- **Transitions de la direction « Vinyle »** : pas de fondu. Coupes sèches, whip pan, ou **sticker
  claqué** plein écran qui se décolle (`durees.snap` 120 ms / `durees.decolle` 180 ms) — c'est notre
  signature.
- Texte : 5 mots max par carton, police `polices.titre`, entrée en « slam » (échelle 1,15 → 1,0,
  `cubic-bezier(0.175,0.885,0.32,1.275)`, 250 ms), jamais deux cartons d'affilée.
- Silence : 2 trous de silence total (avant le climax, avant le titre final). C'est eux qui font taper
  les impacts.
- Couleurs, polices, durées : lues dans `src/art/tokens.js`, jamais en dur.

## Timeline 60 s (temps en secondes · T = numéro de temps musical)

| Temps | T | Plan | Caméra | Texte / son |
|---|---|---|---|---|
| 0,0–1,8 | 0–4 | **HOOK** : une banane géante percute P2, la dalle se fissure, P2 s'envole | Travelling latéral rapide qui suit la banane, tremblement à l'impact | Pas de musique : juste l'impact + animateur `crit-*` coupé net |
| 1,8–2,3 | 4–5 | Noir 3 images → sticker « SNAP » claqué | — | Kick de départ de la musique |
| 2,3–5,5 | 5–12 | **REVEAL IA** : viseur photo sur un mug réel (photo du cache démo), flash, le mug se détoure en sticker, s'extrude en 3D | Plan fixe → orbite 120° autour du sticker en 1,4 s (ease-out) | Carton **« SNAP ANYTHING. »** |
| 5,5–7,4 | 12–16 | La carte d'arme se retourne : nom + stats + trait | Travelling latéral le long de la carte | Voix : présentation de l'arme (`match_intro-*`) |
| 7,4–9,2 | 16–20 | Le mug en main de P1, tir, projectile qui traverse l'écran | Whip pan qui suit le projectile | Carton **« FIGHT WITH IT. »** |
| 9,2–13,8 | 20–30 | **VOIX → COMBATTANT** (mise en scène) : onde sonore d'un cri enregistré, micro qui pulse, la silhouette du combattant se remplit | Grue qui monte du micro au combattant | Carton **« SHOUT. BECOME A FIGHTER. »** · cri en boucle |
| 13,8–14,7 | 30–32 | Sticker BROSKIS claqué / décollé (title lock court) | — | Stinger |
| 14,7–29,5 | 32–64 | **MONTAGE** : 8 plans de 1,85 s (4 temps) : 4 armes-objets différentes (banane, peluche, téléphone, bouteille), parade ESPACE parfaite (`perfect-*`), crate Snap qui tombe, décor qui s'effondre | Alternance orbite / travelling / grue, jamais deux fois le même mouvement d'affilée | Une réplique d'animateur tous les 2 plans (`hit`, `perfect`, `crate_drop`, `feint`) |
| 29,5–40,6 | 64–88 | **ESCALADE** : 12 plans de 0,92 s (2 temps) puis 4 de 0,46 s : impacts, onomatopées collées au décor, la map s'effondre dalle par dalle | Roulis 8° à chaque perte d'équilibre, whip pans entre les coins rouge/bleu | Carton **« THE MAP FIGHTS BACK. »** · `sudden_death-*` |
| 40,6–41,1 | 88–89 | **Silence total** + noir 4 images | — | — |
| 41,1–46,6 | 89–101 | **CLIMAX** : coup final, gel d'image 0,5 s avec callout nom de l'arme, puis KO au ralenti, P2 éjecté dans le vide | Orbite lente 200° autour de la chute (ralenti ×0,25) | `ringout-*` / `ko-*` |
| 46,6–49,4 | 101–107 | Écran « K.O. » + damage report qui claque | Plan fixe | `victory-*` |
| 49,4–50,0 | — | Silence + noir | — | — |
| 50,0–60,0 | — | **Titre final** : logo BROSKIS, « Snap anything. Fight with it. », « Powered by Gemini » | Fixe (lisibilité) | Dernier sting, puis silence |

## Coupe 15 s (ouverture de démo live)

HOOK (0–1,8) → REVEAL IA (2,3–9,2 raccourci à 5 s) → 6 plans d'escalade de 0,46 s → sticker BROSKIS
+ « Snap anything. Fight with it. » (3 s tenus). La démo live enchaîne sur la vraie table d'objets.

## Pipeline technique (en place, 26/09 15h30)

```bash
# Rendu final (1080p, 30 i/s, ~25 min dans le conteneur cloud, bien moins sur un PC avec carte graphique)
node tools/trailer/render.mjs --cut 60 --fps 30 --workers 3          # → captures/trailer/broskis-trailer-60.mp4
node tools/trailer/render.mjs --cut 15 --fps 30 --workers 3          # → captures/trailer/broskis-trailer-15.mp4
# Brouillon rapide (3D en demi-résolution) d'une partie des plans (index de timeline.js)
node tools/trailer/render.mjs --cut 60 --px 0.5 --shots 8-20 --out captures/trailer-draft
```
Il faut ffmpeg : dans le PATH, ou `FFMPEG_PATH=/chemin/ffmpeg`, ou `npm i ffmpeg-static` dans un dossier hors dépôt.

- `?demo=1&trailer=60` (`src/trailer/`) : `director.ts` enchaîne les plans de `timeline.js`, `shots.ts` joue le
  VRAI gameplay (startMatch / aim / fire / parry sur les 8 armes-objets de `public/assets/presets/`), `cam.ts`
  pose la caméra (FOV fixe 40°, aucun zoom), `overlay.ts` dessine les textes-stickers et le viseur.
- `tools/trailer/virtual-time.js` fige l'horloge de la page (minuteries, requestAnimationFrame, animations CSS) :
  chaque image est calculée exactement, même si le conteneur ne rend que 3 i/s.
- `tools/trailer/render.mjs` : plusieurs onglets en parallèle, capture JPEG, encodage H.264 + planche contact.
- `tools/trailer/music.mjs` : musique 130 BPM générée par code (vi–IV–I–V), bruitages posés sur les vrais
  événements du rendu (tir, impact, parade, K.O., textes qui claquent), voix de l'animateur et réplique Gradium
  de l'arme (`public/assets/presets/rubber-duck.wav`), musique baissée de 7 dB sous la voix.

## Veille (changements du jeu qui touchent le trailer)
- 15h20 · LDA2 (ciel physique `Sky`) : halo blanc face au soleil rasant → le trailer masque ce ciel (`?sky=1`
  pour le garder). À corriger dans le jeu par le propriétaire du rendu.
- 15h20 · Chaque projectile vole au moins 1,9 s (fenêtre de parade) et le 1er lancer déclenche un ralenti de
  0,7 s : les plans calent le tir sur `impactAt − durée de vol`.
- 15h20 · La fenêtre de parade désature l'écran (lot LK2) : gardé seulement sur le plan « Perfect parry! ».
