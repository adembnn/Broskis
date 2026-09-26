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
| LS | Sticker 3D | faible | **Titouan** | — | à prendre | | Autonome, peut démarrer tout de suite |
| LV | Audio et voix | faible | **Titouan** | L0 | à prendre | | |
| LP2 | Vedettes 3D préparées (sans Tripo : MCP Blender + Rodin gratuit) | faible | PC d'Adem (Gemini) | MCP Blender | à prendre | | |
| LD | Démo, vidéo, bande-annonce | faible | **Titouan** (+ Adem) | — | à prendre | | Références visuelles dès maintenant |
| LK | Parade avancée (validée par Adem) | moyen | Adem (Gemini) | LG, LA, LU, LV | à prendre | | Spéc complète : plan/lots/LK-parade.md |
| LX | Adversaire IA (vague 2) | moyen | Adem | LG | à prendre | | |
| LW | Scandex + voix clonée (vague 2) | faible | partagé | LI, LU | à prendre | | |
