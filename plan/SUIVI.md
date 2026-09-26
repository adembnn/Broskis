# Suivi des lots

Réserver une ligne **avant** de commencer : nom + heure, commit + push de ce fichier seul. États : `à prendre` · `en cours` · `fait` · `bloqué`.

| Lot | Titre | Coût Claude | Responsable prévu | Dépend de | État | Pris par / heure | Notes |
|---|---|---|---|---|---|---|---|
| L0 | Fondations et contrats | moyen | Adem (session principale) | — | fait | Claude (Adem) 12h00 → 12h25 | Ajouts au contrat : événements `match:start` et `demo:cue` ; `ctx.three.uiRoot` et `ctx.three.render` (remplaçable par LA). Stubs prêts : `src/ia` (scanObject…), `src/ia/fighter`, `src/scene/sticker`, `src/scene/fighter-custom`. |
| LH | Correctifs du harnais | faible | Adem (sous-agent) | — | fait | Adem (sous-agent) 12h10 | Fusionné. Nouveaux : agent `relecteur`, hook heure, `captures --out`. À faire : skills-lock.json encore sur les 7 skills rangés. |
| DA | Direction artistique + tokens | moyen (Opus) | Adem | — | en cours | Adem (sous-agent) 12h10 | |
| LA | Rendu, persos, caméra, effets | élevé | Adem (sous-agent) | L0 | en cours | Adem (sous-agent) 12h10 | |
| LM | Maps + décor dynamique | élevé | Adem (sous-agent) | L0, packs | en cours | Adem (sous-agent) 12h10 | Packs téléchargés dans public/assets/packs (hexagon, pirate, restaurant, furniture). |
| LG | Gameplay | élevé | Adem (sous-agent) | L0 | en cours | Adem (sous-agent) 12h10 | Parade : attendre la validation d'Adem |
| LI | Pipeline IA + serveur | moyen | Adem (sous-agent) | L0 | en cours | Adem (sous-agent) 12h10 | |
| LU | Interface | moyen | Adem (sous-agent) | L0, DA | en cours | Adem (sous-agent) 12h10 | |
| LP | Perso photo en direct | moyen | Adem (sous-agent) | LI | à prendre | | |
| LS | Sticker 3D | faible | **Titouan** | — | fait | Titouan (Claude) 11h26 → 12h45 | Voir rendu dans plan/lots/LS-sticker-3d.md. Pas encore poussé (accès GitHub en lecture seule). |
| LV | Audio et voix | faible | **Titouan** | L0 | fait | Titouan (Claude, sous-agent) 12h46 | `npx tsc --noEmit` et `npm run build` OK. Ajout de l'événement `ui:click` dans `src/core/events.ts` (absent du contrat, nécessaire pour les clics d'interface — voir détails dans plan/lots/LV-audio.md). Test à l'oreille non fait (agent sans sortie audio) : vérifié à la place par `ctx.bus.emit(...)` en console sur tous les événements, aucune exception. |
| LP2 | Vedettes 3D préparées (sans Tripo : MCP Blender + Rodin gratuit) | faible | PC d'Adem (Gemini) | MCP Blender | à prendre | | |
| LD | Démo, vidéo, bande-annonce | faible | **Titouan** (+ Adem) | — | en cours | Titouan (Claude, sous-agent) 12h46 → 13h20 | Points 1 à 4 du lot faits : `demo/SCRIPT.md` + `demo/OBJETS.md` (8 objets) + `demo/parcours.json` (vrais hooks `GameHooks`) ; 3/4 images dans `art/references/` téléchargées (licences vérifiées), la 4e (carte cartoon) documentée dans `LISEZMOI.txt` faute d'accès direct. Reste le point 5 (vidéo/bande-annonce, à partir de 18h) une fois le jeu jouable — normal que ce ne soit pas fait maintenant. |
| LK | Parade avancée (validée par Adem) | moyen | Adem (Gemini) | LG, LA, LU, LV | à prendre | | Spéc complète : plan/lots/LK-parade.md |
| LE | Banc d'évaluation des animations (`npm run anim`) | moyen | Claude (sous-agent Sonnet) | — | fait | Claude 12h35 | Fusionné. `npm run anim` : 14 scénarios, score 0 tant que LAN manque (normal). Positions en mètres. |
| LAN | Animation vivante façon Smash | élevé | **Gemini** (CLI) | LA | à prendre | | Spéc : plan/lots/LAN-animation.md ; évaluée par `animateur-exigeant` + juge vidéo Gemini |
| LX | Adversaire IA (vague 2) | moyen | Adem | LG | à prendre | | |
| LW | Scandex + voix clonée (vague 2) | faible | partagé | LI, LU | à prendre | | |
