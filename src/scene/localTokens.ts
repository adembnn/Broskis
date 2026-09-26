// LOCAL_TOKENS — valeurs visuelles que src/art/tokens.js (direction « Vinyle », figée le 26/09) ne fournit
// toujours pas. Centralisé ici plutôt que dupliqué : tout le lot importe cette seule constante. Beaucoup
// moins fourni qu'avant la DA : les couleurs, paliers, contours, ruban, juice, durées viennent maintenant
// TOUS de tokens.js. Reste ici : géométrie de l'arène/caméra (la DA n'a pas encore de lot maps/caméra à elle)
// et quelques budgets techniques (particules, pool d'effets) qui ne sont pas des choix artistiques.
export const LOCAL_TOKENS = {
  arena: {
    // tokens.js (commentaire) : "arène ≈ 24 m" — rayon de la plate-forme provisoire tant que le lot LM
    // n'a pas posé de vraie map.
    radius: 12,
    groundY: 0,
  },
  camera: {
    fov: 45,                 // reprend la valeur posée dans core/ctx.ts (ne pas diverger)
    shoulderDistance: 6.5,   // recul derrière l'épaule du joueur actif
    shoulderHeight: 3.8,
    shoulderSide: 1.8,      // décalage latéral (vue 3/4)
    lookAhead: 4.5,          // point visé au-delà du joueur actif, vers l'adversaire
    // repli turn:start (pas de projectile en vol : tour après un SHIELD, début de match) — la bascule
    // principale utilise désormais durees.camera / juice.bascule (voir director.ts).
    arcDuration: 1.1,
    arcMaxDuration: 3,       // garde-fou (contrat : 3 s maximum)
    defenderPullBack: { distance: 1.0, height: 0.25 }, // vue du défenseur : laisse de la place à l'anneau de parade (lot LK)
    arcSwoopRadius: 1.2,     // léger envol du rayon au milieu du balayage (effet "grue")
    arcSwoopHeight: 0.6,
    // coup de FOV générique (arc de repli, impact non critique) : DA ne donne que juice.critique.fov (8°,
    // réservé aux crits) ; pas de valeur pour les autres transitions.
    arcFovPunch: 6,
    koOrbitRadius: 5.5,
    koOrbitHeight: 2.6,      // durée et nombre de tours de l'orbite : juice.victoire.ralentiMs / .orbite
    impactPushDuration: 0.32,
    impactPushAmount: 0.9,   // rapprochement (unités monde) vers le point d'impact
    occlusionOpacity: 0.2,
    occlusionFadeMs: 160,
  },
  // manifest.json (public/assets/characters) : perso KayKit ≈2,4-2,7 de haut ; ≈0,7 le ramène à l'échelle
  // "mètres" du reste du jeu (arène ≈24 m, budget de déplacement 6 m).
  fighterScale: 0.7,
  aimFallback: {
    // gravité apparente par catégorie quand `aim:update` n'a pas encore de `path` prédit (lot LG pas branché)
    gravity: { blaster: 1.5, grenade: 13, throwable: 8, shield: 0 },
    segments: 16,
  },
  damageNumbers: { life: 0.85, maxAlive: 8 },
  particles: { maxAdditive: 900, maxNormal: 260 },
  shockwave: { pool: 6 },
  // rayon au sol : géométrie/lisibilité, pas un choix d'art (l'épaisseur/bord viennent de rendu.ruban).
  movementRing: { radius: 1.0 },
} as const;
