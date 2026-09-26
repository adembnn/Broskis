# Lot LWAIT · Écran d'attente du « snap » de la tête : on sait ce qui se passe, on ne part pas sans sa tête
Exécution : **agent Claude (Opus, UX)** · Demande d'Adem (17h50) : « quand je snap ma tête, il faut un écran de chargement avec des indications aux joueurs sur ce qui est en train de se passer, et on ne quitte pas cet écran jusqu'à ce que la tête soit effectivement affichée. C'est ultra important. »

## Ce que voit le joueur (par joueur, dans son encart de l'écran de choix des persos)
1. **Photo prise** : la photo recadrée s'affiche en petit, avec un flash et le son de l'appareil.
2. **Étapes en direct**, chacune qui se coche quand elle est VRAIMENT finie (branchées sur les vrais événements et promesses de `src/ia/fighter` : `scanFighterReport`, `onText`, planche face/dos, découpe, application du look) :
   - « Reading your face… » → coché + le **surnom** qui s'écrit (effet machine à écrire) et les **couleurs** qui apparaissent en pastilles ;
   - « Drawing your cartoon head (front + back)… » → animation de crayon ou de forge, puis le **dessin qui apparaît** ;
   - « Building your 3D fighter… » → le perso 3D apparaît et tourne, avec SA tête posée ;
   - « Ready! » → gros tampon.
3. Une astuce de jeu tourne en bas (composants de `src/ui/loading/**`, lot LLOAD : réutilise la forge, le texte qui s'écrit et les astuces).
4. **On ne quitte pas cet écran tant que la tête n'est pas affichée sur le perso 3D.** Le bouton « Ready to fight! » reste bloqué jusque-là, avec l'état visible. Supprime le déblocage automatique à 12 s (« your head will pop in during the fight ») pour les persos photo.
5. **Si ça échoue ou traîne** (pas de réponse à 30 s, refus, réseau coupé) : message clair et 2 boutons, « Retry » et « Use a default head ». C'est le JOUEUR qui décide, jamais une sortie automatique.
6. Les 2 joueurs scannent en parallèle : chaque encart a ses propres étapes.

## Tes chemins
`src/ui/screenFighters.ts`, `src/ui/loading/**`, et des ajouts minimaux dans `src/ia/fighter/**` pour exposer les étapes (événements ou rappels). **Pas** `src/scene/fighter-custom/**` : LFACE y ancre la tête sur le cou en ce moment.

## Contrôles
- `npm run build` passe.
- Test Playwright (port 5380-5389, un seul navigateur, GPU `--force_high_performance_gpu`) avec 2 visages fictifs et un réseau ralenti de 5 s : captures de chaque étape et de l'état « Ready ».
- Test d'échec (API coupée) : les boutons Retry et Default apparaissent, et on ne part pas sans décision.
- Captures dans `captures/lwait/`. Envoie-les à la session principale.
