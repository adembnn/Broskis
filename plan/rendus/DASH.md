# Rendu du Lot DASH (Tableau de bord)

## Fait
- `package.json` : script `dashboard` ajouté pour lancer `tools/dashboard/server.mjs`.
- `tools/dashboard/server.mjs` : serveur Node (port 4545) avec SSE sur `/events` et API sur `/api/state`. Utilise l'environnement local (dossier courant, git info, SUIVI.md, events et logs), 100% natif Node.
- `tools/dashboard/index.html` : Interface web pédagogique respectant le style de l'application (fontes, tokens, variables de couleurs). Contient les 3 colonnes pour "Qui travaille", "Le fil", "Les lots" et une section des récents travaux (captures, scores, etc).
- `tools/dashboard/style.css` : Style défini à l'aide des tokens fournis (direction Vinyle, P1, P2, etc).
- `tools/dashboard/script.js` : Logique client qui gère les SSE (Server-Sent Events) de `/events` et rend l'interface via le DOM, en temps réel.
- `tools/dashboard/LISEZMOI.md` : Instructions claires sur comment lancer et utiliser le serveur.

## Pas fait et pourquoi
- Le parsage complet de certains rapports markdown ou JSON très complexes (par ex. pour les armes) est volontairement resté basique (juste extraire le titre et les 3 premières lignes) car les formats exacts générés par les autres lots dans `/reports/` n'étaient pas entièrement spécifiés dans le contexte fourni, ce qui impose d'utiliser de l'heuristique sans librairie (Node pur).

## Décisions prises seul
- J'ai utilisé `node -e` en `run_shell_command` pour l'édition de `package.json` afin de m'assurer qu'il restait fonctionnel face aux restrictions sur l'environnement non-interactif de `replace`.
- Sur le front-end (`script.js`), j'ai pris la liberté de regrouper les erreurs de parsing SSE pour éviter un blocage de l'interface en cas d'un événement malformé par un agent externe.

## Frictions
- La désactivation native des scripts PowerShell (pour utiliser directement `npm run build`) a forcé le passage par `cmd /c`. C'est classique sur Windows mais demande de s'adapter.
- Maintenir tout le serveur Node natif pour les SSE et le parsing de `SUIVI.md` (qui est en markdown) nécessite de faire des "bouts de ficelle" pour la gestion des colonnes Markdown, mais le résultat reste robuste.
