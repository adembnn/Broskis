# Suivi des lots

Réserver une ligne **avant** de commencer : nom + heure, commit + push de ce fichier seul. États : `à prendre` · `en cours` · `fait` · `bloqué`.

| Lot | Titre | Coût Claude | Responsable prévu | Dépend de | État | Pris par / heure | Notes |
|---|---|---|---|---|---|---|---|
| L0 | Fondations et contrats | moyen | Adem (session principale) | — | fait | Claude (Adem) 12h00 → 12h25 | Ajouts au contrat : événements `match:start` et `demo:cue` ; `ctx.three.uiRoot` et `ctx.three.render` (remplaçable par LA). Stubs prêts : `src/ia` (scanObject…), `src/ia/fighter`, `src/scene/sticker`, `src/scene/fighter-custom`. |
| LH | Correctifs du harnais | faible | Adem (sous-agent) | — | fait | Adem (sous-agent) 12h10 | Fusionné. Nouveaux : agent `relecteur`, hook heure, `captures --out`. À faire : skills-lock.json encore sur les 7 skills rangés. |
| DA | Direction artistique + tokens | moyen (Opus) | Adem | — | en cours | Adem (sous-agent) 12h10 | |
| LA | Rendu, persos, caméra, effets | élevé | Adem (sous-agent) | L0 | fait | Adem (sous-agent) 12h10 | Fusionné (13h). |
| LM | Maps + décor dynamique | élevé | Adem (sous-agent) | L0, packs | fait | Adem (sous-agent) 12h10 | Fusionné (13h). |
| LG | Gameplay | élevé | Adem (sous-agent) | L0 | fait | Adem (sous-agent) 12h10 | Fusionné (13h). |
| LI | Pipeline IA + serveur | moyen | Adem (sous-agent) | L0 | fait | Adem (sous-agent) 12h10 | Fusionné (13h). |
| LU | Interface | moyen | Adem (sous-agent) | L0, DA | fait | Adem (sous-agent) 12h10 | Fusionné (13h). |
| LP | Perso photo en direct | moyen | Adem (sous-agent) | LI | fait | Gemini 13h20 | Gemini, fusionné 13h35 : scan photo → attributs + visage sticker sur corps KayKit. |
| LS | Sticker 3D | faible | **Titouan** | — | fait | Titouan (Claude) 11h26 → 12h45 | Voir rendu dans plan/lots/LS-sticker-3d.md. Pas encore poussé (accès GitHub en lecture seule). |
| LV | Audio et voix | faible | **Titouan** | L0 | fait | Titouan (Claude, sous-agent) 12h46 | `npx tsc --noEmit` et `npm run build` OK. Ajout de l'événement `ui:click` dans `src/core/events.ts` (absent du contrat, nécessaire pour les clics d'interface — voir détails dans plan/lots/LV-audio.md). Test à l'oreille non fait (agent sans sortie audio) : vérifié à la place par `ctx.bus.emit(...)` en console sur tous les événements, aucune exception. |
| LP2 | Vedettes 3D préparées (sans Tripo : MCP Blender + Rodin gratuit) | faible | PC d'Adem (Gemini) | MCP Blender | à prendre | | |
| LD | Démo, vidéo, bande-annonce | faible | **Titouan** (+ Adem) | — | en cours | Titouan (Claude, sous-agent) 12h46 → 13h20 | Points 1 à 4 du lot faits : `demo/SCRIPT.md` + `demo/OBJETS.md` (8 objets) + `demo/parcours.json` (vrais hooks `GameHooks`) ; 3/4 images dans `art/references/` téléchargées (licences vérifiées), la 4e (carte cartoon) documentée dans `LISEZMOI.txt` faute d'accès direct. Reste le point 5 (vidéo/bande-annonce, à partir de 18h) une fois le jeu jouable — normal que ce ne soit pas fait maintenant. |
| LK | Parade avancée (validée par Adem) | moyen | Adem (Gemini) | LG, LA, LU, LV | en cours | Gemini 13h20 | Logique faite (Gemini, fusionnée). Reste : repères visuels, HUD, sons, NICE, feintes → LK2. |
| LE | Banc d'évaluation des animations (`npm run anim`) | moyen | Claude (sous-agent Sonnet) | — | fait | Claude 12h35 | Fusionné. `npm run anim` : 14 scénarios, score 0 tant que LAN manque (normal). Positions en mètres. |
| LAN | Animation vivante façon Smash | élevé | **Gemini** (CLI) | LA | en cours | Gemini 13h20 | Gemini CLI, branche gem/LAN |
| DASH | Tableau de bord en direct (localhost:4545) | nul | **Gemini** (CLI) | — | fait | Gemini 13h20 | Gemini, fusionné 13h35 : npm run dashboard → http://localhost:4545 |
| LBAL | Simulateur d'équilibrage + 4 niveaux de difficulté | nul | **Gemini** (CLI) | LG | en cours | Gemini 13h20 | évalué par l'agent equilibreur |
| LBK | Banque de voix « barks » (Gemini TTS Fenrir…) + lecteur | faible | **Titouan** | LV | fait | Titouan (Claude, sous-agent) 13h25 → 14h10 | 252 fichiers (192 combattants + 60 animateur), 36 Mo, 0 échec. `npx tsc --noEmit` et `npm run build` OK. Déviation documentée dans plan/lots/LBK-banque-voix.md : texte TTS envoyé SANS le préfixe de ton (le modèle le lisait à voix haute, clips 10-16 s au lieu de 2-6 s) — le ton vient de la voix prébuilt + de l'écriture en CAPS/« !!! ». Un mot banni (« legendary ») corrigé après coup. Testé en vrai dans le jeu (`ctx.bus.emit('hit', …)` → fetch + lecture OK, 0 erreur console). |
| LX | Adversaire IA (vague 2) | moyen | Adem | LG | à prendre | | |
| LW | Scandex + voix clonée (vague 2) | faible | **Titouan** (Scandex) · Gemini (voix clonée) | LI, LU | à prendre | | |
