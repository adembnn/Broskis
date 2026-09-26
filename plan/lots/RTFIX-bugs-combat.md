# Lot RTFIX · Chasse aux bugs du combat temps réel (pour la démo)
Exécution : **agent Claude (Opus)** · Retour d'Adem (17h15), en regardant une démo : « à un moment, les joueurs passent SOUS LA MAP », « problèmes de collision », « sauts un peu invisibles », « choses invisibles ». Il faut le combat le plus fluide et le plus fun possible.

## Priorités
1. **Joueurs sous la map** : trouve et corrige toutes les façons de traverser le sol.
   - Vol d'éjection (`src/gameplay/launch.ts`, pas fixes) : un effet tunnel à grande vitesse est-il possible ? Il faut un rayon balayé ou des sous-pas selon la vitesse.
   - Réapparition : 2 joueurs au même point (bug vu par LPHYS).
   - Sortie du rattrapage au bord, plateformes traversables par le dessous (retraverser vers le bas), poussées des dangers de map (`startLaunch`), fin d'une glissade.
   - Garde-fou final : si un joueur est sous le sol sans être en chute légitime, il est remis sur le sol le plus proche au lieu de rester coincé dessous.
2. **Sauts et collisions invisibles** : un saut qui ne part pas, un mur invisible, une plateforme sur laquelle on ne tient pas. Utilise `gameHooks.debugColliders(true)` (lot LPHYS) pour voir les colliders. Vérifie que le saut et le double saut répondent à chaque appui.
3. **Fluidité du contrôle** : entrée → mouvement dans la même image, aucun blocage d'entrée après un coup ou une parade, caméra qui ne saute pas.
4. **Fun** : applique les meilleures idées des rapports de test, si elles sont petites et sûres.

## Coordination
- Les rapports des testeurs Gemini arrivent dans `reports/playtesteur-*.md` et `reports/critique-perf-*.md` du dépôt principal (`C:\Users\Adem\Documents\Hackathon Voodoo\Voodoo-Hack\reports\`). Lis-les au fur et à mesure et traite leurs bugs par gravité.
- **LPHYS** (session « Map design », Gemini) corrige les colliders DES MAPS (`src/scene/maps/**`). Toi, tu corriges le côté **gameplay** (`src/gameplay/**` : character, launch, movement, stocks, respawn…). Si la cause est un collider de map, fais une correction minimale et signale-la dans ton rendu.
- Petits commits ciblés, « RTFIX : … ». `git merge main` souvent.

## Contrôles
- Script reproductible pour chaque bug corrigé (`tools/rtfix/`), qui échoue avant et passe après.
- `npm run build` passe, `window.__selftest()` passe.
- Rendu `plan/rendus/RTFIX.md` : bug, cause, correctif, preuve.
