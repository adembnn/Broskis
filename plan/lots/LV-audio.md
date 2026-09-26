# Lot LV · Audio : bruitages, musique, voix de l'animateur
Responsable : **Titouan** · Coût : faible · Dépend de : L0 (bus et noms d'événements dans `src/core/events.ts`)

## Tes chemins
`src/audio/**` (rien d'autre)

## À reprendre
`reference/bagarre-de-taverne/src/audio.js` : sons synthétisés en WebAudio, sans fichier à télécharger.

## Sortie attendue (`install(ctx)` dans `src/audio/index.ts`)
1. **Bruitages** : un son par événement du bus, avec une variation de hauteur de ±5 % à chaque lecture.
   - `fire` (un son par catégorie : blaster, grenade, throwable, shield) ;
   - `hit` (plus grave si coup critique) ;
   - `parry:result` (perfect = aigu métallique, good, miss) ;
   - `ko`, `ringout`, `crate:land` et `crate:grab` ;
   - `map:warn` et `map:event` ;
   - `turn:start` (une sorte de « swoosh ») ;
   - les clics d'interface.
2. **Musique** : une boucle simple et entraînante, synthétisée ou jouée par séquenceur, qui monte en tension pendant la mort subite.
3. **Voix de l'animateur** : écoute `commentary:line` (`{text, priority, audioUrl?}`).
   - Une file par priorité ; une réplique en retard de plus de 1,5 s est jetée.
   - La musique baisse pendant que la voix parle.
   - Sans `audioUrl` : rien à jouer, les sous-titres sont affichés par l'interface.
4. Un bouton muet : touche M.

## Contrôles
`npm run build`. Dans la console du jeu, `ctx.bus.emit('hit', {...})` et les autres événements doivent jouer leur son. Test à l'oreille, yeux fermés : comprend-on ce qui se passe ?

## Commit
Tes fichiers seulement, puis `git pull --no-rebase`, `git push`, et mise à jour de `plan/SUIVI.md`.

## Rendu (4 points)

**Fait :**
- `src/audio/engine.ts` : moteur WebAudio partagé (`AudioEngine`), repris de `reference/bagarre-de-taverne/src/audio.js` — `tone()`/`noise()` synthétisés, bus de gains master → sfx / musique / voix, `detune(freq)` pour la variation ±5 % de hauteur, démarrage différé au premier geste utilisateur (pointerdown/keydown), touche M → `toggleMuted()`.
- `src/audio/sfx.ts` : un son par événement demandé — `fire` (4 sons par catégorie), `hit` (plus grave + plus fort si `crit`), `parry:result` (perfect = arpège aigu métallique + bruit filtré haut, good = simple triangle, miss = sawtooth grave), `ko` (arpège descendant), `ringout`, `crate:land`, `crate:grab`, `map:warn`, `map:event`, `turn:start` (swoosh + ping), et `ui:click`.
- `src/audio/music.ts` : `MusicDirector`, boucle basse + arpège (la mineure) programmée avec un ordonnanceur « lookahead » (setInterval 100 ms, programmation 250 ms à l'avance sur `AudioContext.currentTime`) ; relit `state.suddenDeath` à chaque pas pour doubler le tempo, ajouter une percussion synthétisée et passer l'arpège en dents de scie pendant la mort subite ; expose `duck(active)` pour la voix.
- `src/audio/commentary.ts` : `CommentaryQueue` — file triée par priorité (plus grand = plus important, FIFO à égalité), réplique jetée si `performance.now() - enqueuedAt > 1500 ms` au moment où elle arrive en tête de file, ducking musique pendant la lecture d'un `audioUrl`, rien à jouer sinon (les sous-titres restent à la charge de l'UI).
- `src/audio/index.ts` : `install(ctx)` qui assemble tout, gère la touche M (ignorée si le focus est dans un champ texte).

**Décisions prises seul (à valider si besoin) :**
- Ajout de l'événement `ui:click: { kind?: string }` dans `src/core/events.ts` : le contrat n'avait aucun événement pour les clics d'interface, requis par ce lot mais pas encore émis par le lot LU (interface pas encore écrite au moment du rendu). Le lot LU n'a qu'à faire `ctx.bus.emit('ui:click', {})` sur les boutons pour que le son joue.
- Priorité de la file de l'animateur : le contrat ne précise pas le sens de `priority`. J'ai choisi *plus grand nombre = plus prioritaire* (convention la plus intuitive côté game design). À ajuster si le lot qui émet `commentary:line` (LI) fait l'inverse.
- Musique synthétisée par séquenceur (pas de fichier audio), pour rester cohérent avec la contrainte « rien à télécharger » du lot et éviter tout asset supplémentaire.

**Pas fait / limites connues :**
- Test « à l'oreille, yeux fermés » non réalisable depuis cet environnement (agent sans sortie audio/microphone). Vérification faite autrement : `npm run build` passe, et dans la preview du jeu (`http://localhost:5183/`) j'ai rejoué en console `ctx.bus.emit(...)` pour chaque événement (`fire` ×4 catégories, `hit` normal/crit, `parry:result` ×3 grades, `ko`, `ringout`, `crate:land`, `crate:grab`, `map:warn`, `map:event`, `turn:start`, `ui:click`, `commentary:line` avec et sans `audioUrl`) et deux bascules de la touche M : aucune exception levée, aucun nœud WebAudio en erreur dans la console (les seules erreurs présentes venaient du lot LS, sans rapport). Un humain avec des enceintes doit encore confirmer le ressenti sonore final.
- Pas de mixage/normalisation avancée des niveaux entre les sons (volumes réglés à l'oreille depuis la lecture du code de référence, pas testés côté audio réel) : à corriger après un premier retour à l'oreille.
