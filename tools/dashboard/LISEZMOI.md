# Dashboard IA Broskis

Le tableau de bord permet de visualiser en direct l'activité de l'équipe (Claude, Gemini, Humains, Gradium) sur le projet Broskis.

## Lancer le tableau de bord

1. Lancez le serveur via npm :
```bash
npm run dashboard
```

2. Ouvrez [http://localhost:4545](http://localhost:4545) dans votre navigateur (idéalement sur un second écran ou un projecteur).

## Sources de données

Le serveur (`server.mjs`) est développé sans dépendance NPM. Il lit en temps réel :
- **`events.jsonl`** : Fil d'événements global.
- **`logs/gem-*.jsonl`** : Journaux d'actions des agents Gemini CLI.
- **`../../plan/SUIVI.md`** : Tableaux des lots à faire/en cours/faits.
- **Git** : Journaux de commits, worktrees, branche courante.
- **Rendus** : Captures PNG, rapports de scores (animation, équilibrage), fichiers vocaux, rapports d'agents.

## Comment écrire un événement

Un événement est une simple ligne JSON ajoutée à `tools/dashboard/events.jsonl`.
Vous pouvez utiliser le script Node `tools/dashboard/log.mjs` pour ajouter facilement un événement.

**Exemple d'utilisation du script :**
```bash
node tools/dashboard/log.mjs '{"source": "gemini", "kind": "build", "title": "Compilation terminée", "status": "ok"}'
```

Le serveur surveille automatiquement ce fichier (`fs.watch`) et transmet immédiatement la mise à jour à l'interface client (via Server-Sent Events).
