# Lot DASH · Tableau de bord en direct (localhost)
Exécution : **Gemini** (PC d'Adem, où tournent les agents) · Coût Claude : nul

## Pourquoi
Adem ne voit le travail qu'à travers la conversation Claude Code. Il veut une page **localhost**, pédagogique, qui montre **en temps réel** ce que font **Claude** (Opus/Sonnet), **Gemini** (CLI, images, textes, voix) et **Gradium** sur le projet.

## Tes chemins
`tools/dashboard/**` **sauf** `log.mjs` et `hook-claude.mjs`, que tu gardes tels quels : ils alimentent déjà le journal. Ajoute aussi le script npm `"dashboard": "node tools/dashboard/server.mjs"` dans `package.json` : c'est la seule ligne que tu y touches.

## Sources de données (toutes locales, toutes optionnelles : rien ne doit planter si un fichier manque)
- **`dashboard/events.jsonl`** : une ligne JSON par événement (`t, source, kind, status, title, model, lot, ms, …`), écrite par :
  - les hooks Claude (sous-agents lancés et terminés) ;
  - `tools/gemini/lot.mjs` (lots et agents Gemini) ;
  - les scripts de génération ;
  - le serveur `api/*`.
- **`dashboard/logs/gem-*.jsonl`** : le flux JSON (`stream-json`) de chaque Gemini CLI en cours. Montre les 3 dernières actions en langage clair, par exemple « lit src/scene/index.ts », « lance npm run build ».
- **`plan/SUIVI.md`** : le tableau des lots, à analyser (colonnes : Lot | Titre | Coût | Responsable | Dépend de | État | Pris par | Notes).
- **Git** :
  - `git log -30 --pretty=format:%h|%an|%ar|%s` ;
  - `git worktree list` (copies de travail en cours = agents au travail) ;
  - la branche courante.
- **Résultats** :
  - `captures/**/*.png` (les plus récentes) ;
  - `captures/anim/rapport.json` (score animation /100) et `captures/anim/gemini-verdict.json` ;
  - `captures/balance/rapport.json` ;
  - `reports/*.md` (rapports d'agents) et `plan/rendus/*.md` ;
  - `public/assets/presets/presets.json` (armes) et `public/assets/voices/manifest.json` (banque de voix, si elle existe).
- **Horaire du jour** : gel à 18h00, opt-in à 19h00, démo à 20h00.

## Sortie attendue
1. **`tools/dashboard/server.mjs`** : Node pur, aucun paquet, sur http://localhost:4545.
   - `GET /` : la page.
   - `GET /api/state` : l'état agrégé en JSON.
   - `GET /events` : Server-Sent Events, qui pousse l'état à chaque changement (`fs.watch` sur les fichiers ci-dessus, et git interrogé toutes les 5 s).
   - `GET /files/<chemin>` : sert en lecture les images, l'audio et le markdown du dépôt, en refusant `.env` et tout chemin hors du dépôt.
2. **`tools/dashboard/index.html`** (+ css et js dans le même dossier), en français, **très pédagogique** :
   - **En-tête** : compte à rebours avant 18h00, 19h00 et 20h00, avec une phrase « ce qui compte maintenant ».
   - **« Qui travaille en ce moment »** : 3 colonnes, **Claude**, **Gemini** et **Gradium**. Chaque tâche en cours est une carte : quoi (en français), modèle, depuis combien de temps, dernières actions. Les tâches finies s'estompent.
   - **« Le fil »** : la chronologie des 60 derniers événements, du plus récent au plus ancien, avec une icône par source et des phrases lisibles par un non-technicien.
   - **« Les lots »** : un tableau à 3 colonnes (à prendre, en cours, fait) construit depuis `SUIVI.md`, avec le responsable (Adem, Titouan, Gemini, Claude).
   - **« Ce qui vient d'être produit »** :
     - la dernière capture du jeu ;
     - les stickers d'armes ;
     - des lecteurs audio pour les voix ;
     - les scores (animation, équilibrage) avec leur seuil ;
     - les derniers rapports d'agents (titre + 3 premières lignes, puis lien).
   - **« Comprendre »** : un petit lexique repliable (lot, worktree, agent, fusion, Gemini CLI, Voice Design, tokens) en 1 phrase chacun.
   - Style : direction « Vinyle » du jeu (`src/art/tokens.js` : encre `#2B1D14`, papier `#F3E3C3`, carton `#C49A6C`, marge vinyle `#F0E9DC`, polices Lilita One et Nunito). Une couleur par source :
     - Claude `#D97757` ;
     - Gemini `#2F7DE1` ;
     - Gradium `#1E8E5A` ;
     - Humain `#E0452B`.
   - Lisible sur un projecteur ; rien ne défile tout seul.
3. **`tools/dashboard/LISEZMOI.md`** : comment lancer (`npm run dashboard`) et comment un script écrit un événement.

## Contrôles
- `node --check` sur les scripts.
- Lance le serveur, puis `curl -s localhost:4545/api/state` doit renvoyer un JSON.
- Ajoute un événement de test avec `node tools/dashboard/log.mjs '{...}'` : il doit apparaître dans `/api/state`.
- Arrête le serveur avant de rendre.
- `npm run build` passe.
