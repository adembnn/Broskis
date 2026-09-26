# Lot LPROPANIM2 · Décor qui réagit avec du poids (ressorts, contact des persos)
Exécution : **Gemini CLI**, délégué par la session Claude « Map design ». Source : `plan/rendus/REVUE-ANIM-17h36.md` (point 10).
Fichier : `src/scene/maps/prop-anim.ts` uniquement (+ tokens dans `src/scene/maps/tokens.ts`).

## À faire
1. Remplacer toutes les interpolations linéaires par des **ressorts amortis avec dépassement** (ex. raideur ~180, amortissement ~12, comme `src/scene/animation/animator.ts`) : l'objet dépasse sa position de repos puis revient en oscillant 2-3 fois.
2. Impact de projectile : écrasement 30 % (au lieu de 20 %) + **bascule de 10° à l'opposé du point d'impact** (direction depuis `hit`/`projectile` → objet), petite rotation aléatoire ±6°.
3. **Contact des persos** : un joueur qui court dans un tonneau, une caisse, un bocal ou un flacon le fait vaciller (bascule 6° dans le sens de la course, ressort) — détecte la proximité (< rayon de l'objet + 0,5 m) et la vitesse du joueur depuis `window.gameState` / `ctx.state.players`, au plus une réaction par 0,5 s par objet.
4. Atterrissage sur une plateforme : enfoncement 4 cm + ressort (garde l'existant, passe-le en ressort).
Valeurs dans les tokens. Aucun changement de collision.

## Preuve (dernière version)
`git rebase main` au début et avant le commit final ; ton Vite sur un port 5304-5309 ; `startMatch({ map, split: true })`, `phase === 'fight'`. Captures **réelles** (jamais « simulées ») en rafale (−50/+50/+150/+300/+600 ms) d'un tonneau touché et d'un joueur qui court dans une caisse, sur 2 maps, dans `captures/lpropanim2/`. `npm run build` passe. Arrête ton Vite (ton PID seulement). Rendu : `plan/rendus/LPROPANIM2.md`.
