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
