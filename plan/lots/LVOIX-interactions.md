# Lot LVOIX · Chaque combattant parle à chaque interaction, avec la voix de son joueur
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». Demande d'Adem (17h14). **Fini et commité à 17h55.**
Lis `CLAUDE.md`, `plan/lots/LBK-banque-voix.md`, `plan/lots/LW2-voix-clonee.md`, `plan/lots/LVOX-une-seule-voix.md`, `src/audio/barks.ts` (lecteur unique, `setVoiceOverride`, cooldowns), `src/ia/voice/index.ts` (clonage Gradium : 12 s de micro → voix du joueur), `src/core/events.ts`, `plan/PIVOT-TEMPS-REEL.md`.

## Objectif
En temps réel, **chaque interaction importante fait parler le combattant concerné**, avec sa propre voix :
- voix = la voix clonée du joueur (Gradium) s'il l'a enregistrée ; sinon une voix de la banque choisie **selon qui est le perso** (chevalier, mage, voleur, perso photo : ton et répliques qui collent à sa personnalité/son surnom de ring) ;
- événements à couvrir (vérifie les noms réels dans events.ts, ne crée pas de doublon de répliques) : tir chargé lâché, coup reçu (léger / fort), parade parfaite réussie, blocage, double saut, perte de vie (cri d'éjection), réapparition (« I'm back! »), ramassage de la Caisse Snap, provocation quand l'adversaire rate, victoire, défaite ;
- rythme : jamais 2 répliques du même perso en moins de 1,2 s, jamais par-dessus l'animateur (lecteur unique LVOX), priorité aux événements rares (KO, parade parfaite) ; variantes pour ne pas répéter la même phrase 2 fois de suite ;
- si la voix clonée n'est pas encore prête ou que Gradium échoue : banque de voix, jamais de silence gênant ni d'erreur à l'écran ;
- vérifie le parcours « le joueur enregistre sa voix » dans l'UI existante (bouton micro de l'écran combattant, `src/ui/screenFighters.ts` / `src/ia/voice/`) : qu'il fonctionne en temps réel et que la voix obtenue est bien routée vers SON perso (P1 ou P2). Corrige seulement ce qui bloque.

## Périmètre
`src/audio/barks.ts`, `src/ia/voice/**`, génération de répliques manquantes dans `public/assets/voices/` (outil existant `tools/voices/` : lis-le). Changements minimaux dans `src/ui/screenFighters.ts` si le bouton micro bloque (LUX/LFACE de l'autre session y travaillent : signale chaque ligne). Interdits : `src/gameplay/**`, `src/scene/**`.

## Preuve
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5380-5389 ; `startMatch({ split: true })`, `phase === 'fight'` ; journal horodaté (console) de chaque réplique jouée pendant 60 s de combat scripté par `gameHooks.input` des 2 joueurs (qui parle, quel événement, quelle voix : clonée/banque, latence) dans `plan/rendus/LVOIX.md`. `npm run build` passe. Arrête ton Vite (ton PID seulement).
